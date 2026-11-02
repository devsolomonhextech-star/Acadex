"""School-wide switches for the automatic alerts Acadex sends to parents.

These are the school's policy; each parent can still narrow their own push
preferences in the app, but a switch turned off here means Acadex creates no
alert of that kind at all. Defaults are on so existing behaviour is unchanged.
"""
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import School

AlertKind = Literal["attendance", "fees", "results", "parent_desk"]

ALERT_CATALOG: tuple[tuple[AlertKind, str, str], ...] = (
    ("attendance", "Absence alerts", "Alert a parent as soon as their child is marked absent for the day."),
    ("fees", "Fee payment receipts", "Confirm every payment received, with its receipt number and remaining balance."),
    ("results", "Published results", "Tell parents when a class's term results are published."),
    ("parent_desk", "Parent Desk activity", "Alert parents when the school replies to a request or marks it resolved."),
)

DEFAULT_ALERTS: dict[str, bool] = {kind: True for kind, _, _ in ALERT_CATALOG}


def resolve_alerts(stored: dict | None) -> dict[str, bool]:
    """Merge saved values over the defaults; unknown keys are ignored."""
    saved = stored if isinstance(stored, dict) else {}
    return {kind: bool(saved.get(kind, True)) for kind, _, _ in ALERT_CATALOG}


async def load_alerts(session: AsyncSession, school_id: UUID) -> dict[str, bool]:
    stored = await session.scalar(
        select(School.notification_settings).where(School.id == school_id)
    )
    return resolve_alerts(stored)


async def alert_enabled(session: AsyncSession, school_id: UUID, kind: AlertKind) -> bool:
    return (await load_alerts(session, school_id))[kind]