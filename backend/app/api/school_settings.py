"""School-wide settings the admin controls from the web workspace."""
import re
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain.alert_settings import ALERT_CATALOG, load_alerts
from app.domain.dismissal import (
    DAY_KEYS,
    REMINDER_LEAD_CHOICES,
    load_dismissal,
    resolve_dismissal,
)
from app.models import AuditEvent, MembershipRole, School

router = APIRouter(prefix="/api/v1/school", tags=["school settings"])

READ_ROLES = (
    MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR,
    MembershipRole.TEACHER, MembershipRole.FINANCE, MembershipRole.STAFF,
)
WRITE_ROLES = (MembershipRole.SCHOOL_ADMIN,)

CLOSING_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class AlertCategory(BaseModel):
    key: str
    label: str
    description: str


class AlertSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    attendance: bool
    fees: bool
    results: bool
    parent_desk: bool


class AlertSettingsResponse(BaseModel):
    alerts: dict[str, bool]
    categories: list[AlertCategory]
    can_edit: bool


def _response(alerts: dict[str, bool], can_edit: bool) -> AlertSettingsResponse:
    return AlertSettingsResponse(
        alerts=alerts,
        categories=[
            AlertCategory(key=kind, label=label, description=description)
            for kind, label, description in ALERT_CATALOG
        ],
        can_edit=can_edit,
    )


class DismissalSettingsUpdate(BaseModel):
    """The complete Smart Dismissal configuration, saved in one request."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool
    closing_times: dict[str, str | None]
    reminder_enabled: bool
    reminder_lead_minutes: int = Field(ge=5, le=180)
    authorized_guardians_only: bool
    late_pickup_after_minutes: int = Field(ge=0, le=120)

    @field_validator("closing_times")
    @classmethod
    def closing_times_cover_every_day(cls, value: dict[str, str | None]) -> dict[str, str | None]:
        unknown = set(value) - set(DAY_KEYS)
        if unknown:
            raise ValueError(f"Unknown day(s): {', '.join(sorted(unknown))}")
        missing = set(DAY_KEYS) - set(value)
        if missing:
            raise ValueError(
                f"Include a closing time for every day, using null when closed: "
                f"{', '.join(sorted(missing))} missing"
            )
        for day, closing in value.items():
            if closing is not None and not CLOSING_TIME.match(closing):
                raise ValueError(f"Closing time for {day} must be HH:MM")
        return value


class DismissalSettingsResponse(BaseModel):
    settings: dict
    days: list[str]
    reminder_lead_choices: list[int]
    can_edit: bool


def _dismissal_response(settings: dict, can_edit: bool) -> DismissalSettingsResponse:
    return DismissalSettingsResponse(
        settings=settings, days=list(DAY_KEYS),
        reminder_lead_choices=list(REMINDER_LEAD_CHOICES), can_edit=can_edit,
    )


@router.get("/alert-settings", response_model=AlertSettingsResponse)
async def get_alert_settings(
    context: Annotated[TenantContext, Depends(require_roles(*READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AlertSettingsResponse:
    return _response(
        await load_alerts(session, context.school_id),
        can_edit=context.role == MembershipRole.SCHOOL_ADMIN,
    )


@router.put("/alert-settings", response_model=AlertSettingsResponse)
async def update_alert_settings(
    payload: AlertSettingsUpdate,
    context: Annotated[TenantContext, Depends(require_roles(*WRITE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AlertSettingsResponse:
    alerts = payload.model_dump()
    school = await session.scalar(select(School).where(School.id == context.school_id))
    if school is None:
        raise RuntimeError("School not found for an authenticated membership")
    school.notification_settings = alerts
    session.add(AuditEvent(
        school_id=context.school_id, actor_user_id=context.user_id,
        action="school.alert_settings_updated", resource_type="school",
        resource_id=context.school_id, details={"alerts": alerts},
    ))
    await session.commit()
    return _response(alerts, can_edit=True)


@router.get("/dismissal-settings", response_model=DismissalSettingsResponse)
async def get_dismissal_settings(
    context: Annotated[TenantContext, Depends(require_roles(*READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DismissalSettingsResponse:
    return _dismissal_response(
        await load_dismissal(session, context.school_id),
        can_edit=context.role == MembershipRole.SCHOOL_ADMIN,
    )


@router.put("/dismissal-settings", response_model=DismissalSettingsResponse)
async def update_dismissal_settings(
    payload: DismissalSettingsUpdate,
    context: Annotated[TenantContext, Depends(require_roles(*WRITE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DismissalSettingsResponse:
    settings = resolve_dismissal(payload.model_dump())
    school = await session.scalar(select(School).where(School.id == context.school_id))
    if school is None:
        raise RuntimeError("School not found for an authenticated membership")
    school.dismissal_settings = settings
    session.add(AuditEvent(
        school_id=context.school_id, actor_user_id=context.user_id,
        action="school.dismissal_settings_updated", resource_type="school",
        resource_id=context.school_id, details=settings,
    ))
    await session.commit()
    return _dismissal_response(settings, can_edit=True)