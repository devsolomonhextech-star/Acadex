"""Class teachers: one owner per class; subject loads stay many-per-teacher."""
from datetime import date, timedelta
from uuid import uuid4


async def _admin_session(client, slug: str) -> dict:
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": f"Class Teacher {slug}",
        "school_slug": slug,
        "administrator_name": "CT Admin",
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    login = await client.post("/api/v1/auth/login", json={
        "school_slug": slug,
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _invite_teacher(client, headers: dict, tag: str, name: str) -> dict:
    email = f"teacher-{tag}@example.com"
    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=headers, json={
        "email": email, "display_name": name,
    })
    assert invitation.status_code == 201, invitation.text
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"],
        "password": "teacher-long-secure-password",
    })
    assert accepted.status_code == 200, accepted.text
    teachers = await client.get("/api/v1/academic/teachers", headers=headers)
    assert teachers.status_code == 200, teachers.text
    return next(teacher for teacher in teachers.json() if teacher["email"] == email)


async def _setup_year_and_classes(client, headers: dict, names=("Blue", "Gold")):
    today = date.today()
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027",
        "starts_on": (today - timedelta(days=30)).isoformat(),
        "ends_on": (today + timedelta(days=300)).isoformat(),
    })
    assert year.status_code == 201, year.text
    groups = []
    for name in names:
        group = await client.post("/api/v1/academic/classes", headers=headers, json={
            "academic_year_id": year.json()["id"],
            "name": f"Grade {name}",
            "grade_level": "Grade 7",
            "stream": name,
        })
        assert group.status_code == 201, group.text
        groups.append(group.json())
    return year.json(), groups


async def test_assign_change_and_clear_class_teacher(client):
    headers = await _admin_session(client, "ct-one")
    year, groups = await _setup_year_and_classes(client, headers)
    teacher_a = await _invite_teacher(client, headers, "ct-one", "Ama Teacher")
    teacher_b = await _invite_teacher(client, headers, "ct-one-b", "Kofi Teacher")
    endpoint = f"/api/v1/academic/classes/{groups[0]['id']}/class-teacher"

    assigned = await client.put(endpoint, headers=headers, json={
        "teacher_membership_id": teacher_a["membership_id"],
    })
    assert assigned.status_code == 200, assigned.text
    body = assigned.json()
    assert body["class_teacher_membership_id"] == teacher_a["membership_id"]
    assert body["class_teacher_name"] == "Ama Teacher"

    classes = (await client.get(
        f"/api/v1/academic/classes?academic_year_id={year['id']}", headers=headers
    )).json()
    listed = next(row for row in classes if row["id"] == groups[0]["id"])
    assert listed["class_teacher_name"] == "Ama Teacher"

    summary = await client.get("/api/v1/academic/teachers", headers=headers)
    row = next(t for t in summary.json() if t["membership_id"] == teacher_a["membership_id"])
    assert row["class_teacher_of"] == "Grade Blue"

    # Changing directly to another teacher is allowed.
    changed = await client.put(endpoint, headers=headers, json={
        "teacher_membership_id": teacher_b["membership_id"],
    })
    assert changed.status_code == 200, changed.text
    assert changed.json()["class_teacher_name"] == "Kofi Teacher"

    cleared = await client.put(endpoint, headers=headers, json={"teacher_membership_id": None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["class_teacher_membership_id"] is None
    assert cleared.json()["class_teacher_name"] is None
    summary = await client.get("/api/v1/academic/teachers", headers=headers)
    row = next(t for t in summary.json() if t["membership_id"] == teacher_b["membership_id"])
    assert row["class_teacher_of"] is None


async def test_class_teacher_owns_only_one_class(client):
    headers = await _admin_session(client, "ct-two")
    _year, groups = await _setup_year_and_classes(client, headers)
    teacher = await _invite_teacher(client, headers, "ct-two", "Solo Teacher")

    first = await client.put(
        f"/api/v1/academic/classes/{groups[0]['id']}/class-teacher",
        headers=headers, json={"teacher_membership_id": teacher["membership_id"]},
    )
    assert first.status_code == 200, first.text

    second = await client.put(
        f"/api/v1/academic/classes/{groups[1]['id']}/class-teacher",
        headers=headers, json={"teacher_membership_id": teacher["membership_id"]},
    )
    assert second.status_code == 409, second.text
    assert "Grade Blue" in second.json()["detail"]

    missing = await client.put(
        f"/api/v1/academic/classes/{groups[1]['id']}/class-teacher",
        headers=headers, json={"teacher_membership_id": str(uuid4())},
    )
    assert missing.status_code == 404, missing.text

    unknown_class = await client.put(
        f"/api/v1/academic/classes/{uuid4()}/class-teacher",
        headers=headers, json={"teacher_membership_id": teacher["membership_id"]},
    )
    assert unknown_class.status_code == 404, unknown_class.text


async def test_subject_teacher_load_covers_many_classes(client):
    headers = await _admin_session(client, "ct-three")
    _year, groups = await _setup_year_and_classes(client, headers)
    teacher = await _invite_teacher(client, headers, "ct-three", "Multi Teacher")
    subject = await client.post("/api/v1/academic/subjects", headers=headers, json={
        "code": "MTH", "name": "Mathematics",
    })
    assert subject.status_code == 201, subject.text

    for group in groups:
        created = await client.post("/api/v1/academic/teaching-assignments", headers=headers, json={
            "class_group_id": group["id"],
            "subject_id": subject.json()["id"],
            "teacher_membership_id": teacher["membership_id"],
        })
        assert created.status_code == 201, created.text

    summary = (await client.get("/api/v1/academic/teachers", headers=headers)).json()
    row = next(t for t in summary if t["membership_id"] == teacher["membership_id"])
    assert row["classes_taught"] == 2, row
    assert row["subjects_taught"] == 1, row
    # Teaching subjects in a class does not make them its class teacher.
    assert row["class_teacher_of"] is None, row

    # …until they are assigned the class-teacher role as well (both roles).
    assigned = await client.put(
        f"/api/v1/academic/classes/{groups[0]['id']}/class-teacher",
        headers=headers, json={"teacher_membership_id": teacher["membership_id"]},
    )
    assert assigned.status_code == 200, assigned.text
    summary = (await client.get("/api/v1/academic/teachers", headers=headers)).json()
    row = next(t for t in summary if t["membership_id"] == teacher["membership_id"])
    assert row["class_teacher_of"] == "Grade Blue"
    assert row["classes_taught"] == 2
