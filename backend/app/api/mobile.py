"""Small, authenticated contracts used by native Acadex clients."""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import MembershipRole, MobilePushDevice, School

router = APIRouter(prefix="/api/v1/mobile", tags=["mobile app"])


class PushTokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=255, pattern=r"^ExponentPushToken\[[A-Za-z0-9_-]+\]$|^ExpoPushToken\[[A-Za-z0-9_-]+\]$")
    platform: Literal["ios", "android"]


class SchoolContactRequest(BaseModel):
    phone: str | None = Field(default=None, max_length=32, pattern=r"^\+?[0-9().\-\s]*$")


class SchoolContactResponse(BaseModel):
    phone: str | None


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
