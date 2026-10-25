"""Overview dashboard figures must come from live rows, never placeholders."""

from datetime import date, timedelta
from decimal import Decimal


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
    class_ids = []
    for name, grade in (("Primary 4", "Primary 4"), ("Primary 5", "Primary 5")):
        created = await client.post("/api/v1/academic/classes", headers=headers, json={
            "academic_year_id": year_id, "name": name, "grade_level": grade, "stream": "A",
        })
        assert created.status_code == 201, created.text
        class_ids.append(created.json()["id"])
    for index in range(3):
        student = await client.post("/api/v1/students", headers=headers, json={
            "admission_number": f"OV-{index:03d}", "first_name": "Esi", "last_name": f"Student{index}",
        })
        assert student.status_code == 201, student.text
        enrolled = await client.post("/api/v1/academic/enrollments", headers=headers, json={
            "academic_year_id": year_id, "class_group_id": class_ids[index % len(class_ids)],
            "student_id": student.json()["id"], "enrolled_on": "2026-09-01",
        })
        assert enrolled.status_code == 201, enrolled.text

    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=headers, json={
        "email": "ov-teacher@example.com", "display_name": "Teacher Overview",
    })
    assert invitation.status_code == 201, invitation.text
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": "teacher-long-secure-password",
    })
    assert accepted.status_code == 200, accepted.text
    subject = await client.post("/api/v1/academic/subjects", headers=headers, json={
        "code": "OV-SCI", "name": "Integrated Science",
    })
    assert subject.status_code == 201, subject.text
    teachers = await client.get("/api/v1/academic/teachers", headers=headers)
    assert teachers.status_code == 200 and len(teachers.json()) == 1
    assignment = await client.post("/api/v1/academic/teaching-assignments", headers=headers, json={
        "class_group_id": class_ids[0], "subject_id": subject.json()["id"],
        "teacher_membership_id": teachers.json()[0]["membership_id"],
    })
    assert assignment.status_code == 201, assignment.text

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


async def test_demo_seed_creates_real_fees_attendance_and_results(client):
    token = await _admin_session(client, slug="demo-seed")
    headers = {"Authorization": f"Bearer {token}"}

    # Nothing to bill against yet, so seeding refuses cleanly.
    premature = await client.post("/api/v1/overview/demo/seed", headers=headers)
    assert premature.status_code == 422, premature.text

    # Year, term, class, two enrolled students. Dates are relative to today so
    # the 30-day attendance window always lands inside the current term.
    today = date.today()
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027",
        "starts_on": (today - timedelta(days=90)).isoformat(),
        "ends_on": (today + timedelta(days=270)).isoformat(),
    })
    year_id = year.json()["id"]
    term = await client.post("/api/v1/academic/terms", headers=headers, json={
        "academic_year_id": year_id, "name": "Term 1", "ordinal": 1,
        "starts_on": (today - timedelta(days=45)).isoformat(),
        "ends_on": (today + timedelta(days=135)).isoformat(),
    })
    assert term.status_code == 201, term.text
    group = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year_id, "name": "Primary 4",
        "grade_level": "Primary 4", "stream": "A",
    })
    group_id = group.json()["id"]
    for index in range(2):
        student = await client.post("/api/v1/students", headers=headers, json={
            "admission_number": f"DS-{index:03d}",
            "first_name": "Kofi", "last_name": f"Seed{index}",
        })
        assert student.status_code == 201, student.text
        enrolled = await client.post("/api/v1/academic/enrollments", headers=headers, json={
            "academic_year_id": year_id, "class_group_id": group_id,
            "student_id": student.json()["id"],
            "enrolled_on": (today - timedelta(days=80)).isoformat(),
        })
        assert enrolled.status_code == 201, enrolled.text

    seeded = await client.post("/api/v1/overview/demo/seed", headers=headers)
    assert seeded.status_code == 200, seeded.text
    result = seeded.json()
    assert result["invoices_created"] == 2, result
    assert result["payments_created"] == 2, result
    # Every weekday in the term window gets a marked sheet for both students.
    assert result["attendance_records_created"] >= 20, result
    assert result["results_created"] == 2, result
    # Profile depth: demographics, portal guardians, behaviour, documents.
    assert result["profiles_filled"] == 2, result
    assert result["guardians_created"] == 4, result
    assert result["behavior_created"] == 8, result
    assert result["documents_created"] == 10, result
    assert result["teachers_created"] == 4, result
    # This school has no subjects yet, so there is nothing to assign or schedule.
    assert result["subject_assignments_created"] == 0, result
    assert result["timetable_created"] == 0, result
    # A finished prior year with published results and settled invoices.
    assert result["history_year_created"] is True, result
    assert result["history_results_created"] == 2, result
    assert result["history_invoices_created"] == 2, result
    assert result["history_payments_created"] == 2, result
    assert Decimal(result["invoiced_total"]) > 0
    assert Decimal(result["paid_total"]) > 0

    # The dashboard reports the same money and shows a payments trend.
    view = await client.get("/api/v1/overview", headers=headers)
    assert view.status_code == 200, view.text
    body = view.json()
    finance = body["finance"]
    assert Decimal(finance["invoiced_total"]) == Decimal(result["invoiced_total"])
    assert Decimal(finance["paid_total"]) == Decimal(result["paid_total"])
    # One full and one partial payment leave a genuine balance outstanding.
    assert Decimal(finance["outstanding_total"]) > 0, finance
    paid_weeks = sum(Decimal(point["payments"]) for point in body["activity"])
    # The chart covers recent weeks only; the ledger total also includes the
    # prior year's settled invoices.
    assert paid_weeks > 0, (paid_weeks, result)
    assert Decimal(result["paid_total"]) >= paid_weeks, (paid_weeks, result)
    # Seeded attendance feeds the weekly trend on the activity chart.
    assert any(point["attendance_rate"] is not None for point in body["activity"]), body["activity"]
    # Invoices were backdated, so partials read as overdue follow-ups.
    assert finance["overdue_invoice_count"] >= 1, finance
    assert any(item["key"] == "overdue-invoices" for item in body["attention"])

    # The profile now has attendance and computed results to show.
    listing = await client.get("/api/v1/students", headers=headers)
    assert listing.status_code == 200, listing.text
    student_id = listing.json()["items"][0]["id"]
    profile = await client.get(f"/api/v1/students/{student_id}/profile", headers=headers)
    assert profile.status_code == 200, profile.text
    profile_body = profile.json()
    profile_attendance = profile_body["attendance"]
    assert profile_attendance["days_marked"] > 0, profile_attendance
    assert profile_attendance["rate_percent"] is not None
    assert len(profile_attendance["recent"]) > 0
    # Current term (still draft) plus the prior year's published term.
    assert len(profile_body["results"]) == 2, profile_body["results"]
    seeded_result = profile_body["results"][0]
    assert seeded_result["grade"] is not None, seeded_result
    assert seeded_result["position"] is not None
    assert seeded_result["published"] is False
    assert profile_body["results"][1]["published"] is True, profile_body["results"][1]

    # Both guardians have portal logins, so messaging them works end to end.
    assert profile_body["guardians"][0]["has_portal_login"] is True, profile_body["guardians"]
    message = await client.post(
        f"/api/v1/students/{student_id}/message", headers=headers,
        json={"title": "Half-term notice", "body": "School closes early on Friday."},
    )
    assert message.status_code == 200, message.text
    assert message.json()["recipients"] == 2
    parent_login = await client.post("/api/v1/auth/login", json={
        "school_slug": "demo-seed",
        "email": profile_body["guardians"][0]["email"],
        "password": "Parent-demo-2026",
    })
    assert parent_login.status_code == 200, parent_login.text

    # A second click is a no-op across every section.
    again = await client.post("/api/v1/overview/demo/seed", headers=headers)
    assert again.status_code == 200, again.text
    payload = again.json()
    assert payload["invoices_created"] == 0, payload
    assert payload["payments_created"] == 0, payload
    assert payload["attendance_records_created"] == 0, payload
    assert payload["results_created"] == 0, payload
    assert payload["profiles_filled"] == 0, payload
    assert payload["guardians_created"] == 0, payload
    assert payload["teachers_created"] == 0, payload
    assert payload["subject_assignments_created"] == 0, payload
    assert payload["timetable_created"] == 0, payload
    assert payload["behavior_created"] == 0, payload
    assert payload["documents_created"] == 0, payload
    assert payload["history_year_created"] is False, payload
    assert payload["history_results_created"] == 0, payload
    assert payload["history_invoices_created"] == 0, payload
    assert payload["history_payments_created"] == 0, payload


async def test_demo_seed_is_admin_only(client):
    token = await _admin_session(client, slug="demo-admin-only")
    admin_headers = {"Authorization": f"Bearer {token}"}

    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=admin_headers, json={
        "email": "ds-teacher@example.com", "display_name": "Demo Teacher",
    })
    assert invitation.status_code == 201, invitation.text
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": "teacher-long-secure-password",
    })
    assert accepted.status_code == 200, accepted.text
    login = await client.post("/api/v1/auth/login", json={
        "school_slug": "demo-admin-only", "email": "ds-teacher@example.com",
        "password": "teacher-long-secure-password",
    })
    teacher_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    denied = await client.post("/api/v1/overview/demo/seed", headers=teacher_headers)
    assert denied.status_code == 403, denied.text
