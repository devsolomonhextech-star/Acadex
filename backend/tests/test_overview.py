"""Overview dashboard figures must come from live rows, never placeholders."""


async def _admin_session(client, slug="overview-school"):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Overview School", "school_slug": slug,
        "administrator_name": "Kwame Boateng", "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return signed_in.json()["access_token"]


async def test_overview_counts_reflect_created_records(client):
    token = await _admin_session(client)
    headers = {"Authorization": f"Bearer {token}"}

    empty = await client.get("/api/v1/overview", headers=headers)
    assert empty.status_code == 200, empty.text
    assert empty.json()["students_total"] == 0
    assert empty.json()["teachers_total"] == 0
    assert empty.json()["classes_total"] == 0
    assert empty.json()["lessons_today"] == []
    assert empty.json()["finance"]["invoiced_total"] == "0"
    # No rows means no invented trend points.
    assert all(point["students"] == 0 for point in empty.json()["activity"])

    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    year_id = year.json()["id"]
    for name, grade in (("Primary 4", "Primary 4"), ("Primary 5", "Primary 5")):
        created = await client.post("/api/v1/academic/classes", headers=headers, json={
            "academic_year_id": year_id, "name": name, "grade_level": grade, "stream": "A",
        })
        assert created.status_code == 201, created.text
    for index in range(3):
        student = await client.post("/api/v1/students", headers=headers, json={
            "admission_number": f"OV-{index:03d}", "first_name": "Esi", "last_name": f"Student{index}",
        })
        assert student.status_code == 201, student.text

    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=headers, json={
        "email": "ov-teacher@example.com", "display_name": "Teacher Overview",
    })
    assert invitation.status_code == 201, invitation.text
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": "teacher-long-secure-password",
    })
    assert accepted.status_code == 200, accepted.text

    after = await client.get("/api/v1/overview", headers=headers)
    assert after.status_code == 200, after.text
    body = after.json()
    assert body["students_total"] == 3, body["students_total"]
    assert body["teachers_total"] == 1, body["teachers_total"]
    assert body["classes_total"] == 2, body["classes_total"]
    assert body["generated_at"]
    assert isinstance(body["activity"], list) and len(body["activity"]) == 8
    # Attendance is unread until someone marks a sheet, so the rate stays null.
    assert body["attendance"]["rate_percent"] is None
    assert body["attendance"]["records_total"] == 0


async def test_overview_finance_is_role_scoped(client):
    token = await _admin_session(client, slug="overview-scoped")
    admin_headers = {"Authorization": f"Bearer {token}"}

    # A teacher gets dashboard figures but no money.
    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=admin_headers, json={
        "email": "scoped-teacher@example.com", "display_name": "Scoped Teacher",
    })
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": "teacher-long-secure-password",
    })
    assert accepted.status_code == 200, accepted.text
    teacher_login = await client.post("/api/v1/auth/login", json={
        "school_slug": "overview-scoped", "email": "scoped-teacher@example.com",
        "password": "teacher-long-secure-password",
    })
    teacher_headers = {"Authorization": f"Bearer {teacher_login.json()['access_token']}"}

    admin_view = await client.get("/api/v1/overview", headers=admin_headers)
    assert admin_view.status_code == 200, admin_view.text
    assert admin_view.json()["finance"] is not None

    teacher_view = await client.get("/api/v1/overview", headers=teacher_headers)
    assert teacher_view.status_code == 200, teacher_view.text
    teacher_body = teacher_view.json()
    assert teacher_body["finance"] is None, "teachers must not see school finances"
    assert teacher_body["teachers_total"] == 1
    # Teachers may still see attendance, so the section is present.
    assert teacher_body["attendance"] is not None

    anonymous = await client.get("/api/v1/overview")
    assert anonymous.status_code == 401
