"""Small, authenticated contracts used by native Acadex clients."""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import AuditEvent, MembershipRole, MobilePushDevice, RefreshSession, School, User, utcnow
from app.security import hash_password, verify_password

router = APIRouter(prefix="/api/v1/mobile", tags=["mobile app"])


class PushTokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=255, pattern=r"^ExponentPushToken\[[A-Za-z0-9_-]+\]$|^ExpoPushToken\[[A-Za-z0-9_-]+\]$")
    platform: Literal["ios", "android"]


class SchoolContactRequest(BaseModel):
    phone: str | None = Field(default=None, max_length=32, pattern=r"^\+?[0-9().\-\s]*$")


class SchoolContactResponse(BaseModel):
    phone: str | None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class ParentNotificationPreferences(BaseModel):
    attendance: bool = True
    announcements: bool = True
    fees: bool = True
    reports: bool = True
    parent_desk: bool = True


DEFAULT_NOTIFICATION_PREFERENCES = {
    "attendance": True,
    "announcements": True,
    "fees": True,
    "reports": True,
    "parent_desk": True,
}


@router.get("/notification-preferences", response_model=ParentNotificationPreferences)
async def get_notification_preferences(
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ParentNotificationPreferences:
    user = await session.get(User, context.user_id)
    stored = user.notification_preferences if user and user.notification_preferences else {}
    return ParentNotificationPreferences(**{**DEFAULT_NOTIFICATION_PREFERENCES, **stored})


@router.put("/notification-preferences", response_model=ParentNotificationPreferences)
async def save_notification_preferences(
    payload: ParentNotificationPreferences,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ParentNotificationPreferences:
    user = await session.get(User, context.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Parent account not found")
    user.notification_preferences = payload.model_dump()
    await session.commit()
    return payload


@router.post("/password/change", status_code=204)
async def change_parent_password(
    payload: PasswordChangeRequest,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    user = await session.get(User, context.user_id, with_for_update=True)
    if user is None or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Your current password is incorrect")
    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Choose a password you have not used before")
    user.password_hash = hash_password(payload.new_password)
    now = utcnow()
    await session.execute(update(RefreshSession).where(
        RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None),
    ).values(revoked_at=now))
    session.add(AuditEvent(
        school_id=context.school_id, actor_user_id=user.id,
        action="auth.password_changed", resource_type="user", resource_id=user.id,
    ))
    await session.commit()


@router.get("/school-contact", response_model=SchoolContactResponse)
async def school_contact(
    context: Annotated[TenantContext, Depends(require_roles(
        MembershipRole.PARENT, MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL,
    ))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SchoolContactResponse:
    school = await session.get(School, context.school_id)
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    return SchoolContactResponse(phone=school.contact_phone)


@router.put("/school-contact", response_model=SchoolContactResponse)
async def update_school_contact(
    payload: SchoolContactRequest,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SchoolContactResponse:
    phone = payload.phone.strip() if payload.phone else None
    if phone and sum(character.isdigit() for character in phone) < 7:
        raise HTTPException(status_code=422, detail="Enter a valid phone number with at least 7 digits")
    school = await session.get(School, context.school_id)
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    school.contact_phone = phone or None
    await session.commit()
    return SchoolContactResponse(phone=school.contact_phone)


@router.put("/push-token", status_code=204)
async def register_push_token(
    payload: PushTokenRequest,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    device = await session.scalar(select(MobilePushDevice).where(
        MobilePushDevice.school_id == context.school_id,
        MobilePushDevice.user_id == context.user_id,
        MobilePushDevice.push_token == payload.token,
    ))
    if device is None:
        device = MobilePushDevice(
            school_id=context.school_id, user_id=context.user_id,
            push_token=payload.token, platform=payload.platform,
        )
        session.add(device)
    else:
        device.school_id = context.school_id
        device.platform = payload.platform
    await session.commit()


@router.delete("/push-token", status_code=204)
async def remove_push_token(
    payload: PushTokenRequest,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    device = await session.scalar(select(MobilePushDevice).where(
        MobilePushDevice.school_id == context.school_id,
        MobilePushDevice.user_id == context.user_id,
        MobilePushDevice.push_token == payload.token,
    ))
    if device is not None:
        await session.delete(device)
        await session.commit()
