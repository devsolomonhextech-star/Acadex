"""Bulk student import: preview is read-only, confirm is transactional, jobs are tenant-scoped."""
import csv
import io

from openpyxl import Workbook


async def _admin_session(client, slug="import-school"):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Import School", "school_slug": slug,
        "administrator_name": "Import Admin", "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _invite_teacher(client, admin_headers, slug="import-school"):
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


def _csv_upload(content: str, filename="students.csv"):
    return {"file": (filename, content.encode("utf-8"), "text/csv")}


async def _list_students(client, headers):
    response = await client.get("/api/v1/students", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


_CSV_OK = (
    "admission_number,first_name,last_name,date_of_birth\n"
    "IM-001,Ama,Mensah,2014-05-12\n"
    "IM-002,Kwame,Asante,13/11/2013\n"
)

_CSV_PROBLEMS = (
    "admission_number,first_name,last_name,date_of_birth\n"
    "IM-101,Adwoa,Mensah,2014-01-01\n"
    "IM-101,Adwoa,Mensah,2014-01-01\n"
    ",No,Id,2014-02-02\n"
    "IM-103,Bad,Date,not-a-date\n"
    "IM 104,Space,Id,2014-03-03\n"
    "IM-102,Existing,Student,\n"
)


async def test_template_download(client):
    headers = await _admin_session(client)
    csv_file = await client.get("/api/v1/student-imports/template", headers=headers)
    assert csv_file.status_code == 200
    assert "text/csv" in csv_file.headers["content-type"]
    assert "student-import-template.csv" in csv_file.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(csv_file.text)))
    assert rows[0] == ["admission_number", "first_name", "last_name", "date_of_birth"]
    assert len(rows) > 1

    xlsx_file = await client.get(
        "/api/v1/student-imports/template?format=xlsx", headers=headers
    )
    assert xlsx_file.status_code == 200
    assert "spreadsheetml" in xlsx_file.headers["content-type"]
    assert xlsx_file.content[:2] == b"PK"


async def test_preview_creates_nothing_confirm_creates(client):
    headers = await _admin_session(client)
    preview = await client.post(
        "/api/v1/student-imports/preview", headers=headers, files=_csv_upload(_CSV_OK)
    )
    assert preview.status_code == 201, preview.text
    job = preview.json()
    assert job["status"] == "previewed"
    assert job["total_rows"] == 2
    assert job["valid_rows"] == 2
    assert job["created_rows"] == 0
    assert job["column_map"]["admission_number"] == "admission_number"
    assert all(row["status"] == "valid" for row in job["rows"])

    students = await _list_students(client, headers)
    assert students["total"] == 0, "preview must not create student records"

    confirmed = await client.post(
        f"/api/v1/student-imports/{job['id']}/confirm", headers=headers
    )
    assert confirmed.status_code == 200, confirmed.text
    result = confirmed.json()
    assert result["status"] == "confirmed"
    assert result["created_rows"] == 2
    assert result["skipped_rows"] == 0
    assert result["confirmed_at"] is not None
    assert all(row["status"] == "created" for row in result["rows"])

    students = await _list_students(client, headers)
    assert students["total"] == 2
    admission_numbers = {item["admission_number"] for item in students["items"]}
    assert admission_numbers == {"IM-001", "IM-002"}

    again = await client.post(
        f"/api/v1/student-imports/{job['id']}/confirm", headers=headers
    )
    assert again.status_code == 409
    students = await _list_students(client, headers)
    assert students["total"] == 2, "re-confirming must not duplicate records"

    history = await client.get("/api/v1/student-imports", headers=headers)
    assert history.status_code == 200
    assert history.json()["total"] == 1
    assert history.json()["items"][0]["created_rows"] == 2


async def test_validation_errors_and_duplicates(client):
    headers = await _admin_session(client)
    existing = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": "IM-102", "first_name": "Existing", "last_name": "Student",
    })
    assert existing.status_code == 201, existing.text

    preview = await client.post(
        "/api/v1/student-imports/preview", headers=headers,
        files=_csv_upload(_CSV_PROBLEMS),
    )
    assert preview.status_code == 201, preview.text
    job = preview.json()
    # rows: valid / in-file dup / missing id / bad date / spaced id / existing student
    assert job["total_rows"] == 6
    assert job["valid_rows"] == 1
    assert job["duplicate_rows"] == 2
    assert job["error_rows"] == 3

    by_row = {row["row_number"]: row for row in job["rows"]}
    assert by_row[3]["status"] == "duplicate"
    assert "row 2" in by_row[3]["message"]
    assert by_row[4]["status"] == "error"
    assert "Admission number is required" in by_row[4]["message"]
    assert by_row[5]["status"] == "error"
    assert "YYYY-MM-DD" in by_row[5]["message"]
    assert by_row[6]["status"] == "error"
    assert "spaces" in by_row[6]["message"]
    assert by_row[7]["status"] == "duplicate"
    assert "already exists" in by_row[7]["message"]

    errors = await client.get(
        f"/api/v1/student-imports/{job['id']}/errors.csv", headers=headers
    )
    assert errors.status_code == 200
    assert "text/csv" in errors.headers["content-type"]
    assert "students-errors.csv" in errors.headers["content-disposition"]
    error_rows = list(csv.reader(io.StringIO(errors.text)))
    assert error_rows[0][-1] == "problem"
    assert len(error_rows) == 6  # header + 2 duplicates + 3 errors + existing-student dup

    confirmed = await client.post(
        f"/api/v1/student-imports/{job['id']}/confirm", headers=headers
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["created_rows"] == 1

    students = await _list_students(client, headers)
    assert students["total"] == 2  # existing + 1 created


async def test_confirm_skips_rows_created_after_preview(client):
    headers = await _admin_session(client)
    content = (
        "admission_number,first_name,last_name\n"
        "RACE-1,First,One\n"
        "RACE-2,Second,Two\n"
    )
    preview = await client.post(
        "/api/v1/student-imports/preview", headers=headers, files=_csv_upload(content)
    )
    assert preview.status_code == 201
    job = preview.json()
    assert job["valid_rows"] == 2

    raced = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": "RACE-1", "first_name": "Manual", "last_name": "Entry",
    })
    assert raced.status_code == 201, raced.text

    confirmed = await client.post(
        f"/api/v1/student-imports/{job['id']}/confirm", headers=headers
    )
    assert confirmed.status_code == 200, confirmed.text
    result = confirmed.json()
    assert result["created_rows"] == 1
    assert result["skipped_rows"] == 1

    students = await _list_students(client, headers)
    assert students["total"] == 2
    by_admission = {item["admission_number"]: item for item in students["items"]}
    assert by_admission["RACE-1"]["first_name"] == "Manual"


async def test_tenant_isolation_and_roles(client):
    admin_headers = await _admin_session(client, slug="import-school-a")
    other_headers = await _admin_session(client, slug="import-school-b")

    preview = await client.post(
        "/api/v1/student-imports/preview", headers=admin_headers,
        files=_csv_upload(_CSV_OK),
    )
    assert preview.status_code == 201
    job_id = preview.json()["id"]

    detail = await client.get(f"/api/v1/student-imports/{job_id}", headers=other_headers)
    assert detail.status_code == 404
    confirm = await client.post(
        f"/api/v1/student-imports/{job_id}/confirm", headers=other_headers
    )
    assert confirm.status_code == 404
    errors = await client.get(
        f"/api/v1/student-imports/{job_id}/errors.csv", headers=other_headers
    )
    assert errors.status_code == 404
    history = await client.get("/api/v1/student-imports", headers=other_headers)
    assert history.json()["total"] == 0
    students = await _list_students(client, other_headers)
    assert students["total"] == 0

    teacher_headers = await _invite_teacher(client, admin_headers, slug="import-school-a")
    forbidden = await client.post(
        "/api/v1/student-imports/preview", headers=teacher_headers,
        files=_csv_upload(_CSV_OK),
    )
    assert forbidden.status_code == 403
    template = await client.get("/api/v1/student-imports/template", headers=teacher_headers)
    assert template.status_code == 403

    anonymous = await client.get("/api/v1/student-imports/template")
    assert anonymous.status_code == 401


async def test_file_errors(client):
    headers = await _admin_session(client)

    wrong_type = await client.post(
        "/api/v1/student-imports/preview", headers=headers,
        files={"file": ("students.txt", b"not a real file", "text/plain")},
    )
    assert wrong_type.status_code == 422
    assert ".csv or .xlsx" in wrong_type.json()["detail"]

    empty = await client.post(
        "/api/v1/student-imports/preview", headers=headers,
        files=_csv_upload(""),
    )
    assert empty.status_code == 422

    missing_column = await client.post(
        "/api/v1/student-imports/preview", headers=headers,
        files=_csv_upload("name,age\nAma,10\n"),
    )
    assert missing_column.status_code == 422
    detail = missing_column.json()["detail"]
    assert "admission_number" in detail and "first_name" in detail

    header_only = await client.post(
        "/api/v1/student-imports/preview", headers=headers,
        files=_csv_upload("admission_number,first_name,last_name\n"),
    )
    assert header_only.status_code == 422

    oversized = await client.post(
        "/api/v1/student-imports/preview", headers=headers,
        files={"file": ("big.csv", b"x" * (2 * 1024 * 1024 + 1), "text/csv")},
    )
    assert oversized.status_code == 422
    assert "MB" in oversized.json()["detail"]

    too_many_rows = "admission_number,first_name,last_name\n" + "".join(
        f"ROW-{index},First,Last\n" for index in range(2001)
    )
    many = await client.post(
        "/api/v1/student-imports/preview", headers=headers,
        files=_csv_upload(too_many_rows),
    )
    assert many.status_code == 422
    assert "limit is 2000" in many.json()["detail"]

    students = await _list_students(client, headers)
    assert students["total"] == 0

    missing_job = await client.get(
        "/api/v1/student-imports/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert missing_job.status_code == 404


async def test_excel_import(client):
    headers = await _admin_session(client)
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["Admission Number", "First Name", "Last Name", "date_of_birth"])
    sheet.append(["XL-001", "Efua", "Owusu", "2015-07-21"])
    sheet.append(["XL-002", "Yaw", "Boateng", None])
    buffer = io.BytesIO()
    workbook.save(buffer)

    preview = await client.post(
        "/api/v1/student-imports/preview", headers=headers,
        files={"file": ("students.xlsx", buffer.getvalue(),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert preview.status_code == 201, preview.text
    job = preview.json()
    assert job["valid_rows"] == 2
    assert job["column_map"]["admission_number"] == "Admission Number"
    assert job["column_map"]["date_of_birth"] == "date_of_birth"

    confirmed = await client.post(
        f"/api/v1/student-imports/{job['id']}/confirm", headers=headers
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["created_rows"] == 2

    students = await _list_students(client, headers)
    assert students["total"] == 2
