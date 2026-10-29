"""Placing students into a class: unassigned list, bulk enroll, and its audit trail."""
from uuid import uuid4


async def _admin_session(client, slug: str = "assign-school"):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Assignment School", "school_slug": slug,
        "administrator_name": "Assign Admin", "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _setup(client, headers, slug: str):
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    assert year.status_code == 201, year.text
    year_id = year.json()["id"]
    classes = {}
    for name in ("Primary 4", "Primary 5"):
        group = await client.post("/api/v1/academic/classes", headers=headers, json={
            "academic_year_id": year_id, "name": name, "grade_level": name, "stream": "A",
        })
        assert group.status_code == 201, group.text
        classes[name] = group.json()["id"]
    students = []
    for index in range(3):
        student = await client.post("/api/v1/students", headers=headers, json={
            "admission_number": f"AS-{index + 1:03d}",
            "first_name": "Esi", "last_name": f"Student{index + 1}",
        })
        assert student.status_code == 201, student.text
        students.append(student.json()["id"])
    return year_id, classes, students


async def test_unassigned_then_bulk_assign(client):
    headers = await _admin_session(client)
    year_id, classes, students = await _setup(client, headers, "assign-school")

    unassigned = await client.get(
        f"/api/v1/academic/years/{year_id}/unassigned-students", headers=headers,
    )
    assert unassigned.status_code == 200, unassigned.text
    assert {row["id"] for row in unassigned.json()} == set(students)

    first = await client.post(
        f"/api/v1/academic/classes/{classes['Primary 4']}/enrollments/bulk",
        headers=headers, json={"student_ids": students[:2]},
    )
    assert first.status_code == 201, first.text
    assert first.json()["enrolled"] == 2
    assert first.json()["skipped"] == 0

    remaining = await client.get(
        f"/api/v1/academic/years/{year_id}/unassigned-students", headers=headers,
    )
    assert [row["id"] for row in remaining.json()] == [students[2]]

    # One enrollment per student per year: the repeat is skipped, not an error.
    second = await client.post(
        f"/api/v1/academic/classes/{classes['Primary 5']}/enrollments/bulk",
        headers=headers, json={"student_ids": [students[0], students[2]]},
    )
    assert second.status_code == 201, second.text
    assert second.json() == {
        "class_group_id": classes["Primary 5"], "enrolled": 1, "skipped": 1,
    }

    classes_after = await client.get(
        "/api/v1/academic/classes", headers=headers, params={"academic_year_id": year_id},
    )
    counts = {row["name"]: row["student_count"] for row in classes_after.json()}
    assert counts == {"Primary 4": 2, "Primary 5": 1}

    roster = await client.get(
        f"/api/v1/academic/classes/{classes['Primary 4']}/roster", headers=headers,
    )
    assert roster.status_code == 200, roster.text
    assert len(roster.json()) == 2


async def test_bulk_assignment_is_guarded(client):
    headers = await _admin_session(client, "assign-guard")
    year_id, classes, students = await _setup(client, headers, "assign-guard")

    # A teacher cannot place students into a class.
    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=headers, json={
        "email": "assign-teacher@example.com", "display_name": "Assign Teacher",
    })
    await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": "teacher-long-secure-password",
    })
    teacher_login = await client.post("/api/v1/auth/login", json={
        "school_slug": "assign-guard", "email": "assign-teacher@example.com",
        "password": "teacher-long-secure-password",
    })
    teacher = {"Authorization": f"Bearer {teacher_login.json()['access_token']}"}
    denied = await client.post(
        f"/api/v1/academic/classes/{classes['Primary 4']}/enrollments/bulk",
        headers=teacher, json={"student_ids": students[:1]},
    )
    assert denied.status_code == 403, denied.text

    # Another tenant cannot see or touch this year.
    other = await _admin_session(client, "assign-other")
    assert (await client.get(
        f"/api/v1/academic/years/{year_id}/unassigned-students", headers=other,
    )).status_code == 404
    assert (await client.post(
        "/api/v1/academic/classes/00000000-0000-0000-0000-000000000001/enrollments/bulk",
        headers=other, json={"student_ids": [str(uuid4())]},
    )).status_code == 404

    # The enrollment date must sit inside the academic year.
    bad_date = await client.post(
        f"/api/v1/academic/classes/{classes['Primary 4']}/enrollments/bulk",
        headers=headers, json={"student_ids": students[:1], "enrolled_on": "2030-01-05"},
    )
    assert bad_date.status_code == 422, bad_date.text
