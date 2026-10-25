"""School-scoped academic calendar events."""
from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import (
    AcademicCalendarEvent,
    AcademicTerm,
    AcademicYear,
    AuditEvent,
    ClassGroup,
    MembershipRole,
)

router = APIRouter(prefix="/api/v1/academic-calendar", tags=["academic-calendar"])
CalendarCategory = Literal["term", "holiday", "exam", "meeting", "event", "assessment", "other"]
CalendarAudience = Literal["all", "students", "staff", "parents", "teachers", "class"]
view_roles = (
    MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR,
    MembershipRole.TEACHER, MembershipRole.FINANCE, MembershipRole.STAFF,
)
edit_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR)


class CalendarEventCreate(BaseModel):
    academic_year_id: UUID
    term_id: UUID | None = None
    class_group_id: UUID | None = None
    title: str = Field(min_length=2, max_length=160)
    category: CalendarCategory = "event"
    audience: CalendarAudience = "all"
    starts_on: date
    ends_on: date
    description: str | None = Field(default=None, max_length=2000)


class CalendarEventResponse(BaseModel):
    id: UUID
    academic_year_id: UUID
    term_id: UUID | None
    class_group_id: UUID | None
    class_name: str | None
    title: str
    category: str
    audience: str
    starts_on: date
    ends_on: date
    description: str | None
    created_at: datetime


class CalendarSeedRequest(BaseModel):
    academic_year_id: UUID
    term_id: UUID


class CalendarSeedResponse(BaseModel):
    created: int


def _response(event: AcademicCalendarEvent, class_name: str | None = None) -> CalendarEventResponse:
    return CalendarEventResponse(
        id=event.id, academic_year_id=event.academic_year_id, term_id=event.term_id,
        class_group_id=event.class_group_id, class_name=class_name, title=event.title,
        category=event.category, audience=event.audience, starts_on=event.starts_on,
        ends_on=event.ends_on, description=event.description, created_at=event.created_at,
    )


@router.get("/events", response_model=list[CalendarEventResponse])
async def list_events(
    academic_year_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*view_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    term_id: UUID | None = None,
    range_start: date | None = None,
    range_end: date | None = None,
) -> list[CalendarEventResponse]:
    if range_start is not None and range_end is not None and range_end < range_start:
        raise HTTPException(status_code=422, detail="Range end must be on or after range start")
    year = await session.scalar(select(AcademicYear).where(
        AcademicYear.id == academic_year_id, AcademicYear.school_id == context.school_id,
    ))
    if year is None:
        raise HTTPException(status_code=404, detail="Academic year not found")
    filters = [
        AcademicCalendarEvent.school_id == context.school_id,
        AcademicCalendarEvent.academic_year_id == academic_year_id,
    ]
    if term_id is not None:
        term = await session.scalar(select(AcademicTerm).where(
            AcademicTerm.id == term_id,
            AcademicTerm.school_id == context.school_id,
            AcademicTerm.academic_year_id == academic_year_id,
        ))
        if term is None:
            raise HTTPException(status_code=404, detail="Academic term not found")
        filters.extend([
            AcademicCalendarEvent.starts_on <= term.ends_on,
            AcademicCalendarEvent.ends_on >= term.starts_on,
            (AcademicCalendarEvent.term_id.is_(None) | (AcademicCalendarEvent.term_id == term_id)),
        ])
    else:
        filters.extend([
            AcademicCalendarEvent.starts_on <= year.ends_on,
            AcademicCalendarEvent.ends_on >= year.starts_on,
        ])
    if range_start is not None:
        filters.append(AcademicCalendarEvent.ends_on >= range_start)
    if range_end is not None:
        filters.append(AcademicCalendarEvent.starts_on <= range_end)
    rows = (await session.execute(
        select(AcademicCalendarEvent, ClassGroup.name)
        .outerjoin(ClassGroup, (ClassGroup.id == AcademicCalendarEvent.class_group_id)
                   & (ClassGroup.school_id == AcademicCalendarEvent.school_id)
                   & (ClassGroup.academic_year_id == AcademicCalendarEvent.academic_year_id))
        .where(*filters)
        .order_by(AcademicCalendarEvent.starts_on, AcademicCalendarEvent.ends_on, AcademicCalendarEvent.title)
    )).all()
    return [_response(event, class_name) for event, class_name in rows]


@router.post("/events", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: CalendarEventCreate,
    context: Annotated[TenantContext, Depends(require_roles(*edit_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CalendarEventResponse:
    if payload.ends_on < payload.starts_on:
        raise HTTPException(status_code=422, detail="End date must be on or after the start date")
    year = await session.scalar(select(AcademicYear).where(
        AcademicYear.id == payload.academic_year_id, AcademicYear.school_id == context.school_id,
    ))
    if year is None:
        raise HTTPException(status_code=404, detail="Academic year not found")
    if payload.starts_on < year.starts_on or payload.ends_on > year.ends_on:
        raise HTTPException(status_code=422, detail="Event dates must fall within the selected academic year")
    if payload.term_id is not None:
        term = await session.scalar(select(AcademicTerm).where(
            AcademicTerm.id == payload.term_id,
            AcademicTerm.school_id == context.school_id,
            AcademicTerm.academic_year_id == year.id,
        ))
        if term is None:
            raise HTTPException(status_code=404, detail="Academic term not found")
        if payload.starts_on < term.starts_on or payload.ends_on > term.ends_on:
            raise HTTPException(status_code=422, detail="Event dates must fall within the selected term")
    if payload.audience == "class":
        if payload.class_group_id is None:
            raise HTTPException(status_code=422, detail="Choose a class for a class-specific event")
        class_group = await session.scalar(select(ClassGroup).where(
            ClassGroup.id == payload.class_group_id,
            ClassGroup.school_id == context.school_id,
            ClassGroup.academic_year_id == year.id,
        ))
        if class_group is None:
            raise HTTPException(status_code=404, detail="Class group not found")
    elif payload.class_group_id is not None:
        raise HTTPException(status_code=422, detail="A class can only be selected for a class-specific event")

    event = AcademicCalendarEvent(
        school_id=context.school_id,
        academic_year_id=year.id,
        term_id=payload.term_id,
        class_group_id=payload.class_group_id,
        title=payload.title.strip(),
        category=payload.category,
        audience=payload.audience,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
        description=payload.description.strip() if payload.description else None,
        created_by_user_id=context.user_id,
    )
    session.add(event)
    await session.flush()
    session.add(AuditEvent(
        school_id=context.school_id, actor_user_id=context.user_id,
        action="academic_calendar.event_created", resource_type="academic_calendar_event",
        resource_id=event.id,
    ))
    await session.commit()
    await session.refresh(event)
    return _response(event, class_group.name if payload.class_group_id else None)


@router.post("/events/seed", response_model=CalendarSeedResponse)
async def seed_term_events(
    payload: CalendarSeedRequest,
    context: Annotated[TenantContext, Depends(require_roles(*edit_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CalendarSeedResponse:
    """Seed only calendar events for one school term; safe to run more than once."""
    term_row = (await session.execute(
        select(AcademicTerm, AcademicYear)
        .join(AcademicYear, (AcademicYear.id == AcademicTerm.academic_year_id)
              & (AcademicYear.school_id == AcademicTerm.school_id))
        .where(AcademicTerm.id == payload.term_id,
               AcademicTerm.academic_year_id == payload.academic_year_id,
               AcademicTerm.school_id == context.school_id)
    )).one_or_none()
    if term_row is None:
        raise HTTPException(status_code=404, detail="Academic term not found")
    term, year = term_row
    duration = max(0, (term.ends_on - term.starts_on).days)
    samples = (
        ("Term begins", "term", 0, 0, "First day of teaching for the selected term.", "all"),
        ("New student orientation", "event", 1, 1, "Welcome and orientation for new students.", "students"),
        ("Staff planning meeting", "meeting", max(1, duration // 5), max(1, duration // 5), "Teaching and non-teaching staff planning meeting.", "staff"),
        ("Mid-term break", "holiday", duration // 2, min(duration // 2 + 1, duration), "School closed for the mid-term break.", "all"),
        ("Continuous assessment", "assessment", max(1, duration * 3 // 4), max(1, duration * 3 // 4), "Continuous assessment period for all classes.", "students"),
        ("Term ends", "term", duration, duration, "Final day of the selected academic term.", "all"),
    )
    created = 0
    for title, category, start_offset, end_offset, description, audience in samples:
        existing = await session.scalar(select(AcademicCalendarEvent.id).where(
            AcademicCalendarEvent.school_id == context.school_id,
            AcademicCalendarEvent.academic_year_id == year.id,
            AcademicCalendarEvent.term_id == term.id,
            AcademicCalendarEvent.title == title,
        ))
        if existing is not None:
            continue
        starts_on = term.starts_on + timedelta(days=min(start_offset, duration))
        ends_on = term.starts_on + timedelta(days=min(end_offset, duration))
        session.add(AcademicCalendarEvent(
            school_id=context.school_id, academic_year_id=year.id, term_id=term.id,
            title=title, category=category, audience=audience,
            starts_on=starts_on, ends_on=ends_on, description=description,
            created_by_user_id=context.user_id,
        ))
        created += 1
    if created:
        session.add(AuditEvent(
            school_id=context.school_id, actor_user_id=context.user_id,
            action="academic_calendar.sample_events_seeded", resource_type="academic_term",
            resource_id=term.id,
        ))
        await session.commit()
    return CalendarSeedResponse(created=created)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*edit_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    event = await session.scalar(select(AcademicCalendarEvent).where(
        AcademicCalendarEvent.id == event_id,
        AcademicCalendarEvent.school_id == context.school_id,
    ))
    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    session.add(AuditEvent(
        school_id=context.school_id, actor_user_id=context.user_id,
        action="academic_calendar.event_deleted", resource_type="academic_calendar_event",
        resource_id=event.id,
    ))
    await session.delete(event)
    await session.commit()
