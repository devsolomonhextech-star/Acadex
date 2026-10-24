"""Timetable slots and direct teacher account management."""


async def _admin_session(client, slug="timetable-school"):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Timetable School", "school_slug": slug,
        "administrator_name": "School Admin", "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return signed_in.json()["access_token"]


async def _setup(client, headers, year_id, group_id):
    """Create a subject, a teacher, and the teaching assignment that links them."""
    subject = await client.post("/api/v1/academic/subjects", headers=headers,
                                json={"code": "MTH", "name": "Mathematics"})
    assert subject.status_code == 201, subject.text
    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=headers,
                                   json={"email": "teacher-tt@example.com", "display_name": "Kofi Mensah"})
    assert invitation.status_code == 201, invitation.text
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": "teacher-long-secure-password",
    })
    assert accepted.status_code == 200, accepted.text
    teachers = await client.get("/api/v1/academic/teachers", headers=headers)
    assert teachers.status_code == 200, teachers.text
    teacher_id = teachers.json()[0]["membership_id"]
    assignment = await client.post("/api/v1/academic/teaching-assignments", headers=headers, json={
        "class_group_id": group_id, "subject_id": subject.json()["id"], "teacher_membership_id": teacher_id,
    })
    assert assignment.status_code == 201, assignment.text
    return subject.json()["id"], teacher_id


async def test_timetable_conflicts_and_assignment_requirement(client):
    token = await _admin_session(client)
    headers = {"Authorization": f"Bearer {token}"}
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    assert year.status_code == 201, year.text
    year_id = year.json()["id"]
    group = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year_id, "name": "Primary 4", "grade_level": "Primary 4", "stream": "A",
    })
    assert group.status_code == 201, group.text
    group_id = group.json()["id"]
    other = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year_id, "name": "Primary 5", "grade_level": "Primary 5", "stream": "A",
    })
    assert other.status_code == 201, other.text
    subject_id, teacher_id = await _setup(client, headers, year_id, group_id)

    # The teacher has no assignment for Primary 5, so the slot must be refused.
    unassigned = await client.post("/api/v1/timetable", headers=headers, json={
        "academic_year_id": year_id, "class_group_id": other.json()["id"], "subject_id": subject_id,
        "teacher_membership_id": teacher_id, "day_of_week": 0,
        "starts_at": "08:00", "ends_at": "09:00",
    })
    assert unassigned.status_code == 409, unassigned.text

    # An end time at or before the start is rejected by validation.
    inverted = await client.post("/api/v1/timetable", headers=headers, json={
        "academic_year_id": year_id, "class_group_id": group_id, "subject_id": subject_id,
        "teacher_membership_id": teacher_id, "day_of_week": 0,
        "starts_at": "09:00", "ends_at": "09:00",
    })
    assert inverted.status_code == 422

    slot_payload = {
        "academic_year_id": year_id, "class_group_id": group_id, "subject_id": subject_id,
        "teacher_membership_id": teacher_id, "day_of_week": 0,
        "starts_at": "08:00", "ends_at": "09:00", "room": "Room 1",
    }
    created = await client.post("/api/v1/timetable", headers=headers, json=slot_payload)
    assert created.status_code == 201, created.text
    assert created.json()["day_name"] == "Monday"
    assert created.json()["starts_at"] == "08:00"
    assert created.json()["teacher_name"] == "Kofi Mensah"

    # A second lesson for the same class that overlaps the first is refused.
    class_clash = await client.post("/api/v1/timetable", headers=headers, json={
        **slot_payload, "subject_id": subject_id, "starts_at": "08:30", "ends_at": "09:30",
    })
    assert class_clash.status_code == 409
    assert "class" in class_clash.json()["detail"].lower()

    # A later, non-overlapping lesson on the same day is fine.
    later = await client.post("/api/v1/timetable", headers=headers, json={
        **slot_payload, "starts_at": "09:00", "ends_at": "10:00",
    })
    assert later.status_code == 201, later.text

    listed = await client.get("/api/v1/timetable", headers=headers, params={"academic_year_id": year_id})
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 2
    by_class = await client.get("/api/v1/timetable", headers=headers, params={
        "academic_year_id": year_id, "class_group_id": group_id, "day_of_week": 0,
    })
    assert len(by_class.json()) == 2

    removed = await client.delete(f"/api/v1/timetable/{created.json()['id']}", headers=headers)
    assert removed.status_code == 204, removed.text
    after_delete = await client.get("/api/v1/timetable", headers=headers, params={"academic_year_id": year_id})
    assert len(after_delete.json()) == 1
    missing = await client.delete(f"/api/v1/timetable/{created.json()['id']}", headers=headers)
    assert missing.status_code == 404


async def test_teacher_double_booking_is_rejected(client):
    token = await _admin_session(client, slug="double-book")
    headers = {"Authorization": f"Bearer {token}"}
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    year_id = year.json()["id"]
    first = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year_id, "name": "Primary 4", "grade_level": "Primary 4", "stream": "A",
    })
    second = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year_id, "name": "Primary 5", "grade_level": "Primary 5", "stream": "A",
    })
    subject_id, teacher_id = await _setup(client, headers, year_id, first.json()["id"])
    # The same teacher also teaches Primary 5, so both classes are schedulable.
    second_assignment = await client.post("/api/v1/academic/teaching-assignments", headers=headers, json={
        "class_group_id": second.json()["id"], "subject_id": subject_id, "teacher_membership_id": teacher_id,
    })
    assert second_assignment.status_code == 201, second_assignment.text

    base = {"academic_year_id": year_id, "subject_id": subject_id,
            "teacher_membership_id": teacher_id, "day_of_week": 1,
            "starts_at": "10:00", "ends_at": "11:00"}
    first_slot = await client.post("/api/v1/timetable", headers=headers,
                                   json={**base, "class_group_id": first.json()["id"]})
    assert first_slot.status_code == 201, first_slot.text

    # One teacher cannot be in two classes at the same time.
    clash = await client.post("/api/v1/timetable", headers=headers,
                              json={**base, "class_group_id": second.json()["id"]})
    assert clash.status_code == 409
    assert "teacher" in clash.json()["detail"].lower()

    # A different time works, showing the same teacher really can cover both classes.
    moved = await client.post("/api/v1/timetable", headers=headers, json={
        **base, "class_group_id": second.json()["id"], "starts_at": "11:00", "ends_at": "12:00",
    })
    assert moved.status_code == 201, moved.text

    # A teacher sees the timetable but cannot write to it.
    teacher_login = await client.post("/api/v1/auth/login", json={
        "school_slug": "double-book", "email": "teacher-tt@example.com",
        "password": "teacher-long-secure-password",
    })
    assert teacher_login.status_code == 200, teacher_login.text
    teacher_headers = {"Authorization": f"Bearer {teacher_login.json()['access_token']}"}
    teacher_view = await client.get("/api/v1/timetable", headers=teacher_headers,
                                    params={"academic_year_id": year_id})
    assert teacher_view.status_code == 200
    assert len(teacher_view.json()) == 2
    teacher_write = await client.post("/api/v1/timetable", headers=teacher_headers, json={
        **base, "class_group_id": second.json()["id"], "starts_at": "13:00", "ends_at": "14:00",
    })
    assert teacher_write.status_code == 403


async def test_admin_creates_and_lists_teachers(client):
    token = await _admin_session(client, slug="teacher-admin")
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post("/api/v1/staff/teachers", headers=headers, json={
        "display_name": "Ama Serwaa", "email": "ama@example.com",
        "password": "temporary-secure-password",
    })
    assert created.status_code == 201, created.text
    assert created.json()["class_count"] == 0
    assert created.json()["subject_count"] == 0

    # The created account can sign in straight away with the given password.
    login = await client.post("/api/v1/auth/login", json={
        "school_slug": "teacher-admin", "email": "ama@example.com",
        "password": "temporary-secure-password",
    })
    assert login.status_code == 200, login.text

    duplicate = await client.post("/api/v1/staff/teachers", headers=headers, json={
        "display_name": "Ama Serwaa", "email": "ama@example.com",
        "password": "temporary-secure-password",
    })
    assert duplicate.status_code == 409

    weak = await client.post("/api/v1/staff/teachers", headers=headers, json={
        "display_name": "Short Name", "email": "short@example.com", "password": "too-short",
    })
    assert weak.status_code == 422

    listing = await client.get("/api/v1/staff/teachers", headers=headers)
    assert listing.status_code == 200, listing.text
    assert len(listing.json()) == 1
    assert listing.json()[0]["display_name"] == "Ama Serwaa"
    assert listing.json()[0]["email"] == "ama@example.com"

    # A teacher account cannot create more teachers.
    teacher_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    forbidden = await client.post("/api/v1/staff/teachers", headers=teacher_headers, json={
        "display_name": "Another One", "email": "another@example.com",
        "password": "temporary-secure-password",
    })
    assert forbidden.status_code == 403
    forbidden_list = await client.get("/api/v1/staff/teachers", headers=teacher_headers)
    assert forbidden_list.status_code == 403
