"""Resolve which parents a school notice reaches, and record the send.

A notice is delivered twice on purpose: one durable ``Notification`` row per
parent (so it is waiting in the app even if the phone was offline) and one
best-effort push per registered device. The campaign row is the school's own
record of what was sent, to whom, and by whom.
"""
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ClassGroup,
    Guardian,
    MembershipRole,
    Notification,
    NotificationCampaign,
    SchoolMembership,
    Student,
    StudentEnrollment,
    StudentGuardian,
    User,
)

AUDIENCES = ("all_parents", "class", "student")


class NotificationAudienceError(Exception):
    """The audience or its target is missing or invalid."""


class NotificationTargetNotFound(Exception):
    """The class or student does not exist inside the caller's tenant."""


@dataclass(frozen=True)
class SentNotice:
    campaign: NotificationCampaign
    recipients: list[UUID]
    sent_by: str
    target_name: str | None = None


def _parent_scope(school_id: UUID):
    """Active parent accounts that can actually receive a notice."""
    return (
        select(Guardian.user_id).distinct()
        .join(
            SchoolMembership,
            (SchoolMembership.school_id == Guardian.school_id)
            & (SchoolMembership.user_id == Guardian.user_id),
        )
        .join(User, User.id == Guardian.user_id)
        .where(
            Guardian.school_id == school_id,
            Guardian.user_id.is_not(None),
            SchoolMembership.status == "active",
            SchoolMembership.role == MembershipRole.PARENT,
            User.status == "active",
        )
        .order_by(Guardian.user_id)
    )


async def resolve_recipients(
    session: AsyncSession,
    school_id: UUID,
    *,
    audience: str,
    class_group_id: UUID | None = None,
    student_id: UUID | None = None,
) -> list[UUID]:
    if audience not in AUDIENCES:
        raise NotificationAudienceError("Choose who should receive this notification")
    statement = _parent_scope(school_id)
    if audience == "class":
        if class_group_id is None:
            raise NotificationAudienceError("Choose the class this notification is for")
        group = await session.scalar(
            select(ClassGroup.id).where(ClassGroup.id == class_group_id, ClassGroup.school_id == school_id)
        )
        if group is None:
            raise NotificationTargetNotFound("Class not found")
        statement = statement.where(
            Guardian.id.in_(
                select(StudentGuardian.guardian_id)
                .join(
                    StudentEnrollment,
                    (StudentEnrollment.student_id == StudentGuardian.student_id)
                    & (StudentEnrollment.school_id == StudentGuardian.school_id),
                )
                .join(
                    Student,
                    (Student.id == StudentEnrollment.student_id)
                    & (Student.school_id == StudentEnrollment.school_id),
                )
                .where(
                    StudentGuardian.school_id == school_id,
                    StudentEnrollment.class_group_id == class_group_id,
                    StudentEnrollment.status == "active",
                    Student.status == "active",
                )
            )
        )
    elif audience == "student":
        if student_id is None:
            raise NotificationAudienceError("Choose the student this notification is about")
        student = await session.scalar(
            select(Student.id).where(Student.id == student_id, Student.school_id == school_id)
        )
        if student is None:
            raise NotificationTargetNotFound("Student not found")
        statement = statement.where(
            Guardian.id.in_(
                select(StudentGuardian.guardian_id).where(
                    StudentGuardian.school_id == school_id,
                    StudentGuardian.student_id == student_id,
                )
            )
        )
    return list((await session.scalars(statement)).all())


async def send_notice(
    session: AsyncSession,
    *,
    school_id: UUID,
    user_id: UUID,
    audience: str,
    title: str,
    body: str,
    class_group_id: UUID | None = None,
    student_id: UUID | None = None,
) -> SentNotice:
    recipients = await resolve_recipients(
        session,
        school_id,
        audience=audience,
        class_group_id=class_group_id,
        student_id=student_id,
    )
    if not recipients:
        raise NotificationAudienceError(
            "No parent account in this audience can receive notifications yet"
        )
    clean_title = " ".join(title.split())
    clean_body = body.strip()
    campaign = NotificationCampaign(
        school_id=school_id,
        title=clean_title[:160],
        body=clean_body,
        audience=audience,
        class_group_id=class_group_id if audience == "class" else None,
        student_id=student_id if audience == "student" else None,
        recipient_count=len(recipients),
        created_by_user_id=user_id,
    )
    session.add(campaign)
    await session.flush()
    for recipient in recipients:
        session.add(
            Notification(
                school_id=school_id,
                user_id=recipient,
                title=clean_title[:160],
                body=clean_body,
                type="school_notice",
                link="/notifications",
            )
        )
    sender = await session.scalar(select(User.display_name).where(User.id == user_id))
    return SentNotice(
        campaign=campaign,
        recipients=recipients,
        sent_by=sender or "School office",
        target_name=await _target_name(session, school_id, campaign),
    )


async def _target_name(
    session: AsyncSession, school_id: UUID, campaign: NotificationCampaign
) -> str | None:
    """Human label for who the notice was aimed at (class or child)."""
    if campaign.audience == "class" and campaign.class_group_id:
        name = await session.scalar(
            select(ClassGroup.name).where(
                ClassGroup.id == campaign.class_group_id, ClassGroup.school_id == school_id
            )
        )
        return f"Class {name}" if name else None
    if campaign.audience == "student" and campaign.student_id:
        row = (
            await session.execute(
                select(Student.first_name, Student.last_name).where(
                    Student.id == campaign.student_id, Student.school_id == school_id
                )
            )
        ).first()
        return f"{row[0]} {row[1]}" if row else None
    return None


async def recent_notices(
    session: AsyncSession, school_id: UUID, *, limit: int = 20
) -> list[SentNotice]:
    rows = (
        await session.execute(
            select(
                NotificationCampaign,
                User.display_name,
                ClassGroup.name,
                Student.first_name,
                Student.last_name,
            )
            .join(User, User.id == NotificationCampaign.created_by_user_id)
            .outerjoin(
                ClassGroup,
                (ClassGroup.school_id == NotificationCampaign.school_id)
                & (ClassGroup.id == NotificationCampaign.class_group_id),
            )
            .outerjoin(
                Student,
                (Student.school_id == NotificationCampaign.school_id)
                & (Student.id == NotificationCampaign.student_id),
            )
            .where(NotificationCampaign.school_id == school_id)
            .order_by(NotificationCampaign.created_at.desc(), NotificationCampaign.id.desc())
            .limit(limit)
        )
    ).all()
    notices: list[SentNotice] = []
    for campaign, name, class_name, first, last in rows:
        target = None
        if campaign.audience == "class" and class_name:
            target = f"Class {class_name}"
        elif campaign.audience == "student" and first:
            target = f"{first} {last}"
        notices.append(
            SentNotice(campaign=campaign, recipients=[], sent_by=name or "School office", target_name=target)
        )
    return notices
