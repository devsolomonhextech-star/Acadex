"""Grading scales, weighted term aggregation, and result publication behaviour."""


async def _admin_session(client, slug="results-school"):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Results School", "school_slug": slug,
        "administrator_name": "Results Admin", "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _invite_teacher(client, admin_headers, slug="results-school", email="teacher@example.com"):
    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=admin_headers, json={
        "email": email, "display_name": "Teacher One",
    })
    assert invitation.status_code == 201, invitation.text
    password = "teacher-long-secure-password"
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": password,
    })
    assert accepted.status_code == 200, accepted.text
    login = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": email, "password": password,
    })
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


BANDS = [
    {"min_percent": "0", "max_percent": "39.99", "grade": "E", "points": "1", "description": "Fail"},
    {"min_percent": "40", "max_percent": "49.99", "grade": "D", "points": "2", "description": "Pass"},
    {"min_percent": "50", "max_percent": "59.99", "grade": "C", "points": "3", "description": "Credit"},
    {"min_percent": "60", "max_percent": "69.99", "grade": "B", "points": "4", "description": "Upper credit"},
    {"min_percent": "70", "max_percent": "100", "grade": "A", "points": "5", "description": "Distinction"},
]


async def _setup_context(client, admin_headers, teacher_headers):
    """Year, term, class, two students, subject, teacher assignment."""
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
    students = []
    for index, name in enumerate([("Adwoa", "Mensah"), ("Kwame", "Asante")], start=1):
        student = await client.post("/api/v1/students", headers=admin_headers, json={
            "admission_number": f"P4-{index:03d}", "first_name": name[0], "last_name": name[1],
        })
        assert student.status_code == 201, student.text
        enrollment = await client.post("/api/v1/academic/enrollments", headers=admin_headers, json={
            "academic_year_id": year.json()["id"], "class_group_id": group.json()["id"],
            "student_id": student.json()["id"], "enrolled_on": "2026-09-02",
        })
        assert enrollment.status_code == 201, enrollment.text
        students.append(student.json())
    subject = await client.post("/api/v1/academic/subjects", headers=admin_headers, json={
        "code": "sci", "name": "Integrated Science",
    })
    assert subject.status_code == 201, subject.text
    teachers = await client.get("/api/v1/academic/teachers", headers=admin_headers)
    assert teachers.status_code == 200 and len(teachers.json()) == 1
    assignment = await client.post("/api/v1/academic/teaching-assignments", headers=admin_headers, json={
        "class_group_id": group.json()["id"], "subject_id": subject.json()["id"],
        "teacher_membership_id": teachers.json()[0]["membership_id"],
    })
    assert assignment.status_code == 201, assignment.text
    return {"year": year.json(), "term": term.json(), "group": group.json(),
            "students": students, "subject": subject.json()}


async def _create_approved_assessment(client, headers, ctx, title, category, max_score, weight, scores,
                                      reviewer_headers=None):
    assessment = await client.post("/api/v1/assessments", headers=headers, json={
        "class_group_id": ctx["group"]["id"], "subject_id": ctx["subject"]["id"],
        "term_id": ctx["term"]["id"], "title": title, "category": category,
        "max_score": str(max_score), "weight_percent": str(weight), "due_on": "2026-10-20",
    })
    assert assessment.status_code == 201, assessment.text
    assessment_id = assessment.json()["id"]
    marks = [{"student_id": student["id"], "score": str(score)}
             for student, score in zip(ctx["students"], scores)]
    saved = await client.put(f"/api/v1/assessments/{assessment_id}/gradebook", headers=headers,
                             json={"marks": marks})
    assert saved.status_code == 200, saved.text
    submitted = await client.post(f"/api/v1/assessments/{assessment_id}/submit", headers=headers)
    assert submitted.status_code == 200, submitted.text
    reviewed = await client.post(f"/api/v1/assessments/{assessment_id}/review",
                                 headers=reviewer_headers or headers,
                                 json={"decision": "approve"})
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["status"] == "approved"
    return assessment_id


async def test_grading_scale_validation_and_default(client):
    admin_headers = await _admin_session(client, "grading-school")
    # A gap between bands is rejected.
    gapped = [dict(band) for band in BANDS]
    gapped[1]["min_percent"] = "41"
    rejected = await client.post("/api/v1/grading/scales", headers=admin_headers, json={
        "name": "Gapped scale", "bands": gapped,
    })
    assert rejected.status_code == 422, rejected.text
    assert "contiguous" in rejected.json()["detail"]
    # Bands must start at 0.
    not_from_zero = [dict(band) for band in BANDS]
    not_from_zero[0]["min_percent"] = "5"
    rejected_zero = await client.post("/api/v1/grading/scales", headers=admin_headers, json={
        "name": "Offset scale", "bands": not_from_zero,
    })
    assert rejected_zero.status_code == 422
    # Valid scale created as default.
    created = await client.post("/api/v1/grading/scales", headers=admin_headers, json={
        "name": "Primary scale", "is_default": True, "include_positions": True, "bands": BANDS,
    })
    assert created.status_code == 201, created.text
    scale_id = created.json()["id"]
    assert created.json()["is_default"] is True
    assert len(created.json()["bands"]) == 5
    # Duplicate name is rejected.
    duplicate = await client.post("/api/v1/grading/scales", headers=admin_headers, json={
        "name": "Primary scale", "bands": BANDS,
    })
    assert duplicate.status_code == 409, duplicate.text
    # A second default replaces the first.
    second = await client.post("/api/v1/grading/scales", headers=admin_headers, json={
        "name": "Second scale", "is_default": True, "bands": BANDS,
    })
    assert second.status_code == 201, second.text
    scales = await client.get("/api/v1/grading/scales", headers=admin_headers)
    assert scales.status_code == 200
    defaults = [row for row in scales.json() if row["is_default"]]
    assert len(defaults) == 1 and defaults[0]["id"] == second.json()["id"]
    # The default scale cannot be archived.
    blocked = await client.delete(f"/api/v1/grading/scales/{second.json()['id']}", headers=admin_headers)
    assert blocked.status_code == 409
    archived = await client.delete(f"/api/v1/grading/scales/{scale_id}", headers=admin_headers)
    assert archived.status_code == 204
    visible = await client.get("/api/v1/grading/scales", headers=admin_headers)
    assert all(row["id"] != scale_id for row in visible.json())


async def test_weighted_totals_grading_positions_and_publication(client):
    admin_headers = await _admin_session(client)
    teacher_headers = await _invite_teacher(client, admin_headers)
    ctx = await _setup_context(client, admin_headers, teacher_headers)

    scale = await client.post("/api/v1/grading/scales", headers=admin_headers, json={
        "name": "Primary scale", "is_default": True, "include_positions": True, "bands": BANDS,
    })
    assert scale.status_code == 201, scale.text

    # Two approved weighted assessments: quiz 40% (30 max), exam 60% (100 max).
    await _create_approved_assessment(
        client, teacher_headers, ctx, "Science quiz", "quiz", 30, 40, [24, 15],
        reviewer_headers=admin_headers)
    await _create_approved_assessment(
        client, teacher_headers, ctx, "Science exam", "examination", 100, 60, [80, 45],
        reviewer_headers=admin_headers)

    # A teacher from another class scope, and students, must not see results yet.
    compute = await client.post("/api/v1/results/compute", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert compute.status_code == 200, compute.text
    body = compute.json()
    assert body["publication"]["status"] == "draft"
    assert body["grading_scale_name"] == "Primary scale"
    by_name = {row["admission_number"]: row for row in body["students"]}

    # Kwame: quiz 15/30 = 50% * 40 = 20; exam 45/100 = 45% * 60 = 27; total = 47/100 -> 47 (D).
    kwame = by_name["P4-002"]
    assert len(kwame["subjects"]) == 1
    assert kwame["subjects"][0]["weighted_total"] == "47.00"
    assert kwame["subjects"][0]["grade"] == "D"
    assert kwame["aggregate_percent"] == "47.00"
    assert kwame["grade"] == "D"
    # Adwoa: 24/30 = 80% * 40 = 32; 80/100 = 80% * 60 = 48; total = 80 -> A.
    adwoa = by_name["P4-001"]
    assert adwoa["subjects"][0]["weighted_total"] == "80.00"
    assert adwoa["subjects"][0]["grade"] == "A"
    assert adwoa["position"] == 1
    assert kwame["position"] == 2
    # Subject metadata confirms the weight basis.
    assert adwoa["subjects"][0]["assessment_count"] == 2
    assert adwoa["subjects"][0]["total_weight"] == "100.00"

    # Recompute stays possible while unpublished.
    recompute = await client.post("/api/v1/results/compute", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert recompute.status_code == 200, recompute.text

    # Publishing requires an exact class-name confirmation.
    wrong_confirmation = await client.post("/api/v1/results/publish", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
        "confirm_class_name": "Primary 3",
    })
    assert wrong_confirmation.status_code == 422
    published = await client.post("/api/v1/results/publish", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
        "confirm_class_name": ctx["group"]["name"],
    })
    assert published.status_code == 200, published.text
    assert published.json()["publication"]["status"] == "published"
    assert published.json()["publication"]["published_at"] is not None
    published_body = published.json()
    assert {row["admission_number"]: row["position"] for row in published_body["students"]}["P4-001"] == 1

    # Published results are immutable: recompute and double-publish are refused.
    locked = await client.post("/api/v1/results/compute", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert locked.status_code == 409
    again = await client.post("/api/v1/results/publish", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
        "confirm_class_name": ctx["group"]["name"],
    })
    assert again.status_code == 409
    # Approved scores stay locked after publication.
    assessments = await client.get("/api/v1/assessments", headers=teacher_headers,
                                   params={"academic_year_id": ctx["year"]["id"]})
    quiz_id = next(row["id"] for row in assessments.json() if row["title"] == "Science quiz")
    score_edit = await client.put(f"/api/v1/assessments/{quiz_id}/gradebook", headers=teacher_headers,
                                  json={"marks": [{"student_id": ctx["students"][0]["id"], "score": "30"}]})
    assert score_edit.status_code == 409

    # Withdraw unlocks recomputation with an audited transition.
    withdrawn = await client.post("/api/v1/results/withdraw", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert withdrawn.status_code == 200, withdrawn.text
    assert withdrawn.json()["publication"]["status"] == "withdrawn"
    assert withdrawn.json()["publication"]["withdrawn_at"] is not None
    recomputed = await client.post("/api/v1/results/compute", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert recomputed.status_code == 200, recomputed.text
    # Withdrawing twice is refused.
    again_withdraw = await client.post("/api/v1/results/withdraw", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert again_withdraw.status_code == 409


async def test_compute_requires_scale_and_approved_complete_scores(client):
    admin_headers = await _admin_session(client, "incomplete-school")
    teacher_headers = await _invite_teacher(client, admin_headers, "incomplete-school",
                                            "teacher-incomplete@example.com")
    ctx = await _setup_context(client, admin_headers, teacher_headers)
    assessment = await client.post("/api/v1/assessments", headers=teacher_headers, json={
        "class_group_id": ctx["group"]["id"], "subject_id": ctx["subject"]["id"],
        "term_id": ctx["term"]["id"], "title": "Open quiz", "category": "quiz",
        "max_score": "20", "weight_percent": "100", "due_on": "2026-10-20",
    })
    assert assessment.status_code == 201, assessment.text
    # No grading scale configured yet: compute is refused with guidance.
    no_scale = await client.post("/api/v1/results/compute", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert no_scale.status_code == 422
    assert "grading scale" in no_scale.json()["detail"]
    # Score only one of two students, then approve.
    assessment_id = assessment.json()["id"]
    saved = await client.put(f"/api/v1/assessments/{assessment_id}/gradebook", headers=teacher_headers,
                             json={"marks": [
                                 {"student_id": ctx["students"][0]["id"], "score": "18"},
                                 {"student_id": ctx["students"][1]["id"], "score": "10"},
                             ]})
    assert saved.status_code == 200, saved.text
    submitted = await client.post(f"/api/v1/assessments/{assessment_id}/submit", headers=teacher_headers)
    assert submitted.status_code == 200, submitted.text
    approved = await client.post(f"/api/v1/assessments/{assessment_id}/review", headers=admin_headers,
                                 json={"decision": "approve"})
    assert approved.status_code == 200, approved.text
    scale = await client.post("/api/v1/grading/scales", headers=admin_headers, json={
        "name": "Default scale", "is_default": True, "bands": BANDS,
    })
    assert scale.status_code == 201, scale.text
    # Now everything is approved and complete: compute succeeds (100% weight single quiz).
    computed = await client.post("/api/v1/results/compute", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert computed.status_code == 200, computed.text
    by_name = {row["admission_number"]: row for row in computed.json()["students"]}
    assert by_name["P4-001"]["aggregate_percent"] == "90.00"
    assert by_name["P4-001"]["grade"] == "A"
    assert by_name["P4-002"]["aggregate_percent"] == "50.00"
    assert by_name["P4-002"]["grade"] == "C"


async def test_results_isolation_and_permissions(client):
    admin_headers = await _admin_session(client, "results-a")
    teacher_headers = await _invite_teacher(client, admin_headers, "results-a", "teacher-a@example.com")
    ctx = await _setup_context(client, admin_headers, teacher_headers)
    await client.post("/api/v1/grading/scales", headers=admin_headers, json={
        "name": "Scale A", "is_default": True, "bands": BANDS,
    })
    await _create_approved_assessment(client, teacher_headers, ctx, "Quiz A", "quiz", 100, 100, [80, 70],
                                      reviewer_headers=admin_headers)

    other_headers = await _admin_session(client, "results-b")
    # Another school cannot compute or read this class's results.
    foreign_compute = await client.post("/api/v1/results/compute", headers=other_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert foreign_compute.status_code == 404
    foreign_read = await client.get("/api/v1/results/class", headers=other_headers, params={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert foreign_read.status_code == 404
    # Another school cannot read this school's grading scales.
    foreign_scales = await client.get("/api/v1/grading/scales", headers=other_headers)
    assert foreign_scales.status_code == 200 and foreign_scales.json() == []
    # A teacher outside the class cannot read results either.
    teacher_b = await _invite_teacher(client, other_headers, "results-b", "teacher-b@example.com")
    forbidden = await client.get("/api/v1/results/class", headers=teacher_b, params={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert forbidden.status_code == 403
    # Roles without publishing rights are refused.
    publish_denied = await client.post("/api/v1/results/publish", headers=teacher_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
        "confirm_class_name": ctx["group"]["name"],
    })
    assert publish_denied.status_code == 403
    # The assigned teacher can read their class's results once computed.
    computed = await client.post("/api/v1/results/compute", headers=admin_headers, json={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert computed.status_code == 200, computed.text
    teacher_read = await client.get("/api/v1/results/class", headers=teacher_headers, params={
        "class_group_id": ctx["group"]["id"], "term_id": ctx["term"]["id"],
    })
    assert teacher_read.status_code == 200, teacher_read.text
    assert len(teacher_read.json()["students"]) == 2
