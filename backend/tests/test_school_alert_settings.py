"""School-wide alert switches from Settings > Notifications."""
from test_attendance_notifications import _mark, _parent_alerts, _setup

from app.domain.alert_settings import resolve_alerts

ALL_ON = {"attendance": True, "fees": True, "results": True, "parent_desk": True}


def test_resolve_alerts_defaults_missing_keys_to_on():
    assert resolve_alerts(None) == ALL_ON
    assert resolve_alerts({"attendance": False}) == {**ALL_ON, "attendance": False}
    # Unknown keys from an older or newer client are ignored, not echoed back.
    assert resolve_alerts({"attendance": False, "sms": True}) == {
        **ALL_ON, "attendance": False,
    }


async def test_switching_absence_alerts_off_suppresses_parent_notifications(client):
    ctx = await _setup(client, "alert-switch")

    settings = await client.get("/api/v1/school/alert-settings", headers=ctx["admin"])
    assert settings.status_code == 200, settings.text
    assert settings.json()["alerts"] == ALL_ON
    assert settings.json()["can_edit"] is True
    assert [category["key"] for category in settings.json()["categories"]] == list(ALL_ON)

    saved = await client.put("/api/v1/school/alert-settings", headers=ctx["admin"], json={
        **ALL_ON, "attendance": False,
    })
    assert saved.status_code == 200, saved.text
    assert saved.json()["alerts"]["attendance"] is False

    await _mark(client, ctx, "2026-11-02", "absent")
    assert await _parent_alerts(client, ctx) == [], "a switched-off alert must not reach the parent"

    await client.put("/api/v1/school/alert-settings", headers=ctx["admin"], json=ALL_ON)
    await _mark(client, ctx, "2026-11-03", "absent")
    alerts = await _parent_alerts(client, ctx)
    assert len(alerts) == 1, alerts
    assert alerts[0]["link"].endswith("date=2026-11-03")


async def test_only_school_admins_can_change_alert_settings(client):
    ctx = await _setup(client, "alert-roles")
    as_parent = await client.get("/api/v1/school/alert-settings", headers=ctx["parent"])
    assert as_parent.status_code == 403
    changed = await client.put(
        "/api/v1/school/alert-settings", headers=ctx["parent"], json=ALL_ON,
    )
    assert changed.status_code == 403
    unchanged = await client.get("/api/v1/school/alert-settings", headers=ctx["admin"])
    assert unchanged.json()["alerts"] == ALL_ON


async def test_alert_settings_require_every_switch(client):
    ctx = await _setup(client, "alert-validation")
    rejected = await client.put(
        "/api/v1/school/alert-settings", headers=ctx["admin"], json={"attendance": False},
    )
    assert rejected.status_code == 422, rejected.text
    unknown = await client.put(
        "/api/v1/school/alert-settings", headers=ctx["admin"], json={**ALL_ON, "sms": True},
    )
    assert unknown.status_code == 422, unknown.text