"""Parent Intelligence: insights come only from records the school entered."""
import os
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.domain.parent_insights import insights_for_student
from app.models import (
    Assessment,
    AssessmentScore,
    AttendanceRecord,
    AttendanceSession,
    Guardian,
    MembershipRole,
    School,
    SchoolMembership,
    Student,
    StudentInvoice,
    User,
    utcnow,
)
from app.security import hash_password

PARENT_PASSWORD = "parent-portal-pass-123"
ADMIN_PASSWORD = "correct-horse-battery-staple"


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
        "school_name": f"Intelligence {slug}",
        "school_slug": slug,
        "administrator_name": "Insight Admin",
        "email": f"admin-{slug}@example.com",
        "password": ADMIN_PASSWORD,
    })
    assert created.status_code == 201, created.text
    await _mark_email_verified(f"admin-{slug}@example.com")
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"admin-{slug}@example.com", "password": ADMIN_PASSWORD,
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _setup(client, slug: str) -> dict:
    """A class with one student, one subject, one linked guardian with portal access."""
    admin = await _admin_session(client, slug)
    year = await client.post("/api/v1/academic/years", headers=admin, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    assert year.status_code == 201, year.text
    term = await client.post("/api/v1/academic/terms", headers=admin, json={
        "academic_year_id": year.json()["id"], "name": "Term 1", "ordinal": 1,
        "starts_on": "2026-09-01", "ends_on": "2026-12-15",
    })
    assert term.status_code == 201, term.text
    group = await client.post("/api/v1/academic/classes", headers=admin, json={
        "academic_year_id": year.json()["id"], "name": "Primary 4",
        "grade_level": "Primary 4", "stream": "A",
    })
    assert group.status_code == 201, group.text
    student = await client.post("/api/v1/students", headers=admin, json={
        "admission_number": "PI-101", "first_name": "Ama", "last_name": "Mensah",
        "date_of_birth": "2015-04-12",
    })
    assert student.status_code == 201, student.text
    enrollment = await client.post("/api/v1/academic/enrollments", headers=admin, json={
        "academic_year_id": year.json()["id"], "class_group_id": group.json()["id"],
        "student_id": student.json()["id"], "enrolled_on": "2026-09-02",
    })
    assert enrollment.status_code == 201, enrollment.text
    subject = await client.post("/api/v1/academic/subjects", headers=admin, json={
        "code": "math", "name": "Mathematics",
    })
    assert subject.status_code == 201, subject.text
    guardian = await client.post("/api/v1/guardians", headers=admin, json={
        "student_id": student.json()["id"], "first_name": "Ama", "last_name": "Mensah",
        "relationship": "mother", "phone": "+233200000001",
        "email": f"parent-{slug}@example.com", "is_primary": True,
    })
    assert guardian.status_code == 201, guardian.text

    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        school = await session.scalar(select(School).where(School.slug == slug))
        assert school is not None
        admin_membership = await session.scalar(
            select(SchoolMembership)
            .join(User, User.id == SchoolMembership.user_id)
            .where(SchoolMembership.school_id == school.id,
                   User.email == f"admin-{slug}@example.com")
        )
        guardian_row = await session.get(Guardian, guardian.json()["guardian_id"])
        assert admin_membership is not None and guardian_row is not None
        parent_user = User(
            email=f"parent-{slug}@example.com", display_name="Ama Mensah",
            password_hash=hash_password(PARENT_PASSWORD),
            email_verified_at=utcnow(),
        )
        session.add(parent_user)
        await session.flush()
        session.add(SchoolMembership(
            school_id=school.id, user_id=parent_user.id, role=MembershipRole.PARENT,
        ))
        guardian_row.user_id = parent_user.id
        school_id = school.id
        admin_membership_id = admin_membership.id
        await session.commit()
    await engine.dispose()

    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"parent-{slug}@example.com",
        "password": PARENT_PASSWORD,
    })
    assert signed_in.status_code == 200, signed_in.text
    return {
        "admin": admin,
        "parent": {"Authorization": f"Bearer {signed_in.json()['access_token']}"},
        "school_id": school_id,
        "membership_id": admin_membership_id,
        "student_id": student.json()["id"],
        "year_id": year.json()["id"],
        "term_id": term.json()["id"],
        "term_name": term.json()["name"],
        "class_id": group.json()["id"],
        "subject_id": subject.json()["id"],
        "slug": slug,
    }


async def _seed_records(ctx: dict) -> None:
    """Gradebook, an open assignment and a part-paid invoice, written directly."""
    today = date.today()
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        def assessment(title: str, due_on: date, status: str, *, category="class_test"):
            return Assessment(
                school_id=ctx["school_id"], academic_year_id=ctx["year_id"],
                class_group_id=ctx["class_id"], subject_id=ctx["subject_id"],
                term_id=ctx["term_id"], title=title, category=category,
                max_score=Decimal(20), weight_percent=Decimal(10), due_on=due_on,
                status=status, created_by_membership_id=ctx["membership_id"],
            )

        earlier = [
            assessment("Maths test 1", today - timedelta(days=70), "approved"),
            assessment("Maths test 2", today - timedelta(days=60), "approved"),
        ]
        recent = [
            assessment("Maths test 3", today - timedelta(days=20), "approved"),
            assessment("Maths test 4", today - timedelta(days=10), "approved"),
        ]
        pending = assessment(
            "Fractions worksheet", today + timedelta(days=1), "open", category="assignment",
        )
        session.add_all([*earlier, *recent, pending])
        await session.flush()
        for row, score in zip(earlier, (Decimal(12), Decimal(12))):
            session.add(AssessmentScore(
                school_id=ctx["school_id"], assessment_id=row.id, student_id=ctx["student_id"],
                score=score, submission_status="submitted",
                updated_by_membership_id=ctx["membership_id"],
            ))
        for row, score in zip(recent, (Decimal(16), Decimal(15))):
            session.add(AssessmentScore(
                school_id=ctx["school_id"], assessment_id=row.id, student_id=ctx["student_id"],
                score=score, submission_status="submitted",
                updated_by_membership_id=ctx["membership_id"],
            ))
        session.add(StudentInvoice(
            school_id=ctx["school_id"], student_id=ctx["student_id"],
            academic_year_id=ctx["year_id"], term_id=ctx["term_id"],
            invoice_number="INV-INT-001", status="issued", total_amount=Decimal("1200.00"),
            paid_amount=Decimal("200.00"), issued_on=today - timedelta(days=30),
        ))
        await session.commit()
    await engine.dispose()


async def _seed_attendance(ctx: dict, days: list[tuple[date, str]]) -> None:
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        for day, status in days:
            attendance_session = AttendanceSession(
                school_id=ctx["school_id"], class_group_id=ctx["class_id"],
                attendance_date=day, recorded_by_membership_id=ctx["membership_id"],
            )
            session.add(attendance_session)
            await session.flush()
            session.add(AttendanceRecord(
                school_id=ctx["school_id"], session_id=attendance_session.id,
                student_id=ctx["student_id"], status=status,
            ))
        await session.commit()
    await engine.dispose()


async def test_parent_intelligence_derives_insights_from_school_records(client):
    ctx = await _setup(client, "intel-api")
    await _seed_records(ctx)

    response = await client.get(f"/api/v1/family/intelligence/{ctx['student_id']}", headers=ctx["parent"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["student_name"] == "Ama Mensah"
    items = body["items"]
    kinds = [item["kind"] for item in items]
    assert "assignments_due" in kinds
    assert "subject_improved" in kinds
    assert "fees_outstanding" in kinds
    # No attendance was recorded, so no attendance claim may be invented.
    assert "attendance_declined" not in kinds
    assert "attendance_weekday_pattern" not in kinds

    assignment = next(item for item in items if item["kind"] == "assignments_due")
    assert assignment["title"] == "1 assignment due tomorrow"
    assert "Fractions worksheet" in assignment["detail"]
    assert "Mathematics" in assignment["detail"]

    subject = next(item for item in items if item["kind"] == "subject_improved")
    assert subject["title"] == "Mathematics performance has improved by 18 points"
    assert subject["tone"] == "positive"
    assert "78%" in subject["detail"] and "60%" in subject["detail"]
    assert subject["source"] == "Gradebook"
    assert "4 graded assessments" in subject["evidence"]

    fees = next(item for item in items if item["kind"] == "fees_outstanding")
    assert fees["tone"] == "attention"
    assert "GHS 1,000.00" in fees["detail"]
    assert fees["link"] == f"/fees?student_id={ctx['student_id']}"

    # Every claim carries its provenance and a working in-app destination.
    for item in items:
        assert item["evidence"] and item["source"]
        assert item["link"].startswith("/")


async def test_parent_intelligence_attendance_patterns_use_recorded_days(client):
    ctx = await _setup(client, "intel-attendance")
    fixed_today = date(2026, 11, 18)
    await _seed_attendance(ctx, [
        (date(2026, 11, 2), "absent"),
        (date(2026, 11, 3), "present"),
        (date(2026, 11, 4), "present"),
        (date(2026, 11, 5), "present"),
        (date(2026, 11, 9), "absent"),
        (date(2026, 11, 16), "absent"),
        (date(2026, 10, 5), "present"),
        (date(2026, 10, 6), "present"),
        (date(2026, 10, 7), "present"),
        (date(2026, 10, 8), "present"),
    ])

    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        student = await session.get(Student, UUID(ctx["student_id"]))
        assert student is not None
        insights = await insights_for_student(
            session, school_id=ctx["school_id"], student=student, today=fixed_today,
        )
    await engine.dispose()

    attendance = [item for item in insights if item.kind.startswith("attendance_")]
    pattern = next(item for item in attendance if item.kind == "attendance_weekday_pattern")
    assert pattern.title == "Missed 3 Mondays this month"
    assert "Mon 2 Nov, Mon 9 Nov and Mon 16 Nov" in pattern.detail
    assert pattern.evidence == "6 attendance records in November."
    assert pattern.source == "Attendance register"

    declined = next(item for item in attendance if item.kind == "attendance_declined")
    assert declined.title == "Attendance is down 50 points on last month"
    assert "3 of 6" in declined.detail and "4 of 4" in declined.detail
    assert declined.evidence == "10 attendance records across November and October."

    # Unmarked school days are not absences: the comparison only counts the six
    # days the register actually recorded in November, not every calendar day.
    assert declined.evidence.startswith("10 attendance records")


async def test_parent_intelligence_requires_a_linked_guardian(client):
    ctx = await _setup(client, "intel-guard")
    staff = await client.get(f"/api/v1/family/intelligence/{ctx['student_id']}", headers=ctx["admin"])
    assert staff.status_code == 403

    foreign_school = await _setup(client, "intel-other")
    intruder = await client.get(
        f"/api/v1/family/intelligence/{ctx['student_id']}", headers=foreign_school["parent"],
    )
    assert intruder.status_code == 403
