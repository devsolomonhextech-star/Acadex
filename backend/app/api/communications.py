from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.schemas import AnnouncementCreate, AnnouncementResponse, NotificationResponse

router = APIRouter(prefix="/api/v1", tags=["communications"])


@router.post("/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    payload: AnnouncementCreate,
    context: TenantContext = Depends(require_roles("school_admin", "principal")),
    session: AsyncSession = Depends(get_session),
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
    await session.commit()
    await session.refresh(announcement)
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
    context: TenantContext = Depends(require_roles("school_admin", "principal", "registrar", "teacher", "finance")),
    session: AsyncSession = Depends(get_session),
) -> list[AnnouncementResponse]:
    result = await session.execute(
        select(models.Announcement)
        .where(models.Announcement.school_id == context.school_id)
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
    context: TenantContext,
    session: AsyncSession = Depends(get_session),
) -> list[NotificationResponse]:
    result = await session.execute(
        select(models.Notification)
        .where(models.Notification.user_id == context.user_id)
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
    context: TenantContext,
    session: AsyncSession = Depends(get_session),
) -> None:
    result = await session.execute(
        select(models.Notification).where(
            models.Notification.id == notification_id,
            models.Notification.user_id == context.user_id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.read_at = notification.read_at or __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    await session.commit()
    return None
