"""Marking a student absent must alert every linked parent with portal access."""
import os

from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Guardian, MembershipRole, SchoolMembership, User, utcnow
from app.security import hash_password

PARENT_PASSWORD = "parent-portal-pass-123"


async def _mark_email_verified(email: str) -> None:
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        await session.execute(
            update(User)
            .where(func.lower(User.email) == email.lower())
            .values(email_verified_at=utcnow())
        )
        await session.commit()
    await engine.dispose()


async def _admin_session(client, slug: str):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": f"Attendance alerts {slug}",
        "school_slug": slug,
        "administrator_name": "Attendance Admin",
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    await _mark_email_verified(f"admin-{slug}@example.com")
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _setup(client, slug: str) -> dict:
    headers = await _admin_session(client, slug)
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    assert year.status_code == 201, year.text
    group = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year.json()["id"], "name": "Primary 4",
        "grade_level": "Primary 4", "stream": "A",
    })
    assert group.status_code == 201, group.text
    student = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": "AT-101", "first_name": "Kofi", "last_name": "Boateng",
        "date_of_birth": "2015-06-20",
    })
    assert student.status_code == 201, student.text
    enrollment = await client.post("/api/v1/academic/enrollments", headers=headers, json={
        "academic_year_id": year.json()["id"], "class_group_id": group.json()["id"],
        "student_id": student.json()["id"], "enrolled_on": "2026-09-02",
    })
    assert enrollment.status_code == 201, enrollment.text
    guardian = await client.post("/api/v1/guardians", headers=headers, json={
        "student_id": student.json()["id"], "first_name": "Akosua", "last_name": "Boateng",
        "relationship": "mother", "phone": "+233200000002",
        "email": f"parent-{slug}@example.com", "is_primary": True,
    })
    assert guardian.status_code == 201, guardian.text

    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        guardian_row = await session.get(Guardian, guardian.json()["guardian_id"])
        assert guardian_row is not None
        parent_user = User(
            email=f"parent-{slug}@example.com", display_name="Akosua Boateng",
            password_hash=hash_password(PARENT_PASSWORD), email_verified_at=utcnow(),
        )
        session.add(parent_user)
        await session.flush()
        session.add(SchoolMembership(
            school_id=guardian_row.school_id, user_id=parent_user.id,
            role=MembershipRole.PARENT,
        ))
        guardian_row.user_id = parent_user.id
        await session.commit()
    await engine.dispose()

    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"parent-{slug}@example.com",
        "password": PARENT_PASSWORD,
    })
    assert signed_in.status_code == 200, signed_in.text
    return {
        "admin": headers,
        "parent": {"Authorization": f"Bearer {signed_in.json()['access_token']}"},
        "class_id": group.json()["id"],
        "student_id": student.json()["id"],
    }


async def _mark(client, ctx: dict, day: str, status: str):
    saved = await client.put("/api/v1/attendance/sheet", headers=ctx["admin"], json={
        "class_group_id": ctx["class_id"], "attendance_date": day,
        "marks": [{"student_id": ctx["student_id"], "status": status}],
    })
    assert saved.status_code == 200, saved.text
    return saved


async def _parent_alerts(client, ctx: dict) -> list[dict]:
    response = await client.get("/api/v1/notifications", headers=ctx["parent"])
    assert response.status_code == 200, response.text
    return [item for item in response.json() if item["type"] == "attendance_absent"]


async def test_marking_absent_notifies_the_linked_parent(client):
    ctx = await _setup(client, "att-alert")
    await _mark(client, ctx, "2026-11-02", "absent")

    alerts = await _parent_alerts(client, ctx)
    assert len(alerts) == 1, alerts
    alert = alerts[0]
    assert alert["title"] == "Absence recorded"
    assert alert["body"] == (
        "Kofi Boateng was marked absent on Monday, 2 November 2026. "
        "Send a reason from Acadex."
    )
    # The alert links to the exact child and day so the app can open the reason sheet.
    assert alert["link"] == f"/notifications?student_id={ctx['student_id']}&date=2026-11-02"

    # Present marks, and re-saving the same absence, must not create new alerts.
    await _mark(client, ctx, "2026-11-02", "present")
    await _mark(client, ctx, "2026-11-02", "absent")
    assert len(await _parent_alerts(client, ctx)) == 2

    # The school's own inbox does not receive the parent-facing absence alert.
    school_alerts = await client.get("/api/v1/notifications", headers=ctx["admin"])
    assert school_alerts.status_code == 200
    assert not [i for i in school_alerts.json() if i["type"] == "attendance_absent"]
