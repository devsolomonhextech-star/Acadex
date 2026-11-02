"""Admitting a student: generated admission numbers, Ghana Card, guardian, class."""
import os
from datetime import date

from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import User, utcnow

ADMISSION_PREFIX = f"ADM-{date.today().year}-"


async def _mark_email_verified(email: str) -> None:
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        await session.execute(
            update(User).where(func.lower(User.email) == email.lower()).values(email_verified_at=utcnow())
        )
        await session.commit()
    await engine.dispose()


async def _admin_session(client, slug: str = "admission-school"):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Admission School", "school_slug": slug,
        "administrator_name": "Admission Admin", "email": f"admin-{slug}@example.com",
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


async def test_admission_numbers_are_generated_in_sequence(client):
    headers = await _admin_session(client)

    preview = await client.get("/api/v1/students/next-admission-number", headers=headers)
    assert preview.status_code == 200, preview.text
    assert preview.json()["admission_number"] == f"{ADMISSION_PREFIX}0001"

    first = await client.post("/api/v1/students", headers=headers, json={
        "first_name": "Ama", "last_name": "Mensah", "date_of_birth": "2016-03-14",
    })
    assert first.status_code == 201, first.text
    assert first.json()["admission_number"] == f"{ADMISSION_PREFIX}0001"

    second = await client.post("/api/v1/students", headers=headers, json={
        "first_name": "Kwame", "last_name": "Mensah", "date_of_birth": "2015-11-02",
    })
    assert second.status_code == 201, second.text
    assert second.json()["admission_number"] == f"{ADMISSION_PREFIX}0002"

    again = await client.get("/api/v1/students/next-admission-number", headers=headers)
    assert again.json()["admission_number"] == f"{ADMISSION_PREFIX}0003"

    # A school can still supply its own number, and duplicates are refused.
    manual = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": "legacy-77", "first_name": "Yaw", "last_name": "Owusu",
    })
    assert manual.status_code == 201, manual.text
    assert manual.json()["admission_number"] == "LEGACY-77"
    duplicate = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": "LEGACY-77", "first_name": "Kofi", "last_name": "Owusu",
    })
    assert duplicate.status_code == 409, duplicate.text


async def test_ghana_card_is_normalized_and_unique(client):
    headers = await _admin_session(client, "admission-card")

    stored = await client.post("/api/v1/students", headers=headers, json={
        "first_name": "Akua", "last_name": "Asante", "date_of_birth": "2014-01-09",
        "gender": "female", "ghana_card_number": "gha 123456789 0",
    })
    assert stored.status_code == 201, stored.text
    assert stored.json()["ghana_card_number"] == "GHA-123456789-0"
    assert stored.json()["gender"] == "female"

    invalid = await client.post("/api/v1/students", headers=headers, json={
        "first_name": "Bad", "last_name": "Card", "ghana_card_number": "GHA-123",
    })
    assert invalid.status_code == 422, invalid.text

    duplicate = await client.post("/api/v1/students", headers=headers, json={
        "first_name": "Other", "last_name": "Asante", "ghana_card_number": "GHA-123456789-0",
    })
    assert duplicate.status_code == 409, duplicate.text


async def test_admission_captures_guardian_and_class(client):
    headers = await _admin_session(client, "admission-guardian")
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    assert year.status_code == 201, year.text
    group = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year.json()["id"], "name": "Primary 3",
        "grade_level": "Primary 3", "stream": "A",
    })
    assert group.status_code == 201, group.text

    payload = {
        "first_name": "Kojo", "last_name": "Danso", "date_of_birth": "2017-05-05",
        "gender": "male", "ghana_card_number": "GHA-987654321-2",
        "academic_year_id": year.json()["id"], "class_group_id": group.json()["id"],
        "guardian": {
            "first_name": "Adjoa", "last_name": "Danso", "relationship": "mother",
            "phone": "+233244000111", "email": "adjoa-danso@example.com",
            "address": "12 Ring Road, Accra", "ghana_card_number": "GHA-111222333-4",
        },
    }
    admitted = await client.post("/api/v1/students", headers=headers, json=payload)
    assert admitted.status_code == 201, admitted.text
    student = admitted.json()
    assert student["class_name"] == "Primary 3"

    profile = await client.get(f"/api/v1/students/{student['id']}/profile", headers=headers)
    assert profile.status_code == 200, profile.text
    body = profile.json()
    assert body["student"]["ghana_card_number"] == "GHA-987654321-2"
    assert body["enrollment"]["class_name"] == "Primary 3"
    assert len(body["guardians"]) == 1
    guardian = body["guardians"][0]
    assert guardian["full_name"] == "Adjoa Danso"
    assert guardian["is_primary"] is True
    assert guardian["phone"] == "+233244000111"
    assert guardian["address"] == "12 Ring Road, Accra"
    assert guardian["ghana_card_number"] == "GHA-111222333-4"

    # The same parent admitting a sibling reuses one guardian record.
    sibling = await client.post("/api/v1/students", headers=headers, json={
        **payload, "first_name": "Efua", "ghana_card_number": "GHA-987654321-3",
    })
    assert sibling.status_code == 201, sibling.text
    sibling_profile = await client.get(
        f"/api/v1/students/{sibling.json()['id']}/profile", headers=headers,
    )
    guardians = sibling_profile.json()["guardians"]
    assert len(guardians) == 1
    assert guardians[0]["guardian_id"] == guardian["guardian_id"]

    # A class from another academic year is not accepted for this admission.
    other_year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2027/2028", "starts_on": "2027-09-01", "ends_on": "2028-07-15",
    })
    mismatch = await client.post("/api/v1/students", headers=headers, json={
        "first_name": "Mismatch", "last_name": "Class",
        "academic_year_id": other_year.json()["id"], "class_group_id": group.json()["id"],
    })
    assert mismatch.status_code == 404, mismatch.text


async def test_guardian_card_is_validated_on_the_guardian_api(client):
    headers = await _admin_session(client, "admission-guardian-api")
    student = await client.post("/api/v1/students", headers=headers, json={
        "first_name": "Nana", "last_name": "Osei",
    })
    assert student.status_code == 201, student.text

    invalid = await client.post("/api/v1/guardians", headers=headers, json={
        "student_id": student.json()["id"], "first_name": "Panyin", "last_name": "Osei",
        "ghana_card_number": "not-a-card",
    })
    assert invalid.status_code == 422, invalid.text

    created = await client.post("/api/v1/guardians", headers=headers, json={
        "student_id": student.json()["id"], "first_name": "Panyin", "last_name": "Osei",
        "relationship": "father", "ghana_card_number": "GHA5556667778",
    })
    assert created.status_code == 201, created.text
    assert created.json()["ghana_card_number"] == "GHA-555666777-8"


async def test_admission_ignores_other_schools_classes(client):
    headers = await _admin_session(client, "admission-tenant-a")
    other = await _admin_session(client, "admission-tenant-b")
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    group = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year.json()["id"], "name": "Primary 1",
        "grade_level": "Primary 1", "stream": "",
    })
    denied = await client.post("/api/v1/students", headers=other, json={
        "first_name": "Foreign", "last_name": "Student",
        "academic_year_id": year.json()["id"], "class_group_id": group.json()["id"],
    })
    assert denied.status_code == 404, denied.text
