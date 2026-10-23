async def signup_and_login(client, slug="north-star"):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "North Star Academy", "school_slug": slug,
        "administrator_name": "Ama Mensah", "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return signed_in.json()["access_token"]


async def test_academic_setup_enrollments_and_tenant_boundaries(client):
    token = await signup_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15",
    })
    assert year.status_code == 201, year.text
    year_id = year.json()["id"]

    invalid_term = await client.post("/api/v1/academic/terms", headers=headers, json={
        "academic_year_id": year_id, "name": "Term 1", "ordinal": 1,
        "starts_on": "2026-08-01", "ends_on": "2026-12-15",
    })
    assert invalid_term.status_code == 422
    term = await client.post("/api/v1/academic/terms", headers=headers, json={
        "academic_year_id": year_id, "name": "Term 1", "ordinal": 1,
        "starts_on": "2026-09-01", "ends_on": "2026-12-15",
    })
    assert term.status_code == 201, term.text

    class_group = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year_id, "name": "Primary 4", "grade_level": "Primary 4", "stream": "A",
    })
    assert class_group.status_code == 201, class_group.text

    student_response = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": "A-001", "first_name": "Esi", "last_name": "Owusu",
    })
    assert student_response.status_code == 201
    enrollment_data = {
        "student_id": student_response.json()["id"], "academic_year_id": year_id,
        "class_group_id": class_group.json()["id"], "enrolled_on": "2026-09-03",
    }
    enrollment = await client.post("/api/v1/academic/enrollments", headers=headers, json=enrollment_data)
    assert enrollment.status_code == 201, enrollment.text
    duplicate = await client.post("/api/v1/academic/enrollments", headers=headers, json=enrollment_data)
    assert duplicate.status_code == 409
    roster = await client.get(f"/api/v1/academic/classes/{class_group.json()['id']}/enrollments", headers=headers)
    assert roster.status_code == 200
    assert [row["student_id"] for row in roster.json()] == [enrollment_data["student_id"]]

    other_school_token = await signup_and_login(client, "south-star")
    other_headers = {"Authorization": f"Bearer {other_school_token}"}
    hidden_years = await client.get("/api/v1/academic/years", headers=other_headers)
    hidden_class = await client.get(f"/api/v1/academic/classes/{class_group.json()['id']}/enrollments", headers=other_headers)
    assert hidden_years.json() == []
    assert hidden_class.status_code == 404
    cross_tenant = await client.post("/api/v1/academic/enrollments", headers=other_headers, json=enrollment_data)
    assert cross_tenant.status_code == 404


async def test_year_date_range_and_duplicate_names(client):
    token = await signup_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    bad = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": "bad", "starts_on": "2027-01-01", "ends_on": "2026-01-01",
    })
    assert bad.status_code == 422
    payload = {"name": "2026/2027", "starts_on": "2026-09-01", "ends_on": "2027-07-15"}
    assert (await client.post("/api/v1/academic/years", headers=headers, json=payload)).status_code == 201
    duplicate = await client.post("/api/v1/academic/years", headers=headers, json=payload)
    assert duplicate.status_code == 409
