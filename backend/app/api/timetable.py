"""Weekly timetable slots: create, list, and delete recurring lessons with conflict checks."""
from datetime import UTC, datetime, time
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import (
    AcademicYear,
    AuditEvent,
    ClassGroup,
    ClassSubjectAssignment,
    MembershipRole,
    SchoolMembership,
    Subject,
    TimetableSlot,
    User,
)

router = APIRouter(prefix="/api/v1/timetable", tags=["timetable"])
roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR)
writers = (MembershipRole.SCHOOL_ADMIN, MembershipRole.REGISTRAR)

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class SlotCreate(BaseModel):
    academic_year_id: UUID
    class_group_id: UUID
    subject_id: UUID
    teacher_membership_id: UUID
    day_of_week: int = Field(ge=0, le=6)
    starts_at: time
    ends_at: time
    room: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def times_are_ordered(self) -> "SlotCreate":
        if self.starts_at >= self.ends_at:
            raise ValueError("A lesson must end after it starts")
        if self.room is not None:
            self.room = self.room.strip() or None
        return self


class SlotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    academic_year_id: UUID
    class_group_id: UUID
    class_name: str
    subject_id: UUID
    subject_name: str
    subject_code: str
    teacher_membership_id: UUID
    teacher_name: str
    day_of_week: int
    day_name: str
    starts_at: str
    ends_at: str
    room: str | None


def _respond(slot: TimetableSlot, class_group: ClassGroup, subject: Subject, teacher: str) -> SlotResponse:
    return SlotResponse(
        id=slot.id, academic_year_id=slot.academic_year_id,
        class_group_id=class_group.id, class_name=class_group.name,
        subject_id=subject.id, subject_name=subject.name, subject_code=subject.code,
        teacher_membership_id=slot.teacher_membership_id, teacher_name=teacher,
        day_of_week=slot.day_of_week, day_name=DAY_NAMES[slot.day_of_week],
        starts_at=slot.starts_at.strftime("%H:%M"), ends_at=slot.ends_at.strftime("%H:%M"),
        room=slot.room,
    )


async def _find_conflict(
    session: AsyncSession, school_id: UUID, day_of_week: int,
    starts_at: time, ends_at: time,
    class_group_id: UUID, teacher_membership_id: UUID,
) -> str | None:
    """Return a human-readable conflict description, or None when the slot is free.

    Two lessons clash when their times overlap on the same day: an interval
    [start, end) overlaps another when it starts before that one ends and ends
    after it starts.
    """
    overlap = (TimetableSlot.starts_at < ends_at) & (TimetableSlot.ends_at > starts_at)
    class_clash = await session.scalar(
        select(TimetableSlot.class_group_id).where(
            TimetableSlot.school_id == school_id,
            TimetableSlot.day_of_week == day_of_week,
            TimetableSlot.class_group_id == class_group_id,
            overlap,
        ).limit(1)
    )
    if class_clash:
        return "That class already has a lesson at this time"
    teacher_clash = await session.scalar(
        select(TimetableSlot.id).where(
            TimetableSlot.school_id == school_id,
            TimetableSlot.day_of_week == day_of_week,
            TimetableSlot.teacher_membership_id == teacher_membership_id,
            overlap,
        ).limit(1)
    )
    if teacher_clash:
        return "That teacher is already teaching at this time"
    return None


@router.get("", response_model=list[SlotResponse])
async def list_slots(
    context: Annotated[TenantContext, Depends(require_roles(*roles, MembershipRole.TEACHER))],
    session: Annotated[AsyncSession, Depends(get_session)],
    academic_year_id: UUID,
    class_group_id: UUID | None = None,
    day_of_week: int | None = Query(default=None, ge=0, le=6),
):
    query = (
        select(TimetableSlot, ClassGroup, Subject, User)
        .join(ClassGroup, (ClassGroup.id == TimetableSlot.class_group_id) & (ClassGroup.school_id == TimetableSlot.school_id))
        .join(Subject, (Subject.id == TimetableSlot.subject_id) & (Subject.school_id == TimetableSlot.school_id))
        .join(SchoolMembership, (SchoolMembership.id == TimetableSlot.teacher_membership_id) & (SchoolMembership.school_id == TimetableSlot.school_id))
        .join(User, User.id == SchoolMembership.user_id)
        .where(TimetableSlot.school_id == context.school_id, TimetableSlot.academic_year_id == academic_year_id)
    )
    if class_group_id:
        query = query.where(TimetableSlot.class_group_id == class_group_id)
    if day_of_week is not None:
        query = query.where(TimetableSlot.day_of_week == day_of_week)
    if context.role == MembershipRole.TEACHER:
        membership_id = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.user_id == context.user_id,
            SchoolMembership.role == MembershipRole.TEACHER,
            SchoolMembership.status == "active",
        ))
        if membership_id is None:
            raise HTTPException(status_code=403, detail="Active teacher membership required")
        if class_group_id:
            group = await session.scalar(select(ClassGroup).where(
                ClassGroup.id == class_group_id,
                ClassGroup.school_id == context.school_id,
                ClassGroup.academic_year_id == academic_year_id,
            ))
            assigned_subject = await session.scalar(select(ClassSubjectAssignment.id).where(
                ClassSubjectAssignment.school_id == context.school_id,
                ClassSubjectAssignment.class_group_id == class_group_id,
                ClassSubjectAssignment.teacher_membership_id == membership_id,
            ).limit(1))
            if group is None or (group.class_teacher_membership_id != membership_id and assigned_subject is None):
                raise HTTPException(status_code=403, detail="You are not assigned to this class")
        else:
            query = query.where(TimetableSlot.teacher_membership_id == membership_id)
    rows = (await session.execute(query.order_by(TimetableSlot.day_of_week, TimetableSlot.starts_at))).all()
    return [_respond(slot, group, subject, user.display_name) for slot, group, subject, user in rows]


@router.get("/today", response_model=list[SlotResponse])
async def today_slots(
    context: Annotated[TenantContext, Depends(require_roles(*roles, MembershipRole.TEACHER))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Lessons happening today; teachers only see their own, admins see the whole school."""
    # day_of_week is 0 = Monday .. 6 = Sunday, matching datetime.weekday().
    today_index = datetime.now(UTC).weekday()
    query = (
        select(TimetableSlot, ClassGroup, Subject, User)
        .join(ClassGroup, (ClassGroup.id == TimetableSlot.class_group_id) & (ClassGroup.school_id == TimetableSlot.school_id))
        .join(Subject, (Subject.id == TimetableSlot.subject_id) & (Subject.school_id == TimetableSlot.school_id))
        .join(SchoolMembership, (SchoolMembership.id == TimetableSlot.teacher_membership_id) & (SchoolMembership.school_id == TimetableSlot.school_id))
        .join(User, User.id == SchoolMembership.user_id)
        .where(TimetableSlot.school_id == context.school_id, TimetableSlot.day_of_week == today_index)
    )
    if context.role == MembershipRole.TEACHER:
        membership = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.user_id == context.user_id,
            SchoolMembership.status == "active",
        ))
        query = query.where(TimetableSlot.teacher_membership_id == membership)
    rows = (await session.execute(query.order_by(TimetableSlot.starts_at))).all()
    return [_respond(slot, group, subject, user.display_name) for slot, group, subject, user in rows]


@router.post("", response_model=SlotResponse, status_code=status.HTTP_201_CREATED)
async def create_slot(
    payload: SlotCreate,
    context: Annotated[TenantContext, Depends(require_roles(*writers))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    year = await session.scalar(select(AcademicYear).where(
        AcademicYear.id == payload.academic_year_id, AcademicYear.school_id == context.school_id))
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == payload.class_group_id, ClassGroup.school_id == context.school_id,
        ClassGroup.academic_year_id == payload.academic_year_id))
    subject = await session.scalar(select(Subject).where(
        Subject.id == payload.subject_id, Subject.school_id == context.school_id, Subject.status == "active"))
    teacher = (await session.execute(
        select(SchoolMembership, User)
        .join(User, User.id == SchoolMembership.user_id)
        .where(
            SchoolMembership.id == payload.teacher_membership_id,
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.role == MembershipRole.TEACHER,
            SchoolMembership.status == "active",
            User.status == "active",
        )
    )).one_or_none()
    if year is None or group is None or subject is None or teacher is None:
        raise HTTPException(status_code=404, detail="Academic year, class, subject, or teacher not found")

    # The teacher must actually be assigned to teach this subject in this class,
    # so a timetable slot can never outlive its teaching assignment.
    assignment = await session.scalar(select(ClassSubjectAssignment.id).where(
        ClassSubjectAssignment.school_id == context.school_id,
        ClassSubjectAssignment.class_group_id == payload.class_group_id,
        ClassSubjectAssignment.subject_id == payload.subject_id,
        ClassSubjectAssignment.teacher_membership_id == payload.teacher_membership_id,
    ))
    if assignment is None:
        raise HTTPException(
            status_code=409,
            detail="Assign this teacher to that class and subject before adding it to the timetable",
        )

    conflict = await _find_conflict(
        session, context.school_id, payload.day_of_week,
        payload.starts_at, payload.ends_at, payload.class_group_id, payload.teacher_membership_id,
    )
    if conflict:
        raise HTTPException(status_code=409, detail=conflict)

    slot = TimetableSlot(id=uuid4(), school_id=context.school_id, **payload.model_dump())
    session.add(slot)
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="timetable.slot_created", resource_type="timetable_slot", resource_id=slot.id))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="That lesson could not be saved") from None
    membership, user = teacher
    return _respond(slot, group, subject, user.display_name)


@router.delete("/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_slot(
    slot_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*writers))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    slot = await session.scalar(select(TimetableSlot).where(
        TimetableSlot.id == slot_id, TimetableSlot.school_id == context.school_id))
    if slot is None:
        raise HTTPException(status_code=404, detail="Timetable entry not found")
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="timetable.slot_removed", resource_type="timetable_slot", resource_id=slot.id))
    await session.delete(slot)
    await session.commit()
