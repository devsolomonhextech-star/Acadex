from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.rate_limit import enforce_ip_limit
from app.security import create_access_token


def register(client, slug="north-star"):
    return client.post("/api/v1/onboarding/schools", json={
        "school_name": "North Star Academy",
        "school_slug": slug,
        "administrator_name": "Ama Mensah",
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })


def login(client, slug="north-star"):
    return client.post("/api/v1/auth/login", json={
        "school_slug": slug,
        "email": f"admin-{slug}@example.com",
        "password": "correct-horse-battery-staple",
    })


async def signup_and_login(client, slug="north-star"):
    created = await register(client, slug)
    assert created.status_code == 201, created.text
    signed_in = await login(client, slug)
    assert signed_in.status_code == 200, signed_in.text
    return signed_in.json()["access_token"]


async def test_school_registration_login_and_current_user(client):
    created = await register(client)
    assert created.status_code == 201, created.text

    signed_in = await login(client)
    assert signed_in.status_code == 200
    body = signed_in.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 600
    assert "schoolos_refresh" in signed_in.cookies
    assert "schoolos_csrf" in signed_in.cookies

    current = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert current.status_code == 200
    assert current.json()["school_slug"] == "north-star"
    assert current.json()["role"] == "school_admin"


async def test_membership_is_rechecked_and_school_scope_cannot_be_forged(client):
    await register(client)
    signed_in = (await login(client)).json()
    user = (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {signed_in['access_token']}"})).json()
    signed_token = create_access_token(UUID(user["user_id"]), uuid4(), "school_admin")
    result = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {signed_token}"})
    assert result.status_code == 403


async def test_refresh_rotates_cookie_and_rejects_replay(client):
    created = await register(client)
    assert created.status_code == 201, created.text
    signed_in = await login(client)
    old_refresh = signed_in.cookies["schoolos_refresh"]
    old_csrf = signed_in.cookies["schoolos_csrf"]

    rotated = await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": old_csrf})
    assert rotated.status_code == 200
    new_refresh = client.cookies.get("schoolos_refresh")
    assert new_refresh and new_refresh != old_refresh
    new_csrf = rotated.json()["csrf_token"]

    client.cookies.set("schoolos_refresh", old_refresh, path="/api/v1/auth")
    client.cookies.set("schoolos_csrf", old_csrf, path="/")
    replay = await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": old_csrf})
    assert replay.status_code == 401

    client.cookies.set("schoolos_refresh", new_refresh, path="/api/v1/auth")
    client.cookies.set("schoolos_csrf", new_csrf, path="/")
    revoked_family = await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": new_csrf})
    assert revoked_family.status_code == 401


async def test_refresh_requires_csrf_header(client):
    await register(client)
    await login(client)
    result = await client.post("/api/v1/auth/refresh")
    assert result.status_code == 403


async def test_invalid_registration_and_duplicate_school_are_rejected(client):
    invalid = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "X", "school_slug": "Bad Slug", "administrator_name": "A",
        "email": "not-an-email", "password": "short",
    })
    assert invalid.status_code == 422
    created = await register(client)
    assert created.status_code == 201, created.text
    duplicate = await register(client)
    assert duplicate.status_code == 409


@pytest.mark.asyncio
async def test_ip_rate_limit_blocks_after_configured_attempts():
    class FakeRedis:
        def __init__(self):
            self.counts = {}

        async def eval(self, script, number_of_keys, key, window_seconds):
            self.counts[key] = self.counts.get(key, 0) + 1
            return [self.counts[key], window_seconds]

    redis = FakeRedis()
    scope = {
        "type": "http",
        "client": ("203.0.113.10", 12345),
        "app": SimpleNamespace(state=SimpleNamespace(redis=redis)),
    }
    request = Request(scope)
    await enforce_ip_limit(request, "test", limit=2, window_seconds=60)
    await enforce_ip_limit(request, "test", limit=2, window_seconds=60)
    with pytest.raises(HTTPException) as blocked:
        await enforce_ip_limit(request, "test", limit=2, window_seconds=60)
    assert blocked.value.status_code == 429
    assert blocked.value.headers["Retry-After"] == "60"


async def test_student_directory_is_paginated_normalized_and_tenant_scoped(client):
    north_token = await signup_and_login(client)
    create = await client.post("/api/v1/students", headers={"Authorization": f"Bearer {north_token}"}, json={
        "admission_number": " ns-001 ",
        "first_name": "  Ama   Serwaa ",
        "last_name": "Mensah",
        "date_of_birth": "2014-04-12",
    })
    assert create.status_code == 201, create.text
    student = create.json()
    assert student["admission_number"] == "NS-001"
    assert student["first_name"] == "Ama Serwaa"

    duplicate = await client.post("/api/v1/students", headers={"Authorization": f"Bearer {north_token}"}, json={
        "admission_number": "ns-001", "first_name": "Another", "last_name": "Student",
    })
    assert duplicate.status_code == 409

    north_list = await client.get("/api/v1/students?search=serwaa&page=1&page_size=1", headers={"Authorization": f"Bearer {north_token}"})
    assert north_list.status_code == 200
    assert north_list.json()["total"] == 1
    assert len(north_list.json()["items"]) == 1

    south_token = await signup_and_login(client, "south-star")
    denied = await client.get(f"/api/v1/students/{student['id']}", headers={"Authorization": f"Bearer {south_token}"})
    assert denied.status_code == 404
    south_list = await client.get("/api/v1/students", headers={"Authorization": f"Bearer {south_token}"})
    assert south_list.status_code == 200
    assert south_list.json()["total"] == 0
