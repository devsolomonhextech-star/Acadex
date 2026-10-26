"""Free trial: new institutions get three months of full access, then paid seats apply."""
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.domain.subscriptions import trial_active, trial_days_remaining, trial_end_for
from app.models import School
from app.security import decode_access_token


async def _register(client, slug: str):
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": f"Trial {slug}",
        "school_slug": slug,
        "administrator_name": "Trial Admin",
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    login = await client.post("/api/v1/auth/login", json={
        "school_slug": slug,
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    school_id = UUID(decode_access_token(token)["school_id"])
    return {"Authorization": f"Bearer {token}"}, school_id


async def _set_trial_end(school_id: UUID, when: datetime) -> None:
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        await session.execute(update(School).where(School.id == school_id).values(trial_ends_at=when))
        await session.commit()
    await engine.dispose()


def test_trial_window_is_three_calendar_months():
    assert trial_end_for(datetime(2026, 10, 26, 12, 0, tzinfo=UTC)) == datetime(2027, 1, 26, 12, 0, tzinfo=UTC)
    # Month-end signups keep their day where possible (Dec 31 → Mar 31).
    assert trial_end_for(datetime(2026, 12, 31, 9, 0, tzinfo=UTC)) == datetime(2027, 3, 31, 9, 0, tzinfo=UTC)
    # Leap-safe: Feb keeps the last day of the month.
    assert trial_end_for(datetime(2026, 11, 30, 9, 0, tzinfo=UTC)) == datetime(2027, 2, 28, 9, 0, tzinfo=UTC)
    assert trial_active(None) is False
    assert trial_active(datetime(2020, 1, 1, tzinfo=UTC)) is False
    assert trial_active(datetime.now(UTC) + timedelta(days=1)) is True
    assert trial_days_remaining(None) == 0
    assert trial_days_remaining(datetime(2020, 1, 1, tzinfo=UTC)) == 0
    # The final day still counts as one day left.
    assert trial_days_remaining(datetime.now(UTC) + timedelta(hours=3)) == 1


async def test_new_school_starts_on_trial_with_countdown(client):
    headers, _ = await _register(client, "trial-a")
    response = await client.get("/api/v1/subscription", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "trial"
    assert data["in_trial"] is True
    assert 89 <= data["trial_days_remaining"] <= 93  # three calendar months
    assert datetime.fromisoformat(data["trial_ends_at"]) > datetime.now(UTC)


async def test_trial_enables_enrollment_without_paid_seats(client):
    headers, _ = await _register(client, "trial-b")
    # Fresh school: subscription is inactive with zero seats, but trial grants access.
    created = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": "TR-001",
        "first_name": "Ama",
        "last_name": "Mensah",
    })
    assert created.status_code == 201, created.text


async def test_expired_trial_requires_paid_seats(client):
    headers, school_id = await _register(client, "trial-c")
    await _set_trial_end(school_id, datetime.now(UTC) - timedelta(minutes=1))
    created = await client.post("/api/v1/students", headers=headers, json={
        "admission_number": "TR-002",
        "first_name": "Kwame",
        "last_name": "Asante",
    })
    assert created.status_code == 402, created.text
    detail = created.json()["detail"]
    assert detail["code"] == "student_subscription_required"
    status = await client.get("/api/v1/subscription", headers=headers)
    assert status.status_code == 200, status.text
    data = status.json()
    assert data["status"] == "inactive"
    assert data["in_trial"] is False
    assert data["trial_days_remaining"] == 0
    assert data["trial_ends_at"] is not None  # admins can still see when it ended
