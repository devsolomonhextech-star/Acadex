"""Student profile: one aggregated, role-scoped payload per student."""
from uuid import uuid4


async def _admin_session(client, slug="profile-school"):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Profile School", "school_slug": slug,
        "administrator_name": "Profile Admin", "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _setup_student(client, headers):
    """Year, term, class, one enrolled student with a guardian."""
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    assert year.status_code == 201, year.text
    term = await client.post("/api/v1/academic/terms", headers=headers, json={
        "academic_year_id": year.json()["id"], "name": "Term 1", "ordinal": 1,
        "starts_on": "2026-09-01", "ends_on": "2026-12-15",
    })
    assert term.status_code == 201, term.text
    group = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year.json()["id"], "name": "Primary 4",
        "grade_level": "Primary 4", "stream": "A",
    })
    assert group.status_code == 201, group.text
    student = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": "PR-001", "first_name": "Ama", "last_name": "Profile",
        "date_of_birth": "2015-04-12",
    })
    assert student.status_code == 201, student.text
    enrollment = await client.post("/api/v1/academic/enrollments", headers=headers, json={
        "academic_year_id": year.json()["id"], "class_group_id": group.json()["id"],
        "student_id": student.json()["id"], "enrolled_on": "2026-09-02",
    })
    assert enrollment.status_code == 201, enrollment.text
    guardian = await client.post("/api/v1/guardians", headers=headers, json={
        "student_id": student.json()["id"], "first_name": "Kojo", "last_name": "Profile",
        "relationship": "father", "phone": "+233200000001",
        "email": "kojo.profile@example.com", "is_primary": True,
    })
    assert guardian.status_code == 201, guardian.text
    return {"year": year.json(), "term": term.json(), "group": group.json(),
            "student": student.json()}


async def test_profile_aggregates_live_sections(client):
    headers = await _admin_session(client)
    context = await _setup_student(client, headers)
    student_id = context["student"]["id"]

    response = await client.get(f"/api/v1/students/{student_id}/profile", headers=headers)
    assert response.status_code == 200, response.text
    profile = response.json()

    assert profile["student"]["display_name"] == "Ama Profile"
    assert profile["student"]["admission_number"] == "PR-001"
    assert profile["student"]["date_of_birth"] == "2015-04-12"
    assert profile["student"]["age_years"] is not None
    assert profile["student"]["status"] == "active"

    assert profile["enrollment"]["class_name"] == "Primary 4"
    assert profile["enrollment"]["academic_year"] == "2026/2027"

    assert len(profile["guardians"]) == 1
    guardian = profile["guardians"][0]
    assert guardian["full_name"] == "Kojo Profile"
    assert guardian["relationship"] == "father"
    assert guardian["is_primary"] is True
    assert guardian["phone"] == "+233200000001"

    # Nothing marked and nothing billed yet: honest zeros, not invented figures.
    attendance = profile["attendance"]
    assert attendance["days_marked"] == 0
    assert attendance["rate_percent"] is None
    assert attendance["recent"] == []
    assert profile["finance"]["invoiced_total"] == "0"
    assert profile["finance"]["invoices"] == []
    assert profile["results"] == []
    assert profile["schedule_today"] == []
    assert profile["generated_at"]


async def test_profile_is_tenant_safe_and_role_scoped(client):
    headers = await _admin_session(client, slug="profile-scoped")
    context = await _setup_student(client, headers)
    student_id = context["student"]["id"]

    # A student id that does not exist here must 404, never leak another tenant.
    missing = await client.get(f"/api/v1/students/{uuid4()}/profile", headers=headers)
    assert missing.status_code == 404, missing.text

    # Teachers cannot open the student directory, so they cannot open profiles.
    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=headers, json={
        "email": "profile-teacher@example.com", "display_name": "Profile Teacher",
    })
    assert invitation.status_code == 201, invitation.text
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": "teacher-long-secure-password",
    })
    assert accepted.status_code == 200, accepted.text
    login = await client.post("/api/v1/auth/login", json={
        "school_slug": "profile-scoped", "email": "profile-teacher@example.com",
        "password": "teacher-long-secure-password",
    })
    teacher_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    denied = await client.get(f"/api/v1/students/{student_id}/profile", headers=teacher_headers)
    assert denied.status_code == 403, denied.text

    anonymous = await client.get(f"/api/v1/students/{student_id}/profile")
    assert anonymous.status_code == 401
