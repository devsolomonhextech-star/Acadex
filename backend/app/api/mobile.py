"""Small, authenticated contracts used by native Acadex clients."""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import MembershipRole, MobilePushDevice

router = APIRouter(prefix="/api/v1/mobile", tags=["mobile app"])


class PushTokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=255, pattern=r"^ExponentPushToken\[[A-Za-z0-9_-]+\]$|^ExpoPushToken\[[A-Za-z0-9_-]+\]$")
    platform: Literal["ios", "android"]


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
