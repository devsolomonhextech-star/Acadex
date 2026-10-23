from datetime import date


async def _admin_session(client, slug="teaching-school"):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Teaching School", "school_slug": slug,
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


async def test_teacher_invitation_assignment_and_attendance_access(client):
    admin_token = await _admin_session(client)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    year = await client.post("/api/v1/academic/years", headers=admin_headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    assert year.status_code == 201, year.text
    term = await client.post("/api/v1/academic/terms", headers=admin_headers, json={
        "academic_year_id": year.json()["id"], "name": "Term 1", "ordinal": 1,
        "starts_on": "2026-09-01", "ends_on": "2026-12-15",
    })
    assert term.status_code == 201, term.text
    group = await client.post("/api/v1/academic/classes", headers=admin_headers, json={
        "academic_year_id": year.json()["id"], "name": "Primary 4", "grade_level": "Primary 4", "stream": "A",
    })
    assert group.status_code == 201, group.text
    student = await client.post("/api/v1/students", headers=admin_headers, json={
        "admission_number": "P4-001", "first_name": "Adwoa", "last_name": "Mensah",
    })
    assert student.status_code == 201, student.text
    enrollment = await client.post("/api/v1/academic/enrollments", headers=admin_headers, json={
        "academic_year_id": year.json()["id"], "class_group_id": group.json()["id"],
        "student_id": student.json()["id"], "enrolled_on": "2026-09-02",
    })
    assert enrollment.status_code == 201, enrollment.text

    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=admin_headers, json={
        "email": "teacher@example.com", "display_name": "Teacher One",
    })
    assert invitation.status_code == 201, invitation.text
    teacher_password = "teacher-long-secure-password"
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": teacher_password,
    })
    assert accepted.status_code == 200, accepted.text
    replay = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": teacher_password,
    })
    assert replay.status_code == 400
    teacher_login = await client.post("/api/v1/auth/login", json={
        "school_slug": "teaching-school", "email": "teacher@example.com", "password": teacher_password,
    })
    assert teacher_login.status_code == 200, teacher_login.text
    teacher_headers = {"Authorization": f"Bearer {teacher_login.json()['access_token']}"}
    forbidden = await client.get("/api/v1/attendance/sheet", headers=teacher_headers, params={
        "class_group_id": group.json()["id"], "attendance_date": "2026-10-23",
    })
    assert forbidden.status_code == 403

    subjects = await client.post("/api/v1/academic/subjects", headers=admin_headers, json={"code": "sci", "name": "Integrated Science"})
    assert subjects.status_code == 201, subjects.text
    teachers = await client.get("/api/v1/academic/teachers", headers=admin_headers)
    assert teachers.status_code == 200 and len(teachers.json()) == 1
    assignment = await client.post("/api/v1/academic/teaching-assignments", headers=admin_headers, json={
        "class_group_id": group.json()["id"], "subject_id": subjects.json()["id"],
        "teacher_membership_id": teachers.json()[0]["membership_id"],
    })
    assert assignment.status_code == 201, assignment.text
    teacher_classes = await client.get("/api/v1/academic/classes", headers=teacher_headers, params={"academic_year_id": year.json()["id"]})
    assert [row["id"] for row in teacher_classes.json()] == [group.json()["id"]]

    assessment = await client.post("/api/v1/assessments", headers=teacher_headers, json={
        "class_group_id": group.json()["id"], "subject_id": subjects.json()["id"], "term_id": term.json()["id"],
        "title": "Mid-term science test", "category": "class_test", "max_score": "20", "weight_percent": "30",
        "due_on": "2026-10-20",
    })
    assert assessment.status_code == 201, assessment.text
    assessment_id = assessment.json()["id"]
    gradebook = await client.get(f"/api/v1/assessments/{assessment_id}/gradebook", headers=teacher_headers)
    assert gradebook.status_code == 200, gradebook.text
    assert gradebook.json()["students"][0]["score"] is None
    too_high = await client.put(f"/api/v1/assessments/{assessment_id}/gradebook", headers=teacher_headers, json={
        "marks": [{"student_id": student.json()["id"], "score": "20.01"}],
    })
    assert too_high.status_code == 422
    saved_scores = await client.put(f"/api/v1/assessments/{assessment_id}/gradebook", headers=teacher_headers, json={
        "marks": [{"student_id": student.json()["id"], "score": "17.50", "comment": "Strong work"}],
    })
    assert saved_scores.status_code == 200, saved_scores.text
    assert saved_scores.json()["students"][0]["score"] == "17.50"
    submitted_assessment = await client.post(f"/api/v1/assessments/{assessment_id}/submit", headers=teacher_headers)
    assert submitted_assessment.status_code == 200, submitted_assessment.text
    assert submitted_assessment.json()["status"] == "submitted"
    locked_gradebook = await client.put(f"/api/v1/assessments/{assessment_id}/gradebook", headers=teacher_headers, json={
        "marks": [{"student_id": student.json()["id"], "score": "18"}],
    })
    assert locked_gradebook.status_code == 409
    returned = await client.post(f"/api/v1/assessments/{assessment_id}/review", headers=admin_headers, json={
        "decision": "return", "note": "Please review this score",
    })
    assert returned.status_code == 200, returned.text
    assert returned.json()["status"] == "returned"
    resubmitted = await client.post(f"/api/v1/assessments/{assessment_id}/submit", headers=teacher_headers)
    assert resubmitted.status_code == 200, resubmitted.text
    approved = await client.post(f"/api/v1/assessments/{assessment_id}/review", headers=admin_headers, json={"decision": "approve"})
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    approved_edit = await client.put(f"/api/v1/assessments/{assessment_id}/gradebook", headers=teacher_headers, json={
        "marks": [{"student_id": student.json()["id"], "score": "18"}],
    })
    assert approved_edit.status_code == 409

    attendance_date = date(2026, 10, 23).isoformat()
    sheet = await client.get("/api/v1/attendance/sheet", headers=teacher_headers, params={
        "class_group_id": group.json()["id"], "attendance_date": attendance_date,
    })
    assert sheet.status_code == 200, sheet.text
    assert sheet.json()["students"][0]["status"] == "unmarked"
    missing = await client.put("/api/v1/attendance/sheet", headers=teacher_headers, json={
        "class_group_id": group.json()["id"], "attendance_date": attendance_date, "marks": [],
    })
    assert missing.status_code == 422
    saved = await client.put("/api/v1/attendance/sheet", headers=teacher_headers, json={
        "class_group_id": group.json()["id"], "attendance_date": attendance_date,
        "marks": [{"student_id": student.json()["id"], "status": "late", "note": "Arrived after assembly"}],
    })
    assert saved.status_code == 200, saved.text
    assert saved.json()["session_id"]
    assert saved.json()["students"][0]["status"] == "late"
    assert saved.json()["students"][0]["note"] == "Arrived after assembly"
    corrected = await client.put("/api/v1/attendance/sheet", headers=teacher_headers, json={
        "class_group_id": group.json()["id"], "attendance_date": attendance_date,
        "marks": [{"student_id": student.json()["id"], "status": "present", "note": None}],
    })
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["students"][0]["status"] == "present"

    other_school = await _admin_session(client, "different-school")
    foreign = await client.get("/api/v1/attendance/sheet", headers={"Authorization": f"Bearer {other_school}"}, params={
        "class_group_id": group.json()["id"], "attendance_date": attendance_date,
    })
    assert foreign.status_code == 404
