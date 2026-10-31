from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.auth import TenantContext, current_tenant, require_roles
from app.db import get_session
from app.domain.notifications import resolve_recipients
from app.domain.parent_notifications import dispatch_parent_notifications
from app.schemas import AnnouncementCreate, AnnouncementResponse, NotificationResponse

router = APIRouter(prefix="/api/v1", tags=["communications"])


@router.post("/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    payload: AnnouncementCreate,
    background: BackgroundTasks,
    request: Request,
    context: Annotated[TenantContext, Depends(require_roles("school_admin", "principal"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AnnouncementResponse:
    if payload.audience == "class" and not payload.class_group_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="class_group_id required for class audience")

    if payload.class_group_id:
        cls = await session.get(models.ClassGroup, payload.class_group_id)
        if not cls or cls.school_id != context.school_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")

    announcement = models.Announcement(
        school_id=context.school_id,
        title=payload.title,
        body=payload.body,
        audience=payload.audience,
        class_group_id=payload.class_group_id,
        published_by_user_id=context.user_id,
        expires_at=payload.expires_at,
    )
    session.add(announcement)
    parent_user_ids: list[UUID] = []
    if payload.audience in ("all", "parents"):
        parent_user_ids = await resolve_recipients(
            session, context.school_id, audience="all_parents",
        )
    elif payload.audience == "class" and payload.class_group_id:
        parent_user_ids = await resolve_recipients(
            session, context.school_id, audience="class", class_group_id=payload.class_group_id,
        )
    for user_id in parent_user_ids:
        session.add(models.Notification(
            school_id=context.school_id,
            user_id=user_id,
            title=payload.title[:160],
            body=payload.body,
            type="announcement",
            link="/announcements",
        ))
    await session.commit()
    await session.refresh(announcement)
    if parent_user_ids:
        await dispatch_parent_notifications(
            request, background,
            school_id=context.school_id,
            recipients=parent_user_ids,
            title=payload.title,
            push_body=payload.body,
            link="/announcements",
            preference_key="announcements",
        )
    return AnnouncementResponse(
        id=announcement.id,
        title=announcement.title,
        body=announcement.body,
        audience=announcement.audience,
        class_group_id=announcement.class_group_id,
        published_at=announcement.published_at,
        expires_at=announcement.expires_at,
        status=announcement.status,
    )


@router.get("/announcements", response_model=list[AnnouncementResponse])
async def list_announcements(
    context: Annotated[TenantContext, Depends(require_roles("school_admin", "principal", "registrar", "teacher", "finance", "parent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[AnnouncementResponse]:
    query = select(models.Announcement).where(
        models.Announcement.school_id == context.school_id,
        models.Announcement.status == "published",
        or_(models.Announcement.expires_at.is_(None), models.Announcement.expires_at > datetime.now(UTC)),
    )
    if context.role == models.MembershipRole.PARENT:
        guardian_id = await session.scalar(select(models.Guardian.id).where(
            models.Guardian.school_id == context.school_id,
            models.Guardian.user_id == context.user_id,
        ))
        if guardian_id is None:
            return []
        class_ids = select(models.StudentEnrollment.class_group_id).join(
            models.StudentGuardian,
            (models.StudentGuardian.student_id == models.StudentEnrollment.student_id)
            & (models.StudentGuardian.school_id == models.StudentEnrollment.school_id),
        ).where(
            models.StudentGuardian.guardian_id == guardian_id,
            models.StudentEnrollment.school_id == context.school_id,
            models.StudentEnrollment.status == "active",
        )
        query = query.where(or_(
            models.Announcement.audience.in_(("all", "parents")),
            (models.Announcement.audience == "class")
            & models.Announcement.class_group_id.in_(class_ids),
        ))
    result = await session.execute(
        query
        .order_by(models.Announcement.published_at.desc())
    )
    announcements = []
    for ann in result.scalars().all():
        announcements.append(
            AnnouncementResponse(
                id=ann.id,
                title=ann.title,
                body=ann.body,
                audience=ann.audience,
                class_group_id=ann.class_group_id,
                published_at=ann.published_at,
                expires_at=ann.expires_at,
                status=ann.status,
            )
        )
    return announcements


@router.get("/notifications", response_model=list[NotificationResponse])
async def list_notifications(
    context: Annotated[TenantContext, Depends(current_tenant)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[NotificationResponse]:
    result = await session.execute(
        select(models.Notification)
        .where(models.Notification.user_id == context.user_id,
               models.Notification.school_id == context.school_id)
        .order_by(models.Notification.created_at.desc())
        .limit(50)
    )
    notifications = []
    for n in result.scalars().all():
        notifications.append(
            NotificationResponse(
                id=n.id,
                title=n.title,
                body=n.body,
                type=n.type,
                read_at=n.read_at,
                link=n.link,
                created_at=n.created_at,
            )
        )
    return notifications


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notification_read(
    notification_id: UUID,
    context: Annotated[TenantContext, Depends(current_tenant)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    result = await session.execute(select(models.Notification).where(
        models.Notification.id == notification_id,
        models.Notification.school_id == context.school_id,
        models.Notification.user_id == context.user_id,
    ))
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.read_at = notification.read_at or datetime.now(UTC)
    await session.commit()
