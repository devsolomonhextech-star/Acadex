"""Parent requests: a parent raises an issue, the school answers, both get alerts."""
import os
from uuid import UUID

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Guardian, MembershipRole, SchoolMembership, User
from app.security import hash_password

PARENT_PASSWORD = "parent-portal-pass-123"


async def _admin_session(client, slug: str):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": f"Requests {slug}",
        "school_slug": slug,
        "administrator_name": "Request Admin",
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug,
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _setup_school(
    client, headers, slug: str, *, admission="PR-101", year_name="2026/2027",
    starts_on="2026-09-01", ends_on="2027-07-15", enrolled_on="2026-09-02",
    email=None,
):
    """A class with one enrolled student and one linked guardian."""
    year = await client.post("/api/v1/academic/years", headers=headers, json={
        "name": year_name, "starts_on": starts_on, "ends_on": ends_on,
    })
    assert year.status_code == 201, year.text
    group = await client.post("/api/v1/academic/classes", headers=headers, json={
        "academic_year_id": year.json()["id"], "name": "Primary 4",
        "grade_level": "Primary 4", "stream": "A",
    })
    assert group.status_code == 201, group.text
    student = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": admission, "first_name": "Ama", "last_name": "Mensah",
        "date_of_birth": "2015-04-12",
    })
    assert student.status_code == 201, student.text
    enrollment = await client.post("/api/v1/academic/enrollments", headers=headers, json={
        "academic_year_id": year.json()["id"], "class_group_id": group.json()["id"],
        "student_id": student.json()["id"], "enrolled_on": enrolled_on,
    })
    assert enrollment.status_code == 201, enrollment.text
    guardian = await client.post("/api/v1/guardians", headers=headers, json={
        "student_id": student.json()["id"], "first_name": "Ama", "last_name": "Mensah",
        "relationship": "mother", "phone": "+233200000001",
        "email": email or f"parent-{slug}@example.com", "is_primary": True,
    })
    assert guardian.status_code == 201, guardian.text
    return {
        "student_id": student.json()["id"],
        "guardian_id": guardian.json()["guardian_id"],
        "email": email or f"parent-{slug}@example.com",
    }


async def _give_portal_access(guardian_id: str, email: str, display_name: str) -> None:
    """Create the parent's login account.

    There is no public endpoint for this yet; the seeded demo family is the
    only other path to a guardian account, so tests create one directly.
    """
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        guardian = await session.get(Guardian, UUID(guardian_id))
        assert guardian is not None
        user = User(email=email, display_name=display_name, password_hash=hash_password(PARENT_PASSWORD))
        session.add(user)
        await session.flush()
        session.add(SchoolMembership(
            school_id=guardian.school_id, user_id=user.id, role=MembershipRole.PARENT,
        ))
        guardian.user_id = user.id
        await session.commit()
    await engine.dispose()


async def _parent_session(client, slug: str, email: str, password: str = PARENT_PASSWORD):
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": email, "password": password,
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


async def _family(client, slug: str, admission="PR-101"):
    """Fully wired school + parent login for the common case."""
    headers = await _admin_session(client, slug)
    context = await _setup_school(client, headers, slug, admission=admission)
    await _give_portal_access(context["guardian_id"], context["email"], "Ama Mensah")
    parent = await _parent_session(client, slug, context["email"])
    return headers, parent, context


async def test_parent_request_flows_to_school_and_reply_reaches_parent(client):
    headers, parent, context = await _family(client, "req-flow")

    created = await client.post("/api/v1/family/requests", headers=parent, json={
        "topic": "meeting",
        "subject": "Request to meet the class teacher",
        "message": "Could we meet on Friday afternoon to discuss Ama's reading progress?",
        "student_id": context["student_id"],
    })
    assert created.status_code == 201, created.text
    request = created.json()
    assert request["status"] == "open"
    assert request["reference"].startswith("PR-")
    assert request["student_name"] == "Ama Mensah"
    assert request["last_message_by"] == "parent"
    assert len(request["messages"]) == 1

    inbox = await client.get("/api/v1/communications/requests", headers=headers)
    assert inbox.status_code == 200, inbox.text
    payload = inbox.json()
    assert payload["total"] == 1
    assert payload["counts"]["open"] == 1
    assert payload["counts"]["unread"] == 1
    assert payload["items"][0]["unread"] is True
    assert payload["items"][0]["guardian_name"] == "Ama Mensah"

    # Opening the thread clears the school's unread marker.
    detail = await client.get(f"/api/v1/communications/requests/{request['id']}", headers=headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["unread"] is False
    reopened = await client.get("/api/v1/communications/requests", headers=headers)
    assert reopened.json()["counts"]["unread"] == 0

    reply = await client.post(
        f"/api/v1/communications/requests/{request['id']}/messages", headers=headers,
        json={"body": "Friday at 3pm works. Please come to the Primary 4 classroom."},
    )
    assert reply.status_code == 200, reply.text
    assert reply.json()["status"] == "awaiting_parent"
    assert reply.json()["last_message_by"] == "school"
    assert reply.json()["first_school_reply_at"] is not None
    assert len(reply.json()["messages"]) == 2

    # The parent sees the reply and an in-app alert pointing at the portal.
    parent_inbox = await client.get("/api/v1/family/requests", headers=parent)
    assert parent_inbox.status_code == 200, parent_inbox.text
    assert parent_inbox.json()["counts"]["unread"] == 1
    assert parent_inbox.json()["items"][0]["unread"] is True

    alerts = await client.get("/api/v1/notifications", headers=parent)
    assert alerts.status_code == 200, alerts.text
    reply_alert = next(item for item in alerts.json() if item["type"] == "parent_request_reply")
    assert reply_alert["link"] == f"/parents?request={request['id']}", reply_alert

    admin_alerts = await client.get("/api/v1/notifications", headers=headers)
    assert any(item["type"] == "parent_request" and request["id"] in (item["link"] or "") for item in admin_alerts.json())

    parent_read = await client.get(f"/api/v1/family/requests/{request['id']}", headers=parent)
    assert parent_read.status_code == 200, parent_read.text
    assert len(parent_read.json()["messages"]) == 2
    assert parent_read.json()["messages"][1]["author_role"] == "school"

    # A parent reply returns the thread to the school's court and re-alerts them.
    follow_up = await client.post(
        f"/api/v1/family/requests/{request['id']}/messages", headers=parent,
        json={"body": "Friday works. Thank you for making the time."},
    )
    assert follow_up.status_code == 200, follow_up.text
    assert follow_up.json()["status"] == "open"
    assert follow_up.json()["last_message_by"] == "parent"
    school_alerts = await client.get("/api/v1/notifications", headers=headers)
    assert len([item for item in school_alerts.json() if item["type"] == "parent_request"]) == 2

    resolved = await client.patch(
        f"/api/v1/communications/requests/{request['id']}", headers=headers,
        json={"status": "resolved"},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_at"] is not None
    parent_alerts = await client.get("/api/v1/notifications", headers=parent)
    assert any(item["type"] == "parent_request_resolved" for item in parent_alerts.json())

    # Replying after resolution reopens the thread rather than replying into a closed one.
    reopened_thread = await client.post(
        f"/api/v1/family/requests/{request['id']}/messages", headers=parent,
        json={"body": "Sorry, one more question about the reading list."},
    )
    assert reopened_thread.status_code == 200, reopened_thread.text
    assert reopened_thread.json()["status"] == "open"
    assert reopened_thread.json()["resolved_at"] is None

    # The school inbox reflects the reopened state and keeps the full history.
    final = await client.get("/api/v1/communications/requests", headers=headers)
    assert final.json()["counts"]["open"] == 1
    assert final.json()["counts"]["resolved"] == 0
    assert final.json()["items"][0]["message_count"] == 4


async def test_requests_are_scoped_to_the_school_and_the_family(client):
    headers, parent, context = await _family(client, "req-scope")
    created = await client.post("/api/v1/family/requests", headers=parent, json={
        "topic": "fees", "subject": "Receipt for the second instalment",
        "message": "Please share the receipt for the payment we made last week.",
        "student_id": context["student_id"],
    })
    request_id = created.json()["id"]

    # A different tenant cannot see the thread at all.
    other_headers = await _admin_session(client, "req-other")
    assert (await client.get("/api/v1/communications/requests", headers=other_headers)).json()["total"] == 0
    hidden = await client.get(f"/api/v1/communications/requests/{request_id}", headers=other_headers)
    assert hidden.status_code == 404, hidden.text
    hidden_reply = await client.post(
        f"/api/v1/communications/requests/{request_id}/messages", headers=other_headers,
        json={"body": "Trying to reach into another school's thread."},
    )
    assert hidden_reply.status_code == 404, hidden_reply.text

    # A second family in the same school cannot read or answer this thread.
    second = await _setup_school(
        client, headers, "req-scope", admission="PR-202", year_name="2027/2028",
        starts_on="2027-09-01", ends_on="2028-07-15", enrolled_on="2027-09-02",
        email="second-parent-req-scope@example.com",
    )
    await _give_portal_access(second["guardian_id"], second["email"], "Second Parent")
    other_parent = await _parent_session(client, "req-scope", second["email"])
    assert (await client.get("/api/v1/family/requests", headers=other_parent)).json()["items"] == []
    assert (await client.get(f"/api/v1/family/requests/{request_id}", headers=other_parent)).status_code == 404
    assert (await client.post(
        f"/api/v1/family/requests/{request_id}/messages", headers=other_parent,
        json={"body": "Not my thread."},
    )).status_code == 404

    # A parent cannot attach a request to a child that is not theirs.
    stranger = await client.post("/api/v1/family/requests", headers=other_parent, json={
        "topic": "absence", "subject": "About another family's child",
        "message": "This should not be allowed to reference a child I am not linked to.",
        "student_id": context["student_id"],
    })
    assert stranger.status_code == 403, stranger.text

    # Roles are enforced in both directions.
    assert (await client.get("/api/v1/communications/requests", headers=parent)).status_code == 403
    assert (await client.get("/api/v1/family/requests", headers=headers)).status_code == 403
    assert (await client.patch(
        f"/api/v1/family/requests/{request_id}", headers=parent, json={"status": "resolved"},
    )).status_code in (403, 405)


async def test_school_inbox_search_filters_and_bad_payloads(client):
    headers, parent, context = await _family(client, "req-inbox")
    for topic, subject in (
        ("absence", "Ama will miss Monday"),
        ("documents", "Transfer letter needed"),
        ("meeting", "Meet the science teacher"),
    ):
        posted = await client.post("/api/v1/family/requests", headers=parent, json={
            "topic": topic, "subject": subject,
            "message": f"Message body for {subject.lower()}.",
            "student_id": context["student_id"],
        })
        assert posted.status_code == 201, posted.text

    searched = await client.get(
        "/api/v1/communications/requests", headers=headers, params={"search": "transfer"},
    )
    assert searched.status_code == 200, searched.text
    assert searched.json()["total"] == 1
    assert searched.json()["items"][0]["topic"] == "documents"

    empty = await client.get(
        "/api/v1/communications/requests", headers=headers, params={"search": "nothing matches this"},
    )
    assert empty.json()["total"] == 0
    assert empty.json()["items"] == []

    filtered = await client.get(
        "/api/v1/communications/requests", headers=headers, params={"status": "resolved"},
    )
    assert filtered.json()["total"] == 0

    bad_status = await client.get(
        "/api/v1/communications/requests", headers=headers, params={"status": "nonsense"},
    )
    assert bad_status.status_code == 422, bad_status.text

    unknown_topic = await client.post("/api/v1/family/requests", headers=parent, json={
        "topic": "gossip", "subject": "Not a real topic", "message": "This topic is not on the list.",
    })
    assert unknown_topic.status_code == 422, unknown_topic.text

    too_short = await client.post("/api/v1/family/requests", headers=parent, json={
        "topic": "other", "subject": "Hi", "message": "short",
    })
    assert too_short.status_code == 422, too_short.text

    empty_reply = await client.post(
        f"/api/v1/communications/requests/{searched.json()['items'][0]['id']}/messages",
        headers=headers, json={"body": " "},
    )
    assert empty_reply.status_code == 422, empty_reply.text
