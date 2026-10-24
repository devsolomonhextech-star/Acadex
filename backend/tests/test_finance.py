"""Finance: fee structures, invoice generation, decimal allocation, and tenant safety."""


async def _admin_session(client, slug="finance-school"):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Finance School", "school_slug": slug,
        "administrator_name": "Finance Admin", "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _invite_teacher(client, admin_headers, slug="finance-school"):
    invitation = await client.post("/api/v1/staff/invitations/teachers", headers=admin_headers, json={
        "email": f"teacher-{slug}@example.com", "display_name": "Teacher One",
    })
    assert invitation.status_code == 201, invitation.text
    password = "teacher-long-secure-password"
    accepted = await client.post("/api/v1/staff/invitations/accept", json={
        "token": invitation.json()["invite_token"], "password": password,
    })
    assert accepted.status_code == 200, accepted.text
    login = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"teacher-{slug}@example.com", "password": password,
    })
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _setup_billing(client, headers, student_names=(("Ama", "Mensah"), ("Kwame", "Asante"))):
    """Year, primary term, class, enrolled students, and Tuition/Feeding structures."""
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
    students = []
    for index, (first_name, last_name) in enumerate(student_names, start=1):
        student = await client.post("/api/v1/students", headers=headers, json={
            "admission_number": f"FIN-{index:03d}", "first_name": first_name, "last_name": last_name,
        })
        assert student.status_code == 201, student.text
        enrollment = await client.post("/api/v1/academic/enrollments", headers=headers, json={
            "academic_year_id": year.json()["id"], "class_group_id": group.json()["id"],
            "student_id": student.json()["id"], "enrolled_on": "2026-09-02",
        })
        assert enrollment.status_code == 201, enrollment.text
        students.append(student.json())
    category = await client.post("/api/v1/finance/fee-categories", headers=headers, json={
        "name": "Tuition",
    })
    assert category.status_code == 201, category.text
    feeding = await client.post("/api/v1/finance/fee-categories", headers=headers, json={
        "name": "Feeding",
    })
    assert feeding.status_code == 201, feeding.text
    tuition = await client.post("/api/v1/finance/fee-structures", headers=headers, json={
        "fee_category_id": category.json()["id"], "class_group_id": group.json()["id"],
        "term_id": term.json()["id"], "amount": "500.00",
    })
    assert tuition.status_code == 201, tuition.text
    lunch = await client.post("/api/v1/finance/fee-structures", headers=headers, json={
        "fee_category_id": feeding.json()["id"], "class_group_id": group.json()["id"],
        "term_id": term.json()["id"], "amount": "100.00",
    })
    assert lunch.status_code == 201, lunch.text
    return {"year": year.json(), "term": term.json(), "group": group.json(), "students": students}


async def test_fee_structures_and_invoice_generation(client):
    headers = await _admin_session(client)
    context = await _setup_billing(client, headers)

    structures = await client.get(
        f"/api/v1/finance/fee-structures?class_group_id={context['group']['id']}",
        headers=headers,
    )
    assert structures.status_code == 200
    assert len(structures.json()) == 2
    amounts = sorted(item["amount"] for item in structures.json())
    assert amounts == ["100.00", "500.00"]

    duplicate = await client.post("/api/v1/finance/fee-structures", headers=headers, json={
        "fee_category_id": structures.json()[0]["fee_category_id"],
        "class_group_id": context["group"]["id"],
        "term_id": context["term"]["id"], "amount": "250.00",
    })
    assert duplicate.status_code == 409

    generated = await client.post("/api/v1/finance/invoices/generate", headers=headers, json={
        "class_group_id": context["group"]["id"], "term_id": context["term"]["id"],
    })
    assert generated.status_code == 201, generated.text
    result = generated.json()
    assert result["created"] == 2
    assert result["skipped"] == 0
    assert result["fee_lines_per_invoice"] == 2
    assert result["total_billed"] == "1200.00"

    again = await client.post("/api/v1/finance/invoices/generate", headers=headers, json={
        "class_group_id": context["group"]["id"], "term_id": context["term"]["id"],
    })
    assert again.status_code == 201, again.text
    assert again.json()["created"] == 0
    assert again.json()["skipped"] == 2

    invoices = await client.get(
        f"/api/v1/finance/invoices?term_id={context['term']['id']}", headers=headers
    )
    assert invoices.status_code == 200
    assert invoices.json()["total"] == 2
    for item in invoices.json()["items"]:
        assert item["total_amount"] == "600.00"
        assert item["paid_amount"] == "0.00"
        assert item["balance"] == "600.00"
        assert item["status"] == "issued"
        assert item["class_name"] == "Primary 4"

    detail = await client.get(
        f"/api/v1/finance/invoices/{invoices.json()['items'][0]['id']}", headers=headers
    )
    assert detail.status_code == 200
    body = detail.json()
    assert len(body["lines"]) == 2
    assert sorted(line["amount"] for line in body["lines"]) == ["100.00", "500.00"]
    assert body["allocations"] == []

    second_term = await client.post("/api/v1/academic/terms", headers=headers, json={
        "academic_year_id": context["year"]["id"], "name": "Term 2", "ordinal": 2,
        "starts_on": "2027-01-05", "ends_on": "2027-04-10",
    })
    assert second_term.status_code == 201, second_term.text
    no_structures = await client.post("/api/v1/finance/invoices/generate", headers=headers, json={
        "class_group_id": context["group"]["id"], "term_id": second_term.json()["id"],
    })
    assert no_structures.status_code == 422


async def test_payment_allocation_and_summary(client):
    headers = await _admin_session(client)
    context = await _setup_billing(client, headers, student_names=(("Ama", "Mensah"),))
    student_id = context["students"][0]["id"]
    generated = await client.post("/api/v1/finance/invoices/generate", headers=headers, json={
        "class_group_id": context["group"]["id"], "term_id": context["term"]["id"],
    })
    assert generated.status_code == 201, generated.text

    partial = await client.post("/api/v1/finance/payments", headers=headers, json={
        "student_id": student_id, "amount": "250.00", "method": "cash",
        "payment_date": "2026-09-10", "reference": "MOMO-001",
    })
    assert partial.status_code == 201, partial.text
    payment = partial.json()
    assert payment["allocated_amount"] == "250.00"
    assert payment["unallocated_amount"] == "0.00"
    assert payment["receipt_number"].startswith("RCT-")

    invoices = await client.get(
        f"/api/v1/finance/invoices?term_id={context['term']['id']}", headers=headers
    )
    invoice = invoices.json()["items"][0]
    assert invoice["status"] == "partially_paid"
    assert invoice["paid_amount"] == "250.00"
    assert invoice["balance"] == "350.00"

    duplicate_reference = await client.post("/api/v1/finance/payments", headers=headers, json={
        "student_id": student_id, "amount": "10.00", "method": "cash",
        "payment_date": "2026-09-11", "reference": "MOMO-001",
    })
    assert duplicate_reference.status_code == 409
    assert "already been recorded" in duplicate_reference.json()["detail"]

    settle = await client.post("/api/v1/finance/payments", headers=headers, json={
        "student_id": student_id, "amount": "350.00", "method": "mobile_money",
        "payment_date": "2026-09-20",
    })
    assert settle.status_code == 201, settle.text
    assert settle.json()["allocated_amount"] == "350.00"

    invoices = await client.get(
        f"/api/v1/finance/invoices?term_id={context['term']['id']}", headers=headers
    )
    invoice = invoices.json()["items"][0]
    assert invoice["status"] == "paid"
    assert invoice["balance"] == "0.00"

    detail = await client.get(
        f"/api/v1/finance/invoices/{invoice['id']}", headers=headers
    )
    assert len(detail.json()["allocations"]) == 2

    credit = await client.post("/api/v1/finance/payments", headers=headers, json={
        "student_id": student_id, "amount": "100.00", "method": "cash",
        "payment_date": "2026-09-25",
    })
    assert credit.status_code == 201, credit.text
    assert credit.json()["allocated_amount"] == "0.00"
    assert credit.json()["unallocated_amount"] == "100.00"

    summary = await client.get(
        f"/api/v1/finance/summary?term_id={context['term']['id']}", headers=headers
    )
    assert summary.status_code == 200
    totals = summary.json()
    assert totals["invoiced_total"] == "600.00"
    assert totals["paid_total"] == "600.00"
    assert totals["outstanding_total"] == "0.00"
    assert totals["open_invoice_count"] == 0
    assert totals["payments_total"] == "700.00"
    assert totals["credit_total"] == "100.00"

    payments = await client.get("/api/v1/finance/payments", headers=headers)
    assert payments.json()["total"] == 3


async def test_oldest_invoice_paid_first(client):
    headers = await _admin_session(client)
    context = await _setup_billing(client, headers, student_names=(("Ama", "Mensah"),))
    student_id = context["students"][0]["id"]
    second_term = await client.post("/api/v1/academic/terms", headers=headers, json={
        "academic_year_id": context["year"]["id"], "name": "Term 2", "ordinal": 2,
        "starts_on": "2027-01-05", "ends_on": "2027-04-10",
    })
    assert second_term.status_code == 201, second_term.text
    structures = await client.get("/api/v1/finance/fee-structures", headers=headers)
    for structure in structures.json():
        created = await client.post("/api/v1/finance/fee-structures", headers=headers, json={
            "fee_category_id": structure["fee_category_id"],
            "class_group_id": context["group"]["id"],
            "term_id": second_term.json()["id"], "amount": structure["amount"],
        })
        assert created.status_code == 201, created.text
    for term in (context["term"], second_term.json()):
        generated = await client.post("/api/v1/finance/invoices/generate", headers=headers, json={
            "class_group_id": context["group"]["id"], "term_id": term["id"],
        })
        assert generated.status_code == 201, generated.text

    payment = await client.post("/api/v1/finance/payments", headers=headers, json={
        "student_id": student_id, "amount": "700.00", "method": "bank_transfer",
        "payment_date": "2026-10-24",
    })
    assert payment.status_code == 201, payment.text
    body = payment.json()
    assert body["allocated_amount"] == "700.00"
    assert body["unallocated_amount"] == "0.00"

    invoices = await client.get("/api/v1/finance/invoices", headers=headers)
    by_term = {item["term_name"]: item for item in invoices.json()["items"]}
    assert by_term["Term 1"]["status"] == "paid"
    assert by_term["Term 1"]["paid_amount"] == "600.00"
    assert by_term["Term 2"]["status"] == "partially_paid"
    assert by_term["Term 2"]["paid_amount"] == "100.00"
    assert by_term["Term 2"]["balance"] == "500.00"


async def test_payment_validation(client):
    headers = await _admin_session(client)
    context = await _setup_billing(client, headers, student_names=(("Ama", "Mensah"),))
    student_id = context["students"][0]["id"]

    zero = await client.post("/api/v1/finance/payments", headers=headers, json={
        "student_id": student_id, "amount": "0.00", "method": "cash",
    })
    assert zero.status_code == 422

    too_precise = await client.post("/api/v1/finance/payments", headers=headers, json={
        "student_id": student_id, "amount": "10.123", "method": "cash",
    })
    assert too_precise.status_code == 422

    future = await client.post("/api/v1/finance/payments", headers=headers, json={
        "student_id": student_id, "amount": "10.00", "method": "cash",
        "payment_date": "2099-01-01",
    })
    assert future.status_code == 422
    assert "future" in future.json()["detail"]

    bad_method = await client.post("/api/v1/finance/payments", headers=headers, json={
        "student_id": student_id, "amount": "10.00", "method": "bitcoin",
    })
    assert bad_method.status_code == 422


async def test_tenant_isolation_and_roles(client):
    admin_headers = await _admin_session(client, slug="finance-school-a")
    other_headers = await _admin_session(client, slug="finance-school-b")
    context = await _setup_billing(client, admin_headers)
    student_id = context["students"][0]["id"]
    generated = await client.post("/api/v1/finance/invoices/generate", headers=admin_headers, json={
        "class_group_id": context["group"]["id"], "term_id": context["term"]["id"],
    })
    assert generated.status_code == 201, generated.text
    invoices = await client.get("/api/v1/finance/invoices", headers=admin_headers)
    invoice_id = invoices.json()["items"][0]["id"]

    foreign_detail = await client.get(f"/api/v1/finance/invoices/{invoice_id}", headers=other_headers)
    assert foreign_detail.status_code == 404
    foreign_generate = await client.post("/api/v1/finance/invoices/generate", headers=other_headers, json={
        "class_group_id": context["group"]["id"], "term_id": context["term"]["id"],
    })
    assert foreign_generate.status_code == 404
    foreign_payment = await client.post("/api/v1/finance/payments", headers=other_headers, json={
        "student_id": student_id, "amount": "10.00", "method": "cash",
    })
    assert foreign_payment.status_code == 404
    foreign_summary = await client.get("/api/v1/finance/summary", headers=other_headers)
    assert foreign_summary.status_code == 200
    assert foreign_summary.json()["invoiced_total"] == "0.00"
    foreign_structures = await client.get("/api/v1/finance/fee-structures", headers=other_headers)
    assert foreign_structures.json() == []

    teacher_headers = await _invite_teacher(client, admin_headers, slug="finance-school-a")
    forbidden_read = await client.get("/api/v1/finance/fee-categories", headers=teacher_headers)
    assert forbidden_read.status_code == 403
    forbidden_write = await client.post("/api/v1/finance/payments", headers=teacher_headers, json={
        "student_id": student_id, "amount": "10.00", "method": "cash",
    })
    assert forbidden_write.status_code == 403

    anonymous = await client.get("/api/v1/finance/summary")
    assert anonymous.status_code == 401
