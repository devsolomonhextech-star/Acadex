"""Smart Dismissal: closing times, pickup reminders, and handover rules.

A school configures one closing time per weekday (or leaves a day closed), how
long before closing parents are reminded, and what the gate needs before a
child is signed over. Nothing is sent until a school turns dismissal on, so a
school that never visits these settings keeps its current behaviour.
"""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import School

DAY_KEYS: tuple[str, ...] = (
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
)

DEFAULT_CLOSING_TIMES: dict[str, str | None] = {
    "monday": "15:30",
    "tuesday": "15:30",
    "wednesday": "15:30",
    "thursday": "15:30",
    "friday": "15:30",
    "saturday": None,
    "sunday": None,
}

DEFAULT_DISMISSAL: dict = {
    "enabled": False,
    "closing_times": dict(DEFAULT_CLOSING_TIMES),
    "reminder_enabled": True,
    "reminder_lead_minutes": 30,
    "authorized_guardians_only": True,
    "late_pickup_after_minutes": 15,
}

# The options the admin UI offers for reminder lead time, in minutes.
REMINDER_LEAD_CHOICES: tuple[int, ...] = (10, 15, 30, 45, 60, 90)


def resolve_dismissal(stored: dict | None) -> dict:
    """Merge saved values over the defaults; unknown keys are ignored."""
    saved = stored if isinstance(stored, dict) else {}
    closing = dict(DEFAULT_CLOSING_TIMES)
    saved_closing = saved.get("closing_times")
    if isinstance(saved_closing, dict):
        for day in DAY_KEYS:
            if day in saved_closing:
                value = saved_closing[day]
                closing[day] = value if isinstance(value, str) else None
    return {
        "enabled": bool(saved.get("enabled", DEFAULT_DISMISSAL["enabled"])),
        "closing_times": closing,
        "reminder_enabled": bool(saved.get("reminder_enabled", DEFAULT_DISMISSAL["reminder_enabled"])),
        "reminder_lead_minutes": int(saved.get(
            "reminder_lead_minutes", DEFAULT_DISMISSAL["reminder_lead_minutes"],
        )),
        "authorized_guardians_only": bool(saved.get(
            "authorized_guardians_only", DEFAULT_DISMISSAL["authorized_guardians_only"],
        )),
        "late_pickup_after_minutes": int(saved.get(
            "late_pickup_after_minutes", DEFAULT_DISMISSAL["late_pickup_after_minutes"],
        )),
    }


async def load_dismissal(session: AsyncSession, school_id: UUID) -> dict:
    stored = await session.scalar(
        select(School.dismissal_settings).where(School.id == school_id)
    )
    return resolve_dismissal(stored)


async def dismissal_enabled(session: AsyncSession, school_id: UUID) -> bool:
    return (await load_dismissal(session, school_id))["enabled"]
