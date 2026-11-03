"""The superadmin console's separate login and platform-wide views."""
import os
from datetime import UTC, datetime

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import (
    MembershipRole,
    PlatformAdmin,
    School,
    SchoolMembership,
    SchoolSubscription,
    Student,
    User,
    utcnow,
)
from app.security import hash_password

PASSWORD = "platform-console-password"


async def _seed_superadmin(email: str = "root@acadex.app", **overrides):
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        user = User(
            email=email, display_name="Platform Root",
            password_hash=hash_password(PASSWORD), email_verified_at=utcnow(),
        )
        session.add(user)
        await session.flush()
        admin = PlatformAdmin(
            user_id=user.id, role=overrides.get("role", "superadmin"),
            status=overrides.get("status", "active"),
        )
        session.add(admin)
        await session.commit()
    await engine.dispose()


async def _login(client, email: str = "root@acadex.app"):
    return await client.post("/api/v1/platform/auth/login", json={"email": email, "password": PASSWORD})


async def test_platform_login_returns_console_session_and_identity(client):
    await _seed_superadmin()

    response = await _login(client)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["admin"]["email"] == "root@acadex.app"
    assert body["admin"]["role"] == "superadmin"
    assert body["access_token"]
    assert body["expires_in"] > 0
    assert client.cookies.get("acadex_platform_refresh")

    me = await client.get("/api/v1/platform/auth/me",
                          headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200, me.text
    assert me.json()["display_name"] == "Platform Root"


async def test_platform_login_rejects_school_accounts_and_bad_credentials(client):
    await _seed_superadmin("suspended@acadex.app", status="suspended")
    # A school administrator is a valid Acadex user, but not a platform admin.
    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Only School", "school_slug": "only-school",
        "administrator_name": "School Admin", "email": "school-admin@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        await session.execute(update(User).where(
            User.email == "school-admin@example.com",
        ).values(email_verified_at=utcnow()))
        await session.commit()
    await engine.dispose()

    wrong = await client.post("/api/v1/platform/auth/login",
                              json={"email": "root@acadex.app", "password": "not-the-password"})
    assert wrong.status_code == 401
    missing = await _login(client, "nobody@acadex.app")
    assert missing.status_code == 401
    suspended = await _login(client, "suspended@acadex.app")
    assert suspended.status_code == 401
    school_user = await client.post("/api/v1/platform/auth/login",
                                    json={"email": "school-admin@example.com", "password": "correct-horse-battery-staple"})
    assert school_user.status_code == 401


async def test_platform_tokens_cannot_reach_school_endpoints_and_vice_versa(client):
    await _seed_superadmin()
    platform_token = (await _login(client)).json()["access_token"]

    denied = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {platform_token}"})
    assert denied.status_code == 401

    created = await client.post("/api/v1/onboarding/schools", json={
        "school_name": "Tenant School", "school_slug": "tenant-school",
        "administrator_name": "Tenant Admin", "email": "tenant@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert created.status_code == 201, created.text
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        user_id = await session.scalar(select(User.id).where(User.email == "tenant@example.com"))
        await session.execute(update(User).where(User.id == user_id).values(email_verified_at=utcnow()))
        await session.commit()
    await engine.dispose()
    signed_in = await client.post("/api/v1/auth/login", json={
        "school_slug": "tenant-school", "email": "tenant@example.com",
        "password": "correct-horse-battery-staple",
    })
    assert signed_in.status_code == 200, signed_in.text
    school_token = signed_in.json()["access_token"]

    denied_console = await client.get("/api/v1/platform/overview",
                                      headers={"Authorization": f"Bearer {school_token}"})
    assert denied_console.status_code == 401
    assert (await client.get("/api/v1/platform/schools")).status_code == 401


async def test_console_refresh_rotates_and_logout_revokes(client):
    await _seed_superadmin()
    login = await _login(client)
    csrf = login.json()["csrf_token"]
    first_refresh = client.cookies.get("acadex_platform_refresh")

    rotated = await client.post("/api/v1/platform/auth/refresh", headers={"X-CSRF-Token": csrf})
    assert rotated.status_code == 200, rotated.text
    assert rotated.json()["access_token"]
    assert client.cookies.get("acadex_platform_refresh") != first_refresh

    replay = await client.post(
        "/api/v1/platform/auth/refresh",
        headers={"X-CSRF-Token": csrf},
        cookies={"acadex_platform_refresh": first_refresh, "acadex_platform_csrf": csrf},
    )
    assert replay.status_code == 401

    no_header = await client.post("/api/v1/platform/auth/refresh")
    assert no_header.status_code == 403

    logout = await client.post("/api/v1/platform/auth/logout", headers={"X-CSRF-Token": csrf})
    assert logout.status_code == 204
    after = await client.post("/api/v1/platform/auth/refresh", headers={"X-CSRF-Token": csrf})
    assert after.status_code in (401, 403)


async def test_platform_overview_counts_across_schools(client):
    await _seed_superadmin()
    token = (await _login(client)).json()["access_token"]
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        first = School(name="Alpha Academy", slug="alpha-academy", status="active")
        second = School(name="Beta Basic", slug="beta-basic", status="inactive")
        admin_user = User(email="alpha-admin@example.com", display_name="Alpha Admin",
                          password_hash=hash_password(PASSWORD), email_verified_at=utcnow())
        session.add_all([first, second, admin_user])
        await session.flush()
        session.add_all([
            SchoolMembership(school_id=first.id, user_id=admin_user.id, role=MembershipRole.SCHOOL_ADMIN),
            SchoolMembership(school_id=second.id, user_id=admin_user.id, role=MembershipRole.PARENT),
            SchoolSubscription(school_id=first.id, student_limit=180, status="active"),
            Student(school_id=first.id, admission_number="ADM-1", first_name="Ama", last_name="Mensah"),
            Student(school_id=first.id, admission_number="ADM-2", first_name="Kofi", last_name="Boateng"),
            Student(school_id=second.id, admission_number="ADM-1", first_name="Yaa", last_name="Owusu"),
        ])
        await session.commit()
    await engine.dispose()

    overview = await client.get("/api/v1/platform/overview",
                                headers={"Authorization": f"Bearer {token}"})
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["schools_total"] == 2
    assert body["schools_active"] == 1
    assert body["students_total"] == 3
    assert body["active_subscriptions"] == 1
    assert body["licensed_students"] == 180
    assert body["members_by_role"]["school_admin"] == 1
    assert body["members_by_role"]["parent"] == 1
    assert len(body["signups"]) == 6
    assert body["signups"][-1]["month"] == datetime.now(UTC).strftime("%Y-%m")
    assert {school["slug"] for school in body["recent_schools"]} == {"beta-basic", "alpha-academy"}
    alpha = next(school for school in body["recent_schools"] if school["slug"] == "alpha-academy")
    assert alpha["student_count"] == 2
    assert alpha["student_limit"] == 180
    assert alpha["admin_email"] == "alpha-admin@example.com"


async def test_platform_school_list_search_filter_and_paging(client):
    await _seed_superadmin()
    token = (await _login(client)).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        session.add_all([
            School(name="Accra Grammar", slug="accra-grammar", status="active"),
            School(name="Kumasi High", slug="kumasi-high", status="active"),
            School(name="Tamale Closed", slug="tamale-closed", status="inactive"),
        ])
        await session.commit()
    await engine.dispose()

    everything = await client.get("/api/v1/platform/schools", headers=headers)
    assert everything.status_code == 200, everything.text
    assert everything.json()["total"] == 3
    assert len(everything.json()["items"]) == 3

    searched = await client.get("/api/v1/platform/schools?search=accra", headers=headers)
    assert [school["slug"] for school in searched.json()["items"]] == ["accra-grammar"]

    inactive = await client.get("/api/v1/platform/schools?status=inactive", headers=headers)
    assert [school["slug"] for school in inactive.json()["items"]] == ["tamale-closed"]

    page = await client.get("/api/v1/platform/schools?limit=1&offset=1", headers=headers)
    assert page.json()["total"] == 3
    assert len(page.json()["items"]) == 1

    invalid = await client.get("/api/v1/platform/schools?status=deleted", headers=headers)
    assert invalid.status_code == 422


@pytest.mark.parametrize("path", ["/api/v1/platform/overview", "/api/v1/platform/schools", "/api/v1/platform/auth/me"])
async def test_console_endpoints_require_a_token(client, path):
    assert (await client.get(path)).status_code == 401


async def test_suspended_admin_loses_existing_console_session(client):
    await _seed_superadmin()
    token = (await _login(client)).json()["access_token"]
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"])
    async with async_sessionmaker(engine)() as session:
        await session.execute(update(PlatformAdmin).values(status="suspended"))
        await session.commit()
    await engine.dispose()
    assert (await client.get("/api/v1/platform/overview",
                             headers={"Authorization": f"Bearer {token}"})).status_code == 403
