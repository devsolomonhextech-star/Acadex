"""School notices: admins push an in-app alert (and a push) to chosen parents."""
import os
from uuid import UUID

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Guardian, MembershipRole, SchoolMembership, StudentGuardian, User
from app.security import hash_password

PARENT_PASSWORD = "parent-portal-pass-123"


async def _admin_session(client, slug: str):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": f"Notices {slug}",
        "school_slug": slug,
        "administrator_name": "Notice Admin",
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug,
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _student(client, headers, admission: str, first: str, last: str, year_id: str, class_id: str):
    created = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": admission, "first_name": first, "last_name": last,
    })
    assert created.status_code == 201, created.text
    enrolled = await client.post("/api/v1/academic/enrollments", headers=headers, json={
        "academic_year_id": year_id, "class_group_id": class_id,
        "student_id": created.json()["id"], "enrolled_on": "2026-09-02",
    })
    assert enrolled.status_code == 201, enrolled.text
    return created.json()["id"]


async def _guardian(client, headers, student_id: str, email: str, first: str, last: str):
    created = await client.post("/api/v1/guardians", headers=headers, json={
        "student_id": student_id, "first_name": first, "last_name": last,
        "relationship": "parent", "email": email, "is_primary": True,
    })
    assert created.status_code == 201, created.text
    return created.json()["guardian_id"]


async def _attach_guardian(guardian_id: str, student_id: str) -> None:
    """Link one guardian record to a second child (the app models one parent, many children)."""
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        guardian = await session.get(Guardian, UUID(guardian_id))
        assert guardian is not None
        session.add(StudentGuardian(
            school_id=guardian.school_id,
            student_id=UUID(student_id),
            guardian_id=guardian.id,
            is_primary=False,
        ))
        await session.commit()
    await engine.dispose()


async def _give_portal_access(guardian_id: str, email: str, display_name: str) -> None:
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        guardian = await session.get(Guardian, UUID(guardian_id))
        assert guardian is not None
        user = User(email=email, display_name=display_name, password_hash=hash_password(PARENT_PASSWORD))
        session.add(user)
        await session.flush()
        session.add(SchoolMembership(
            school_id=guardian.school_id, user_id=user.id, role=MembershipRole.PARENT,
        ))
        guardian.user_id = user.id
        await session.commit()
    await engine.dispose()


async def _parent_session(client, slug: str, email: str):
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": email, "password": PARENT_PASSWORD,
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _setup(client, slug: str):
    headers = await _admin_session(client, slug)
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    assert year.status_code == 201, year.text
    year_id = year.json()["id"]
    classes = {}
    for name, grade in (("Primary 4", "Primary 4"), ("Primary 5", "Primary 5")):
        created = await client.post("/api/v1/academic/classes", headers=headers, json={
            "academic_year_id": year_id, "name": name, "grade_level": grade, "stream": "A",
        })
        assert created.status_code == 201, created.text
        classes[name] = created.json()["id"]

    first = await _student(client, headers, "NT-001", "Ama", "Mensah", year_id, classes["Primary 4"])
    second = await _student(client, headers, "NT-002", "Kofi", "Mensah", year_id, classes["Primary 4"])
    third = await _student(client, headers, "NT-003", "Kojo", "Owusu", year_id, classes["Primary 5"])

    # One mother, two children in the same class: she must still be counted once.
    mother = await _guardian(client, headers, first, f"one-{slug}@example.com", "Ama", "Mensah")
    await _attach_guardian(mother, second)
    father = await _guardian(client, headers, third, f"two-{slug}@example.com", "Yaw", "Owusu")
    # A guardian without a portal login can never receive a notice.
    await _guardian(client, headers, second, f"three-{slug}@example.com", "No", "Portal")

    await _give_portal_access(mother, f"one-{slug}@example.com", "Ama Mensah")
    await _give_portal_access(father, f"two-{slug}@example.com", "Yaw Owusu")
    return {
        "headers": headers,
        "classes": classes,
        "students": {"first": first, "second": second, "third": third},
        "emails": {"mother": f"one-{slug}@example.com", "father": f"two-{slug}@example.com"},
    }


async def test_preview_resolves_only_parents_with_portal_access(client):
    route = "notices-scope"
    context = await _setup(client, route)
    headers = context["headers"]

    everyone = await client.get(
        "/api/v1/communications/notifications/preview", headers=headers,
        params={"audience": "all_parents"},
    )
    assert everyone.status_code == 200, everyone.text
    # Mother and father have logins; the third guardian record does not.
    assert everyone.json()["recipients"] == 2

    primary = await client.get(
        "/api/v1/communications/notifications/preview", headers=headers,
        params={"audience": "class", "class_group_id": context["classes"]["Primary 4"]},
    )
    assert primary.status_code == 200, primary.text
    # Both children of the mother sit in Primary 4; she is one recipient.
    assert primary.json()["recipients"] == 1

    primary_five = await client.get(
        "/api/v1/communications/notifications/preview", headers=headers,
        params={"audience": "class", "class_group_id": context["classes"]["Primary 5"]},
    )
    assert primary_five.json()["recipients"] == 1

    one_child = await client.get(
        "/api/v1/communications/notifications/preview", headers=headers,
        params={"audience": "student", "student_id": context["students"]["first"]},
    )
    assert one_child.json()["recipients"] == 1

    missing_class = await client.get(
        "/api/v1/communications/notifications/preview", headers=headers,
        params={"audience": "class"},
    )
    assert missing_class.status_code == 422, missing_class.text

    unknown_class = await client.get(
        "/api/v1/communications/notifications/preview", headers=headers,
        params={"audience": "class", "class_group_id": "00000000-0000-0000-0000-000000000001"},
    )
    assert unknown_class.status_code == 404, unknown_class.text


async def test_sending_a_notice_reaches_parents_and_is_recorded(client):
    route = "notices-send"
    context = await _setup(client, route)
    headers = context["headers"]

    sent = await client.post("/api/v1/communications/notifications", headers=headers, json={
        "title": "School closes early on Friday",
        "body": "Classes end at 12:30pm this Friday for staff training. Buses leave at 12:45pm.",
        "audience": "all_parents",
    })
    assert sent.status_code == 201, sent.text
    campaign = sent.json()
    assert campaign["recipient_count"] == 2
    assert campaign["audience"] == "all_parents"
    assert campaign["sent_by"] == "Notice Admin"

    # Every addressed parent sees the message in the app's notification list.
    for email in context["emails"].values():
        parent = await _parent_session(client, route, email)
        inbox = await client.get("/api/v1/notifications", headers=parent)
        assert inbox.status_code == 200, inbox.text
        notice = next(item for item in inbox.json() if item["type"] == "school_notice")
        assert notice["title"] == "School closes early on Friday"
        assert notice["link"] == "/notifications"

    # A class notice only reaches that class, and counts the mother once.
    class_notice = await client.post("/api/v1/communications/notifications", headers=headers, json={
        "title": "Primary 4 reading morning",
        "body": "Please send your child with a favourite book on Thursday.",
        "audience": "class",
        "class_group_id": context["classes"]["Primary 4"],
    })
    assert class_notice.status_code == 201, class_notice.text
    assert class_notice.json()["recipient_count"] == 1
    assert class_notice.json()["class_group_id"] == context["classes"]["Primary 4"]

    # History is newest first and carries the sender.
    history = await client.get("/api/v1/communications/notifications", headers=headers)
    assert history.status_code == 200, history.text
    titles = [item["title"] for item in history.json()]
    assert titles == ["Primary 4 reading morning", "School closes early on Friday"]

    # A teacher cannot send notices; a parent cannot either.
    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=headers, json={
        "email": "notice-teacher@example.com", "display_name": "Notice Teacher",
    })
    await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": "teacher-long-secure-password",
    })
    teacher_login = await client.post("/api/v1/auth/login", json={
        "school_slug": route, "email": "notice-teacher@example.com", "password": "teacher-long-secure-password",
    })
    teacher = {"Authorization": f"Bearer {teacher_login.json()['access_token']}"}
    denied = await client.post("/api/v1/communications/notifications", headers=teacher, json={
        "title": "Not allowed", "body": "Teachers should not broadcast to families.",
        "audience": "all_parents",
    })
    assert denied.status_code == 403, denied.text

    parent = await _parent_session(client, route, context["emails"]["mother"])
    parent_denied = await client.post("/api/v1/communications/notifications", headers=parent, json={
        "title": "Not allowed", "body": "Parents should not broadcast to other families.",
        "audience": "all_parents",
    })
    assert parent_denied.status_code == 403, parent_denied.text


async def test_notices_are_tenant_scoped(client):
    route = "notices-tenant"
    context = await _setup(client, route)
    assert (await client.post("/api/v1/communications/notifications", headers=context["headers"], json={
        "title": "Own school only", "body": "This notice belongs to the first school.",
        "audience": "all_parents",
    })).status_code == 201

    other = await _admin_session(client, "notices-other")
    assert (await client.get("/api/v1/communications/notifications", headers=other)).json() == []
    crossed = await client.post("/api/v1/communications/notifications", headers=other, json={
        "title": "Reaching into another school",
        "body": "This must not resolve the other tenant's class.",
        "audience": "class",
        "class_group_id": context["classes"]["Primary 4"],
    })
    assert crossed.status_code == 404, crossed.text
    assert (await client.get(
        "/api/v1/communications/notifications/preview", headers=other,
        params={"audience": "student", "student_id": context["students"]["first"]},
    )).status_code == 404
