"""Smart Dismissal configuration saved from admin Settings."""
import os

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import AuditEvent, User, utcnow

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


async def _admin_session(client, slug: str = "dismissal-school"):
    email = f"admin-{slug}@example.com"
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Dismissal School", "school_slug": slug,
        "administrator_name": "Dismissal Admin", "email": email,
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        await session.execute(
            update(User).where(func.lower(User.email) == email).values(email_verified_at=utcnow())
        )
        await session.commit()
    await engine.dispose()
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": slug, "email": email, "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['access_token']}"}


def _payload(**overrides):
    closing = {day: ("15:30" if day not in ("saturday", "sunday") else None) for day in DAYS}
    return {
        "enabled": True,
        "closing_times": closing,
        "reminder_enabled": True,
        "reminder_lead_minutes": 30,
        "authorized_guardians_only": True,
        "late_pickup_after_minutes": 15,
        **overrides,
    }


async def test_dismissal_defaults_are_off_and_ready_to_configure(client):
    headers = await _admin_session(client)

    response = await client.get("/api/v1/school/dismissal-settings", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["can_edit"] is True
    assert body["days"] == DAYS
    assert 30 in body["reminder_lead_choices"]
    settings = body["settings"]
    # Nothing is sent for a school that never configured dismissal.
    assert settings["enabled"] is False
    assert settings["closing_times"] == {
        "monday": "15:30", "tuesday": "15:30", "wednesday": "15:30",
        "thursday": "15:30", "friday": "15:30", "saturday": None, "sunday": None,
    }
    assert settings["reminder_enabled"] is True
    assert settings["reminder_lead_minutes"] == 30
    assert settings["authorized_guardians_only"] is True
    assert settings["late_pickup_after_minutes"] == 15


async def test_dismissal_schedule_round_trips_and_is_audited(client):
    headers = await _admin_session(client, "dismissal-save")
    payload = _payload(
        closing_times={
            "monday": "14:00", "tuesday": "14:00", "wednesday": "14:00",
            "thursday": "14:00", "friday": "13:30", "saturday": "11:00", "sunday": None,
        },
        reminder_lead_minutes=45,
        authorized_guardians_only=False,
        late_pickup_after_minutes=20,
    )

    saved = await client.put("/api/v1/school/dismissal-settings", headers=headers, json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["settings"]["closing_times"]["friday"] == "13:30"
    assert saved.json()["settings"]["closing_times"]["sunday"] is None

    reread = await client.get("/api/v1/school/dismissal-settings", headers=headers)
    settings = reread.json()["settings"]
    assert settings == saved.json()["settings"]
    assert settings["reminder_lead_minutes"] == 45
    assert settings["authorized_guardians_only"] is False
    assert settings["late_pickup_after_minutes"] == 20

    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        actions = (await session.execute(
            select(AuditEvent.action).where(AuditEvent.action == "school.dismissal_settings_updated")
        )).scalars().all()
    await engine.dispose()
    assert actions == ["school.dismissal_settings_updated"]


async def test_dismissal_validation_rejects_bad_schedules(client):
    headers = await _admin_session(client, "dismissal-invalid")

    def without(day: str):
        payload = _payload()
        del payload["closing_times"][day]
        return payload

    bad_time = _payload()
    bad_time["closing_times"]["monday"] = "3pm"
    unknown_day = _payload()
    unknown_day["closing_times"]["holiday"] = "12:00"

    cases = [
        bad_time,
        without("monday"),
        unknown_day,
        _payload(reminder_lead_minutes=1),
        _payload(reminder_lead_minutes=500),
        _payload(late_pickup_after_minutes=-5),
        _payload(not_a_setting=True),
    ]
    for payload in cases:
        response = await client.put(
            "/api/v1/school/dismissal-settings", headers=headers, json=payload,
        )
        assert response.status_code == 422, (payload, response.text)


async def test_dismissal_settings_are_per_school(client):
    first = await _admin_session(client, "dismissal-a")
    second = await _admin_session(client, "dismissal-b")

    saved = await client.put(
        "/api/v1/school/dismissal-settings", headers=first, json=_payload(reminder_lead_minutes=60),
    )
    assert saved.status_code == 200, saved.text

    other = await client.get("/api/v1/school/dismissal-settings", headers=second)
    assert other.json()["settings"]["enabled"] is False
    assert other.json()["settings"]["reminder_lead_minutes"] == 30
