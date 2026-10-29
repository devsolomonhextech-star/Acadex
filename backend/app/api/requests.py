"""Two-way parent ↔ school requests.

Parents raise a request from the parent app (or the web portal); the school
answers from the Communications inbox. Every turn writes a durable
``Notification`` for the other party and a best-effort push to that party's
devices, so a reply never depends on the other side refreshing a screen.
"""
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain import requests as request_domain
from app.domain.requests import RequestSummary
from app.push import send_expo_push

school_router = APIRouter(prefix="/api/v1/communications", tags=["communications"])
family_router = APIRouter(prefix="/api/v1/family", tags=["family"])

STAFF_ROLES = (models.MembershipRole.SCHOOL_ADMIN, models.MembershipRole.PRINCIPAL)
PUSH_PREVIEW = 140
INBOX_LINK = "/parent-reports"


class RequestMessageResponse(BaseModel):
    id: UUID
    author_role: str
    author_name: str
    body: str
    created_at: datetime


class ParentRequestSummaryResponse(BaseModel):
    id: UUID
    reference: str
    topic: str
    subject: str
    status: str
    student_id: UUID | None = None
    student_name: str | None = None
    admission_number: str | None = None
    guardian_name: str
    guardian_email: str | None = None
    guardian_phone: str | None = None
    preview: str
    last_message_at: datetime
    last_message_by: str
    message_count: int
    unread: bool
    created_at: datetime
    first_school_reply_at: datetime | None = None
    resolved_at: datetime | None = None


class ParentRequestDetailResponse(ParentRequestSummaryResponse):
    messages: list[RequestMessageResponse]


class ParentRequestListResponse(BaseModel):
    items: list[ParentRequestSummaryResponse]
    total: int
    page: int
    page_size: int
    counts: dict[str, int]


class ParentRequestInboxResponse(BaseModel):
    items: list[ParentRequestSummaryResponse]
    counts: dict[str, int]


class ParentRequestCreate(BaseModel):
    topic: Literal["absence", "documents", "meeting", "fees", "details", "other"]
    subject: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=10, max_length=4000)
    student_id: UUID | None = None


class RequestMessageCreate(BaseModel):
    body: str = Field(min_length=2, max_length=4000)


class RequestStatusUpdate(BaseModel):
    status: Literal["resolved", "open"]


def _student_name(summary: RequestSummary) -> tuple[str | None, str | None]:
    if summary.student is None:
        return None, None
    return f"{summary.student.first_name} {summary.student.last_name}", summary.student.admission_number


def _summary_response(summary: RequestSummary, unread: bool | None = None) -> ParentRequestSummaryResponse:
    request = summary.request
    student_name, admission_number = _student_name(summary)
    return ParentRequestSummaryResponse(
        id=request.id,
        reference=request.reference,
        topic=request.topic,
        subject=request.subject,
        status=request.status,
        student_id=request.student_id,
        student_name=student_name,
        admission_number=admission_number,
        guardian_name=f"{summary.guardian.first_name} {summary.guardian.last_name}",
        guardian_email=summary.guardian.email,
        guardian_phone=summary.guardian.phone,
        preview=request.last_message_preview,
        last_message_at=request.last_message_at,
        last_message_by=request.last_message_by,
        message_count=summary.message_count,
        unread=summary.unread if unread is None else unread,
        created_at=request.created_at,
        first_school_reply_at=request.first_school_reply_at,
        resolved_at=request.resolved_at,
    )


async def _detail_response(session: AsyncSession, summary: RequestSummary) -> ParentRequestDetailResponse:
    messages = await request_domain.thread_messages(session, summary.request.school_id, summary.request.id)
    names = await request_domain.author_names(session, messages)
    payload = _summary_response(summary, unread=False).model_dump()
    return ParentRequestDetailResponse(
        **payload,
        messages=[
            RequestMessageResponse(
                id=message.id,
                author_role=message.author_role,
                author_name=names.get(message.author_user_id, "School office" if message.author_role == "school" else "Parent"),
                body=message.body,
                created_at=message.created_at,
            )
            for message in messages
        ],
    )


def _push_body(text: str) -> str:
    collapsed = " ".join(text.split())
    return collapsed if len(collapsed) <= PUSH_PREVIEW else f"{collapsed[:PUSH_PREVIEW - 1]}…"


def _notify(
    session: AsyncSession,
    *,
    school_id: UUID,
    user_ids: list[UUID],
    title: str,
    body: str,
    kind: str,
    link: str,
) -> None:
    for user_id in user_ids:
        session.add(
            models.Notification(
                school_id=school_id,
                user_id=user_id,
                title=title,
                body=body,
                type=kind,
                link=link,
            )
        )


@school_router.get("/requests", response_model=ParentRequestListResponse)
async def list_school_requests(
    context: Annotated[TenantContext, Depends(require_roles(*STAFF_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    status_filter: Annotated[str, Query(alias="status")] = "all",
    search: str = "",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ParentRequestListResponse:
    try:
        result = await request_domain.list_school_requests(
            session,
            context.school_id,
            status=status_filter,
            search=search,
            page=page,
            page_size=page_size,
        )
    except request_domain.ParentRequestInvalid as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    return ParentRequestListResponse(
        items=[_summary_response(item) for item in result.items],
        total=result.total,
        page=page,
        page_size=page_size,
        counts=result.counts,
    )


@school_router.get("/requests/{request_id}", response_model=ParentRequestDetailResponse)
async def get_school_request(
    request_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*STAFF_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ParentRequestDetailResponse:
    try:
        summary = await request_domain.get_school_request(session, context.school_id, request_id)
    except request_domain.ParentRequestNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    await request_domain.mark_read(session, summary.request, "school")
    await session.commit()
    return await _detail_response(session, summary)


@school_router.post("/requests/{request_id}/messages", response_model=ParentRequestDetailResponse)
async def reply_to_request(
    request_id: UUID,
    payload: RequestMessageCreate,
    background: BackgroundTasks,
    context: Annotated[TenantContext, Depends(require_roles(*STAFF_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ParentRequestDetailResponse:
    try:
        summary = await request_domain.get_school_request(session, context.school_id, request_id)
    except request_domain.ParentRequestNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    try:
        await request_domain.add_message(
            session,
            summary.request,
            author_user_id=context.user_id,
            author_role="school",
            body=payload.body,
        )
    except request_domain.ParentRequestInvalid as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    school = await request_domain.school_name(session, context.school_id)
    title = f"New reply from {school}"
    body = _push_body(payload.body)
    recipients = [summary.guardian.user_id] if summary.guardian.user_id else []
    _notify(
        session,
        school_id=context.school_id,
        user_ids=recipients,
        title=title,
        body=body,
        kind="parent_request_reply",
        link=f"/parents?request={summary.request.id}",
    )
    await session.commit()
    background.add_task(
        send_expo_push, context.school_id, recipients, title, body,
        {"link": f"/parents?request={summary.request.id}"},
    )
    return await _detail_response(session, summary)


@school_router.patch("/requests/{request_id}", response_model=ParentRequestDetailResponse)
async def update_request_status(
    request_id: UUID,
    payload: RequestStatusUpdate,
    background: BackgroundTasks,
    context: Annotated[TenantContext, Depends(require_roles(*STAFF_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ParentRequestDetailResponse:
    try:
        summary = await request_domain.get_school_request(session, context.school_id, request_id)
    except request_domain.ParentRequestNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    request = summary.request
    resolved = payload.status == "resolved"
    changed = (request.status == request_domain.RESOLVED) != resolved
    await request_domain.set_resolved(session, request, user_id=context.user_id, resolved=resolved)
    title = "Request resolved"
    body = f"{request.subject} · {request.reference}"
    recipients = [summary.guardian.user_id] if summary.guardian.user_id else []
    if changed:
        _notify(
            session,
            school_id=context.school_id,
            user_ids=recipients,
            title=title,
            body=body,
            kind="parent_request_resolved",
            link=f"/parents?request={request.id}",
        )
    await session.commit()
    if changed:
        background.add_task(
        send_expo_push, context.school_id, recipients, title, body,
        {"link": f"/parents?request={request.id}"},
    )
    return await _detail_response(session, summary)


@family_router.get("/requests", response_model=ParentRequestInboxResponse)
async def list_parent_requests(
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ParentRequestInboxResponse:
    try:
        guardian = await request_domain.require_guardian(session, context.school_id, context.user_id)
    except request_domain.ParentRequestDenied as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    items = await request_domain.list_parent_requests(session, context.school_id, guardian.id)
    return ParentRequestInboxResponse(
        items=[_summary_response(item) for item in items],
        counts=await request_domain.parent_counts(session, context.school_id, guardian.id),
    )


@family_router.get("/requests/{request_id}", response_model=ParentRequestDetailResponse)
async def get_parent_request(
    request_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ParentRequestDetailResponse:
    try:
        guardian = await request_domain.require_guardian(session, context.school_id, context.user_id)
        summary = await request_domain.get_parent_request(
            session, context.school_id, guardian.id, request_id
        )
    except request_domain.ParentRequestNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    except request_domain.ParentRequestDenied as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    await request_domain.mark_read(session, summary.request, "parent")
    await session.commit()
    return await _detail_response(session, summary)


@family_router.post(
    "/requests", status_code=status.HTTP_201_CREATED, response_model=ParentRequestDetailResponse
)
async def create_parent_request(
    payload: ParentRequestCreate,
    background: BackgroundTasks,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ParentRequestDetailResponse:
    try:
        guardian = await request_domain.require_guardian(session, context.school_id, context.user_id)
        student = (
            await request_domain.require_linked_student(
                session, context.school_id, guardian.id, payload.student_id
            )
            if payload.student_id
            else None
        )
        request = await request_domain.create_request(
            session,
            school_id=context.school_id,
            guardian=guardian,
            user_id=context.user_id,
            topic=payload.topic,
            subject=payload.subject,
            body=payload.message,
            student=student,
        )
    except request_domain.ParentRequestDenied as error:
        raise HTTPException(status_code=403, detail=str(error)) from None
    except request_domain.ParentRequestInvalid as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    guardian_name = f"{guardian.first_name} {guardian.last_name}"
    title = f"New parent request · {guardian_name}"
    body = f"{request.subject} ({request.reference}) — {_push_body(payload.message)}"
    link = f"{INBOX_LINK}?request={request.id}"
    admin_ids = await request_domain.school_admin_user_ids(session, context.school_id)
    _notify(
        session,
        school_id=context.school_id,
        user_ids=admin_ids,
        title=title,
        body=body,
        kind="parent_request",
        link=link,
    )
    await session.commit()
    background.add_task(send_expo_push, context.school_id, admin_ids, title, body, {"link": link})
    summary = await request_domain.get_parent_request(
        session, context.school_id, guardian.id, request.id
    )
    return await _detail_response(session, summary)


@family_router.post("/requests/{request_id}/messages", response_model=ParentRequestDetailResponse)
async def reply_to_school(
    request_id: UUID,
    payload: RequestMessageCreate,
    background: BackgroundTasks,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ParentRequestDetailResponse:
    try:
        guardian = await request_domain.require_guardian(session, context.school_id, context.user_id)
        summary = await request_domain.get_parent_request(
            session, context.school_id, guardian.id, request_id
        )
    except request_domain.ParentRequestNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    except request_domain.ParentRequestDenied as error:
        raise HTTPException(status_code=404, detail=str(error)) from None
    try:
        await request_domain.add_message(
            session,
            summary.request,
            author_user_id=context.user_id,
            author_role="parent",
            body=payload.body,
        )
    except request_domain.ParentRequestInvalid as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    guardian_name = f"{guardian.first_name} {guardian.last_name}"
    title = f"New parent message · {guardian_name}"
    body = f"{summary.request.subject} — {_push_body(payload.body)}"
    link = f"{INBOX_LINK}?request={summary.request.id}"
    admin_ids = await request_domain.school_admin_user_ids(session, context.school_id)
    _notify(
        session,
        school_id=context.school_id,
        user_ids=admin_ids,
        title=title,
        body=body,
        kind="parent_request",
        link=link,
    )
    await session.commit()
    background.add_task(send_expo_push, context.school_id, admin_ids, title, body, {"link": link})
    return await _detail_response(session, summary)
