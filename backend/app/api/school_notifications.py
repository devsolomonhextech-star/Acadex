"""Admin-to-parent notices: compose, preview the audience, send, review history."""
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain import notifications as notice_domain
from app.domain.notifications import SentNotice
from app.push import send_expo_push
from app.realtime import publish_user_event

router = APIRouter(prefix="/api/v1/communications", tags=["communications"])
STAFF_ROLES = (models.MembershipRole.SCHOOL_ADMIN, models.MembershipRole.PRINCIPAL)
PUSH_PREVIEW = 140


class NoticeCreate(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    body: str = Field(min_length=5, max_length=1000)
    audience: Literal["all_parents", "class", "student"]
    class_group_id: UUID | None = None
    student_id: UUID | None = None


class NoticeResponse(BaseModel):
    id: UUID
    title: str
    body: str
    audience: str
    class_group_id: UUID | None = None
    student_id: UUID | None = None
    recipient_count: int
    sent_by: str
    target_name: str | None = None
    created_at: datetime


class AudiencePreview(BaseModel):
    recipients: int


def _response(notice: SentNotice) -> NoticeResponse:
    campaign = notice.campaign
    return NoticeResponse(
        id=campaign.id,
        title=campaign.title,
        body=campaign.body,
        audience=campaign.audience,
        class_group_id=campaign.class_group_id,
        student_id=campaign.student_id,
        recipient_count=campaign.recipient_count,
        sent_by=notice.sent_by,
        target_name=notice.target_name,
        created_at=campaign.created_at,
    )


def _push_body(text: str) -> str:
    collapsed = " ".join(text.split())
    return collapsed if len(collapsed) <= PUSH_PREVIEW else f"{collapsed[:PUSH_PREVIEW - 1]}…"


@router.get("/notifications", response_model=list[NoticeResponse])
async def list_sent_notices(
    context: Annotated[TenantContext, Depends(require_roles(*STAFF_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[NoticeResponse]:
    notices = await notice_domain.recent_notices(session, context.school_id, limit=limit)
    return [_response(notice) for notice in notices]


@router.get("/notifications/preview", response_model=AudiencePreview)
async def preview_audience(
    context: Annotated[TenantContext, Depends(require_roles(*STAFF_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    audience: Literal["all_parents", "class", "student"] = "all_parents",
    class_group_id: UUID | None = None,
    student_id: UUID | None = None,
) -> AudiencePreview:
    try:
        recipients = await notice_domain.resolve_recipients(
            session,
            context.school_id,
            audience=audience,
            class_group_id=class_group_id,
            student_id=student_id,
        )
    except notice_domain.NotificationAudienceError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except notice_domain.NotificationTargetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    return AudiencePreview(recipients=len(recipients))


@router.post("/notifications", status_code=status.HTTP_201_CREATED, response_model=NoticeResponse)
async def send_notification(
    payload: NoticeCreate,
    background: BackgroundTasks,
    request: Request,
    context: Annotated[TenantContext, Depends(require_roles(*STAFF_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> NoticeResponse:
    try:
        notice = await notice_domain.send_notice(
            session,
            school_id=context.school_id,
            user_id=context.user_id,
            audience=payload.audience,
            title=payload.title,
            body=payload.body,
            class_group_id=payload.class_group_id,
            student_id=payload.student_id,
        )
    except notice_domain.NotificationAudienceError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except notice_domain.NotificationTargetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    await session.commit()
    await session.refresh(notice.campaign)
    for user_id in notice.recipients:
        await publish_user_event(request, context.school_id, user_id)
    background.add_task(
        send_expo_push,
        context.school_id,
        notice.recipients,
        notice.campaign.title,
        _push_body(payload.body),
        {"link": "/notifications", "preference_key": "announcements"},
    )
    return _response(notice)
