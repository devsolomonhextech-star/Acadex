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
    # Out-of-scope students are reported as missing so a teacher cannot probe
    # the directory by id.
    denied = await client.get(f"/api/v1/students/{student_id}/profile", headers=teacher_headers)
    assert denied.status_code == 404, denied.text

    anonymous = await client.get(f"/api/v1/students/{student_id}/profile")
    assert anonymous.status_code == 401


async def test_profile_edit_password_and_guardian_update(client):
    headers = await _admin_session(client, slug="profile-edit")
    context = await _setup_student(client, headers)
    student_id = context["student"]["id"]

    # Edit Profile: demographics and contact details land on the record.
    edited = await client.patch(f"/api/v1/students/{student_id}", headers=headers, json={
        "gender": "female", "phone": "+233 24 111 2222",
        "email": "ama.profile@example.com",
    })
    assert edited.status_code == 200, edited.text
    assert edited.json()["gender"] == "female"
    assert edited.json()["email"] == "ama.profile@example.com"

    profile = await client.get(f"/api/v1/students/{student_id}/profile", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["student"]["has_portal_login"] is False

    # First password creates the portal account for the student.
    created = await client.post(f"/api/v1/students/{student_id}/password", headers=headers, json={
        "new_password": "learner-pass-2026",
    })
    assert created.status_code == 200, created.text
    assert created.json()["created_account"] is True
    assert created.json()["email"] == "ama.profile@example.com"

    # A wrong current password can never overwrite a working login.
    wrong = await client.post(f"/api/v1/students/{student_id}/password", headers=headers, json={
        "current_password": "not-the-password", "new_password": "another-pass-2026",
    })
    assert wrong.status_code == 403, wrong.text

    # The student signs in with the account just created.
    login = await client.post("/api/v1/auth/login", json={
        "school_slug": "profile-edit", "email": "ama.profile@example.com",
        "password": "learner-pass-2026",
    })
    assert login.status_code == 200, login.text

    # Guardian Information pencil: edit the linked guardian's contact details.
    guardians = await client.get(f"/api/v1/guardians/student/{student_id}", headers=headers)
    assert guardians.status_code == 200, guardians.text
    guardian = guardians.json()[0]
    updated = await client.patch(
        f"/api/v1/guardians/{guardian['guardian_id']}", headers=headers,
        json={"phone": "+233 20 555 0101", "email": "kojo.updated@example.com"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["phone"] == "+233 20 555 0101"
    assert updated.json()["student_id"] == student_id

    # A teacher holds neither edit role, so all three are denied.
    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=headers, json={
        "email": "edit-teacher@example.com", "display_name": "Edit Teacher",
    })
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": "teacher-long-secure-password",
    })
    assert accepted.status_code == 200, accepted.text
    teacher_login = await client.post("/api/v1/auth/login", json={
        "school_slug": "profile-edit", "email": "edit-teacher@example.com",
        "password": "teacher-long-secure-password",
    })
    teacher_headers = {"Authorization": f"Bearer {teacher_login.json()['access_token']}"}
    denied_edit = await client.patch(
        f"/api/v1/students/{student_id}", headers=teacher_headers, json={"phone": "+233 00 000 0000"})
    assert denied_edit.status_code == 403, denied_edit.text
    denied_password = await client.post(
        f"/api/v1/students/{student_id}/password", headers=teacher_headers,
        json={"new_password": "sneaky-password-1"})
    assert denied_password.status_code == 403, denied_password.text


async def test_behavior_and_document_lifecycle(client):
    headers = await _admin_session(client, slug="profile-records")
    context = await _setup_student(client, headers)
    student_id = context["student"]["id"]

    # Behaviour: recorded, listed on the profile, then removed.
    created = await client.post(f"/api/v1/students/{student_id}/behavior", headers=headers, json={
        "occurred_on": "2026-10-20", "category": "merit", "severity": "low",
        "title": "Won the class quiz", "description": "Top score in the Friday quiz.",
        "action_taken": "Commended",
    })
    assert created.status_code == 201, created.text

    profile = await client.get(f"/api/v1/students/{student_id}/profile", headers=headers)
    assert profile.status_code == 200
    behavior = profile.json()["behavior"]
    assert len(behavior) == 1, behavior
    assert behavior[0]["title"] == "Won the class quiz"
    assert behavior[0]["recorded_by"], behavior[0]

    removed = await client.delete(
        f"/api/v1/students/{student_id}/behavior/{created.json()['id']}", headers=headers)
    assert removed.status_code == 204, removed.text
    after_removal = await client.get(f"/api/v1/students/{student_id}/profile", headers=headers)
    assert after_removal.json()["behavior"] == []

    # Documents: filed, listed with the filer's name, then removed.
    document = await client.post(f"/api/v1/students/{student_id}/documents", headers=headers, json={
        "doc_type": "birth_certificate", "title": "Birth certificate",
        "reference": "BC-PR-001", "issued_on": "2015-05-01", "notes": "Certified copy",
    })
    assert document.status_code == 201, document.text

    profile = await client.get(f"/api/v1/students/{student_id}/profile", headers=headers)
    documents = profile.json()["documents"]
    assert len(documents) == 1, documents
    assert documents[0]["doc_type"] == "birth_certificate"
    assert documents[0]["added_by"], documents[0]

    gone = await client.delete(
        f"/api/v1/students/{student_id}/documents/{document.json()['id']}", headers=headers)
    assert gone.status_code == 204, gone.text
    profile = await client.get(f"/api/v1/students/{student_id}/profile", headers=headers)
    assert profile.json()["documents"] == []


async def test_message_requires_guardian_portal_login(client):
    headers = await _admin_session(client, slug="profile-message")
    context = await _setup_student(client, headers)
    student_id = context["student"]["id"]

    # The API-created guardian has no portal account yet — refused clearly.
    refused = await client.post(f"/api/v1/students/{student_id}/message", headers=headers, json={
        "title": "Trip consent", "body": "Please sign the attached form.",
    })
    assert refused.status_code == 409, refused.text
