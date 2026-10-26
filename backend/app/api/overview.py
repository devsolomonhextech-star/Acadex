"""Aggregated, role-aware figures for the school overview dashboard.

Every number here is computed from live rows; the dashboard never invents
figures. Sections a role may not see are returned as ``null`` rather than 403,
so one endpoint can serve every signed-in role.
"""
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, current_tenant
from app.db import get_session
from app.models import (
    AcademicTerm,
    AcademicYear,
    Assessment,
    AssessmentScore,
    AttendanceRecord,
    AttendanceSession,
    BehaviorRecord,
    ClassGroup,
    ClassSubjectAssignment,
    MembershipRole,
    PaymentAllocation,
    SchoolMembership,
    Student,
    StudentEnrollment,
    StudentInvoice,
    Subject,
    TimetableSlot,
    User,
    Payment,
)

router = APIRouter(prefix="/api/v1/overview", tags=["overview"])

ATTENDANCE_ROLES = (
    MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL,
    MembershipRole.REGISTRAR, MembershipRole.TEACHER,
)
FINANCE_ROLES = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.FINANCE)
REVIEW_ROLES = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR)

OVERDUE_DAYS = 14
ACTIVITY_WEEKS = 8


class TermInfo(BaseModel):
    name: str
    academic_year: str
    ordinal: int
    starts_on: date
    ends_on: date


class AttendanceFigures(BaseModel):
    date: date
    lessons_today: int
    sessions_submitted: int
    records_total: int
    present: int
    late: int
    absent: int
    excused: int
    rate_percent: float | None


class FinanceFigures(BaseModel):
    invoiced_total: Decimal
    paid_total: Decimal
    outstanding_total: Decimal
    open_invoice_count: int
    overdue_invoice_count: int
    overdue_balance: Decimal


class LessonFigures(BaseModel):
    id: UUID
    starts_at: str
    ends_at: str
    subject_code: str
    subject_name: str
    class_name: str
    teacher_name: str
    room: str | None


class AttentionItem(BaseModel):
    key: str
    kind: Literal["finance", "attendance", "academics"]
    title: str
    detail: str
    meta: str
    count: int
    to: str


class ActivityPoint(BaseModel):
    week_start: date
    students: int
    attendance_rate: float | None
    payments: Decimal


class OverviewResponse(BaseModel):
    generated_at: datetime
    current_term: TermInfo | None
    students_total: int
    teachers_total: int
    classes_total: int
    attendance: AttendanceFigures | None
    finance: FinanceFigures | None
    lessons_today: list[LessonFigures]
    attention: list[AttentionItem]
    activity: list[ActivityPoint]


class TeacherClassSummary(BaseModel):
    id: UUID
    name: str
    grade_level: str
    stream: str
    is_class_teacher: bool
    subjects: list[str]
    students_total: int
    present: int
    late: int
    absent: int
    unmarked: int
    attendance_rate: float | None
    upcoming_assessments: int
    overdue_submissions: int
    recent_behavior_records: int


class TeacherDashboardResponse(BaseModel):
    generated_at: datetime
    academic_year: str | None
    current_term: TermInfo | None
    students_total: int
    attendance_marked: int
    attendance_total: int
    upcoming_assessments: int
    overdue_submissions: int
    recent_behavior_records: int
    classes: list[TeacherClassSummary]
    lessons_today: list[LessonFigures]
    timetable: list[LessonFigures]


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


async def _current_term(session: AsyncSession, school_id: UUID, term_id: UUID | None = None) -> TermInfo | None:
    """The term covering today, falling back to the most recent one on record."""
    if term_id is not None:
        row = (await session.execute(
            select(AcademicTerm, AcademicYear)
            .join(AcademicYear, (AcademicYear.id == AcademicTerm.academic_year_id)
                  & (AcademicYear.school_id == AcademicTerm.school_id))
            .where(AcademicTerm.school_id == school_id, AcademicTerm.id == term_id)
        )).first()
        if row is None:
            return None
        term, year = row
        return TermInfo(name=term.name, academic_year=year.name, ordinal=term.ordinal,
                        starts_on=term.starts_on, ends_on=term.ends_on)
    today = date.today()
    row = (await session.execute(
        select(AcademicTerm, AcademicYear)
        .join(AcademicYear, (AcademicYear.id == AcademicTerm.academic_year_id)
              & (AcademicYear.school_id == AcademicTerm.school_id))
        .where(AcademicTerm.school_id == school_id)
        .order_by(
            # Active terms first, then whichever year starts last.
            ((AcademicTerm.starts_on <= today) & (today <= AcademicTerm.ends_on)).desc(),
            AcademicYear.starts_on.desc(),
            AcademicTerm.ordinal,
        )
        .limit(1)
    )).first()
    if row is None:
        return None
    term, year = row
    return TermInfo(name=term.name, academic_year=year.name, ordinal=term.ordinal,
                    starts_on=term.starts_on, ends_on=term.ends_on)


async def _attendance_figures(
    session: AsyncSession, school_id: UUID, lessons_today: int, term_id: UUID | None = None
) -> AttendanceFigures:
    today = date.today()
    date_filters = [AttendanceSession.school_id == school_id, AttendanceSession.attendance_date == today]
    if term_id is not None:
        term = await session.scalar(select(AcademicTerm).where(
            AcademicTerm.id == term_id, AcademicTerm.school_id == school_id,
        ))
        date_filters = [
            AttendanceSession.school_id == school_id,
            AttendanceSession.attendance_date >= term.starts_on,
            AttendanceSession.attendance_date <= term.ends_on,
        ]
        today = term.ends_on
    submitted = (await session.execute(
        select(AttendanceSession.id).where(*date_filters)
    )).scalars().all()
    counts = (await session.execute(
        select(AttendanceRecord.status, func.count())
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .where(
            AttendanceRecord.school_id == school_id,
            *date_filters,
        ).group_by(AttendanceRecord.status)
    )).all()
    by_status = dict(counts)
    present = by_status.get("present", 0)
    late = by_status.get("late", 0)
    absent = by_status.get("absent", 0)
    excused = by_status.get("excused", 0)
    total = present + late + absent + excused
    # Late students attended, so they count towards the attendance rate.
    rate = round((present + late) * 100 / total, 1) if total else None
    return AttendanceFigures(
        date=today, lessons_today=0 if term_id else lessons_today, sessions_submitted=len(submitted),
        records_total=total, present=present, late=late, absent=absent, excused=excused,
        rate_percent=rate,
    )


async def _finance_figures(session: AsyncSession, school_id: UUID, term_id: UUID | None = None) -> FinanceFigures:
    term_filter = [StudentInvoice.school_id == school_id, StudentInvoice.status != "void"]
    overdue_filter = [
        StudentInvoice.school_id == school_id,
        StudentInvoice.status.in_(("issued", "partially_paid")),
    ]
    if term_id is not None:
        term_filter.append(StudentInvoice.term_id == term_id)
        overdue_filter.append(StudentInvoice.term_id == term_id)
    totals = (await session.execute(
        select(
            func.coalesce(func.sum(StudentInvoice.total_amount), 0),
            func.coalesce(func.sum(StudentInvoice.paid_amount), 0),
            func.count().filter(StudentInvoice.status.in_(("issued", "partially_paid"))),
        ).where(*term_filter)
    )).one()
    invoiced, paid, open_count = totals
    overdue_cutoff = date.today() - timedelta(days=OVERDUE_DAYS)
    overdue = (await session.execute(
        select(
            func.count(),
            func.coalesce(func.sum(StudentInvoice.total_amount - StudentInvoice.paid_amount), 0),
        ).where(*overdue_filter, StudentInvoice.issued_on < overdue_cutoff)
    )).one()
    return FinanceFigures(
        invoiced_total=invoiced, paid_total=paid,
        outstanding_total=Decimal(invoiced) - Decimal(paid),
        open_invoice_count=int(open_count),
        overdue_invoice_count=int(overdue[0]), overdue_balance=Decimal(overdue[1]),
    )


async def _lessons_today(
    session: AsyncSession, school_id: UUID, academic_year_id: UUID | None = None
) -> list[LessonFigures]:
    today_index = datetime.now(UTC).weekday()
    rows = (await session.execute(
        select(TimetableSlot, ClassGroup, Subject, User)
        .join(ClassGroup, (ClassGroup.id == TimetableSlot.class_group_id)
              & (ClassGroup.school_id == TimetableSlot.school_id))
        .join(Subject, (Subject.id == TimetableSlot.subject_id)
              & (Subject.school_id == TimetableSlot.school_id))
        .join(SchoolMembership, (SchoolMembership.id == TimetableSlot.teacher_membership_id)
              & (SchoolMembership.school_id == TimetableSlot.school_id))
        .join(User, User.id == SchoolMembership.user_id)
        .where(
            TimetableSlot.school_id == school_id,
            TimetableSlot.day_of_week == today_index,
            *([TimetableSlot.academic_year_id == academic_year_id] if academic_year_id else []),
        )
        .order_by(TimetableSlot.starts_at)
    )).all()
    return [LessonFigures(
        id=slot.id, starts_at=slot.starts_at.strftime("%H:%M"), ends_at=slot.ends_at.strftime("%H:%M"),
        subject_code=subject.code, subject_name=subject.name, class_name=group.name,
        teacher_name=user.display_name, room=slot.room,
    ) for slot, group, subject, user in rows]


async def _attention(
    session: AsyncSession, school_id: UUID, role: MembershipRole
) -> list[AttentionItem]:
    items: list[AttentionItem] = []

    if role in FINANCE_ROLES:
        overdue_cutoff = date.today() - timedelta(days=OVERDUE_DAYS)
        overdue = (await session.execute(
            select(func.count(),
                   func.coalesce(func.sum(StudentInvoice.total_amount - StudentInvoice.paid_amount), 0))
            .where(StudentInvoice.school_id == school_id,
                   StudentInvoice.status.in_(("issued", "partially_paid")),
                   StudentInvoice.issued_on < overdue_cutoff)
        )).one()
        if overdue[0]:
            items.append(AttentionItem(
                key="overdue-invoices", kind="finance", title="Fee payment follow-ups",
                detail=f"{overdue[0]} invoice{'s' if overdue[0] != 1 else ''} overdue by more than "
                       f"{OVERDUE_DAYS} days",
                meta=f"₵ {Decimal(overdue[1]):,.2f} outstanding", count=int(overdue[0]), to="/finance",
            ))

    if role in ATTENDANCE_ROLES:
        today = date.today()
        with_lesson = set((await session.execute(
            select(TimetableSlot.class_group_id).where(
                TimetableSlot.school_id == school_id,
                TimetableSlot.day_of_week == datetime.now(UTC).weekday(),
            )
        )).scalars().all())
        submitted = set((await session.execute(
            select(AttendanceSession.class_group_id).where(
                AttendanceSession.school_id == school_id,
                AttendanceSession.attendance_date == today,
            )
        )).scalars().all())
        pending = with_lesson - submitted
        if pending:
            names = (await session.execute(
                select(ClassGroup.name).where(
                    ClassGroup.school_id == school_id, ClassGroup.id.in_(pending))
            )).scalars().all()
            items.append(AttentionItem(
                key="attendance-pending", kind="attendance", title="Attendance not submitted",
                detail=f"{len(pending)} class{'es' if len(pending) != 1 else ''} with lessons today "
                       f"still need marking",
                meta=", ".join(sorted(names)[:3]), count=len(pending), to="/attendance",
            ))

    if role in REVIEW_ROLES:
        awaiting = (await session.execute(
            select(func.count()).select_from(Assessment).where(
                Assessment.school_id == school_id, Assessment.status == "submitted")
        )).scalar_one()
        if awaiting:
            items.append(AttentionItem(
                key="results-review", kind="academics", title="Results ready for review",
                detail=f"{awaiting} assessment{'s' if awaiting != 1 else ''} submitted and awaiting approval",
                meta="Academics", count=int(awaiting), to="/assessments",
            ))

    return items


async def _activity(
    session: AsyncSession,
    school_id: UUID,
    academic_year_id: UUID | None = None,
    term_id: UUID | None = None,
) -> list[ActivityPoint]:
    """Eight weeks of activity ending in the selected term/year or the current week."""
    if term_id is not None:
        period = await session.scalar(select(AcademicTerm).where(
            AcademicTerm.id == term_id, AcademicTerm.school_id == school_id,
        ))
        period_start, period_end = period.starts_on, period.ends_on
    elif academic_year_id is not None:
        period = await session.scalar(select(AcademicYear).where(
            AcademicYear.id == academic_year_id, AcademicYear.school_id == school_id,
        ))
        period_start, period_end = period.starts_on, period.ends_on
    else:
        period_start, period_end = date.today() - timedelta(weeks=ACTIVITY_WEEKS), date.today()
    final_week = _week_start(period_end)
    first_week = max(_week_start(period_start), final_week - timedelta(weeks=ACTIVITY_WEEKS - 1))
    starts = [first_week + timedelta(weeks=offset) for offset in range((final_week - first_week).days // 7 + 1)]
    oldest = max(period_start, starts[0])
    newest = min(period_end, starts[-1] + timedelta(days=6))

    daily = (await session.execute(
        select(AttendanceSession.attendance_date, AttendanceRecord.status, func.count())
        .join(AttendanceRecord, AttendanceRecord.session_id == AttendanceSession.id)
        .where(AttendanceSession.school_id == school_id,
               AttendanceSession.attendance_date >= oldest,
               AttendanceSession.attendance_date <= newest)
        .group_by(AttendanceSession.attendance_date, AttendanceRecord.status)
    )).all()
    weekly_attended: dict[date, int] = {}
    weekly_total: dict[date, int] = {}
    for day, status, count in daily:
        bucket = _week_start(day)
        weekly_total[bucket] = weekly_total.get(bucket, 0) + count
        if status in ("present", "late"):
            weekly_attended[bucket] = weekly_attended.get(bucket, 0) + count

    payment_filters = [
        Payment.school_id == school_id,
        Payment.status == "recorded",
        Payment.payment_date >= oldest,
        Payment.payment_date <= newest,
    ]
    if term_id is not None:
        payment_filters.append(Payment.id.in_(
            select(PaymentAllocation.payment_id)
            .join(StudentInvoice, StudentInvoice.id == PaymentAllocation.invoice_id)
            .where(
                PaymentAllocation.school_id == school_id,
                StudentInvoice.school_id == school_id,
                StudentInvoice.term_id == term_id,
            )
        ))
    payment_rows = (await session.execute(
        select(Payment.payment_date, func.sum(Payment.amount))
        .where(*payment_filters)
        .group_by(Payment.payment_date)
    )).all()
    weekly_payments: dict[date, Decimal] = {}
    for day, amount in payment_rows:
        bucket = _week_start(day)
        weekly_payments[bucket] = weekly_payments.get(bucket, Decimal(0)) + amount

    enrollment_filters = [StudentEnrollment.school_id == school_id, StudentEnrollment.status == "active"]
    if academic_year_id is not None:
        enrollment_filters.append(StudentEnrollment.academic_year_id == academic_year_id)
    enrolled_on = (await session.execute(
        select(StudentEnrollment.enrolled_on).where(*enrollment_filters)
    )).scalars().all()

    points: list[ActivityPoint] = []
    for index, start in enumerate(starts):
        end = start + timedelta(days=6)
        total = weekly_total.get(start, 0)
        rate = round(weekly_attended.get(start, 0) * 100 / total, 1) if total else None
        points.append(ActivityPoint(
            week_start=start,
            students=sum(1 for day in enrolled_on if day <= end),
            attendance_rate=rate,
            payments=weekly_payments.get(start, Decimal(0)),
        ))
    return points


@router.get("", response_model=OverviewResponse)
async def overview(
    context: Annotated[TenantContext, Depends(current_tenant)],
    session: Annotated[AsyncSession, Depends(get_session)],
    academic_year_id: UUID | None = None,
    term_id: UUID | None = None,
):
    school_id = context.school_id
    role = context.role

    if academic_year_id is not None:
        year_exists = await session.scalar(select(AcademicYear.id).where(
            AcademicYear.id == academic_year_id, AcademicYear.school_id == school_id,
        ))
        if year_exists is None:
            raise HTTPException(status_code=404, detail="Academic year not found")
    if term_id is not None:
        selected_term = await session.scalar(select(AcademicTerm).where(
            AcademicTerm.id == term_id, AcademicTerm.school_id == school_id,
        ))
        if selected_term is None:
            raise HTTPException(status_code=404, detail="Academic term not found")
        if academic_year_id is not None and selected_term.academic_year_id != academic_year_id:
            raise HTTPException(status_code=422, detail="The selected term does not belong to the selected academic year")
        academic_year_id = selected_term.academic_year_id

    latest_year = academic_year_id or (await session.scalar(
        select(AcademicYear.id).where(AcademicYear.school_id == school_id)
        .order_by(AcademicYear.starts_on.desc()).limit(1)
    ))
    if latest_year:
        students_total = (await session.execute(
            select(func.count(func.distinct(StudentEnrollment.student_id))).where(
                StudentEnrollment.school_id == school_id,
                StudentEnrollment.academic_year_id == latest_year,
            )
        )).scalar_one()
        teachers_total = (await session.execute(
            select(func.count(func.distinct(ClassSubjectAssignment.teacher_membership_id)))
            .join(ClassGroup, (ClassGroup.id == ClassSubjectAssignment.class_group_id)
                  & (ClassGroup.school_id == ClassSubjectAssignment.school_id))
            .join(SchoolMembership, (SchoolMembership.id == ClassSubjectAssignment.teacher_membership_id)
                  & (SchoolMembership.school_id == ClassSubjectAssignment.school_id))
            .where(
                ClassSubjectAssignment.school_id == school_id,
                ClassGroup.academic_year_id == latest_year,
                SchoolMembership.role == MembershipRole.TEACHER,
                SchoolMembership.status == "active",
            )
        )).scalar_one()
    else:
        students_total = (await session.execute(
            select(func.count()).select_from(Student).where(
                Student.school_id == school_id, Student.status == "active")
        )).scalar_one()
        teachers_total = (await session.execute(
            select(func.count()).select_from(SchoolMembership).where(
                SchoolMembership.school_id == school_id,
                SchoolMembership.role == MembershipRole.TEACHER,
                SchoolMembership.status == "active",
            )
        )).scalar_one()

    classes_total = 0
    if latest_year:
        classes_total = (await session.execute(
            select(func.count()).select_from(ClassGroup).where(
                ClassGroup.school_id == school_id, ClassGroup.academic_year_id == latest_year)
        )).scalar_one()

    lessons_today = await _lessons_today(session, school_id, latest_year)
    attendance = await _attendance_figures(session, school_id, len(lessons_today), term_id) \
        if role in ATTENDANCE_ROLES else None
    finance = await _finance_figures(session, school_id, term_id) if role in FINANCE_ROLES else None
    attention = await _attention(session, school_id, role)
    activity = await _activity(session, school_id, academic_year_id, term_id)

    return OverviewResponse(
        generated_at=datetime.now(UTC),
        current_term=await _current_term(session, school_id, term_id),
        students_total=int(students_total), teachers_total=int(teachers_total),
        classes_total=int(classes_total),
        attendance=attendance, finance=finance,
    lessons_today=lessons_today, attention=attention, activity=activity,
)


@router.get("/teacher", response_model=TeacherDashboardResponse)
async def teacher_dashboard(
    context: Annotated[TenantContext, Depends(current_tenant)],
    session: Annotated[AsyncSession, Depends(get_session)],
    academic_year_id: UUID | None = None,
    term_id: UUID | None = None,
) -> TeacherDashboardResponse:
    """Return class-scoped live figures and timetable for the signed-in teacher."""
    if context.role != MembershipRole.TEACHER:
        raise HTTPException(status_code=403, detail="Teacher dashboard is available to teachers only")

    membership_id = await session.scalar(select(SchoolMembership.id).where(
        SchoolMembership.school_id == context.school_id,
        SchoolMembership.user_id == context.user_id,
        SchoolMembership.role == MembershipRole.TEACHER,
        SchoolMembership.status == "active",
    ))
    if membership_id is None:
        raise HTTPException(status_code=403, detail="Active teacher membership required")

    if term_id is not None:
        selected_term = await session.scalar(select(AcademicTerm).where(
            AcademicTerm.id == term_id, AcademicTerm.school_id == context.school_id,
        ))
        if selected_term is None:
            raise HTTPException(status_code=404, detail="Academic term not found")
        if academic_year_id is not None and selected_term.academic_year_id != academic_year_id:
            raise HTTPException(status_code=422, detail="The selected term does not belong to the selected academic year")
        academic_year_id = selected_term.academic_year_id

    year_id = academic_year_id or await session.scalar(
        select(AcademicYear.id).where(AcademicYear.school_id == context.school_id)
        .order_by(AcademicYear.starts_on.desc()).limit(1)
    )
    year = await session.scalar(select(AcademicYear).where(
        AcademicYear.id == year_id, AcademicYear.school_id == context.school_id,
    )) if year_id else None
    if academic_year_id is not None and year is None:
        raise HTTPException(status_code=404, detail="Academic year not found")

    groups: list[ClassGroup] = []
    if year is not None:
        teaches_class = select(ClassSubjectAssignment.id).where(
            ClassSubjectAssignment.school_id == context.school_id,
            ClassSubjectAssignment.class_group_id == ClassGroup.id,
            ClassSubjectAssignment.teacher_membership_id == membership_id,
        ).exists()
        groups = list((await session.scalars(
            select(ClassGroup).where(
                ClassGroup.school_id == context.school_id,
                ClassGroup.academic_year_id == year.id,
                or_(teaches_class, ClassGroup.class_teacher_membership_id == membership_id),
            ).order_by(ClassGroup.grade_level, ClassGroup.name, ClassGroup.stream)
        )).all())

    today = date.today()
    week_end = today + timedelta(days=7)
    class_summaries: list[TeacherClassSummary] = []
    lesson_rows: list[LessonFigures] = []
    for group in groups:
        assigned = (await session.execute(
            select(Subject.id, Subject.name)
            .join(ClassSubjectAssignment, (ClassSubjectAssignment.subject_id == Subject.id)
                  & (ClassSubjectAssignment.school_id == Subject.school_id))
            .where(
                ClassSubjectAssignment.school_id == context.school_id,
                ClassSubjectAssignment.class_group_id == group.id,
                ClassSubjectAssignment.teacher_membership_id == membership_id,
            ).order_by(Subject.name)
        )).all()
        subject_ids = [row[0] for row in assigned]
        subject_names = [row[1] for row in assigned]

        students_total = int(await session.scalar(
            select(func.count()).select_from(StudentEnrollment)
            .join(Student, (Student.id == StudentEnrollment.student_id)
                  & (Student.school_id == StudentEnrollment.school_id))
            .where(
                StudentEnrollment.school_id == context.school_id,
                StudentEnrollment.academic_year_id == year.id,
                StudentEnrollment.class_group_id == group.id,
                StudentEnrollment.status == "active", Student.status == "active",
            )
        ) or 0)

        attendance_rows = (await session.execute(
            select(AttendanceRecord.status, func.count())
            .join(AttendanceSession, (AttendanceSession.id == AttendanceRecord.session_id)
                  & (AttendanceSession.school_id == AttendanceRecord.school_id))
            .where(
                AttendanceRecord.school_id == context.school_id,
                AttendanceSession.class_group_id == group.id,
                AttendanceSession.attendance_date == today,
            ).group_by(AttendanceRecord.status)
        )).all()
        attendance_by_status = dict(attendance_rows)
        present = int(attendance_by_status.get("present", 0))
        late = int(attendance_by_status.get("late", 0))
        absent = int(attendance_by_status.get("absent", 0))
        marked = present + late + absent + int(attendance_by_status.get("excused", 0))
        attendance_rate = round((present + late) * 100 / marked, 1) if marked else None

        assessment_filter = [
            Assessment.school_id == context.school_id,
            Assessment.academic_year_id == year.id,
            Assessment.class_group_id == group.id,
            Assessment.subject_id.in_(subject_ids) if subject_ids else Assessment.id.is_(None),
        ]
        if term_id is not None:
            assessment_filter.append(Assessment.term_id == term_id)
        upcoming_assessments = int(await session.scalar(
            select(func.count()).select_from(Assessment).where(
                *assessment_filter,
                Assessment.status.in_(("open", "returned")),
                Assessment.due_on >= today, Assessment.due_on <= week_end,
            )
        ) or 0)
        overdue_assessments = list((await session.scalars(
            select(Assessment).where(
                *assessment_filter,
                Assessment.status.in_(("open", "returned")),
                Assessment.due_on.is_not(None), Assessment.due_on < today,
            )
        )).all())
        overdue_submissions = 0
        for assessment in overdue_assessments:
            submitted = int(await session.scalar(
                select(func.count()).select_from(AssessmentScore).where(
                    AssessmentScore.school_id == context.school_id,
                    AssessmentScore.assessment_id == assessment.id,
                    AssessmentScore.submission_status.in_(("submitted", "excused")),
                )
            ) or 0)
            overdue_submissions += max(students_total - submitted, 0)

        recent_behavior_records = int(await session.scalar(
            select(func.count()).select_from(BehaviorRecord)
            .join(StudentEnrollment, (StudentEnrollment.student_id == BehaviorRecord.student_id)
                  & (StudentEnrollment.school_id == BehaviorRecord.school_id))
            .where(
                BehaviorRecord.school_id == context.school_id,
                BehaviorRecord.occurred_on >= today - timedelta(days=14),
                StudentEnrollment.academic_year_id == year.id,
                StudentEnrollment.class_group_id == group.id,
                StudentEnrollment.status == "active",
            )
        ) or 0)

        class_summaries.append(TeacherClassSummary(
            id=group.id, name=group.name, grade_level=group.grade_level, stream=group.stream,
            is_class_teacher=group.class_teacher_membership_id == membership_id,
            subjects=subject_names, students_total=students_total,
            present=present, late=late, absent=absent,
            unmarked=max(students_total - marked, 0), attendance_rate=attendance_rate,
            upcoming_assessments=upcoming_assessments,
            overdue_submissions=overdue_submissions,
            recent_behavior_records=recent_behavior_records,
        ))

    timetable_query = (
        select(TimetableSlot, ClassGroup, Subject)
        .join(ClassGroup, (ClassGroup.id == TimetableSlot.class_group_id)
              & (ClassGroup.school_id == TimetableSlot.school_id))
        .join(Subject, (Subject.id == TimetableSlot.subject_id)
              & (Subject.school_id == TimetableSlot.school_id))
        .where(
            TimetableSlot.school_id == context.school_id,
            TimetableSlot.teacher_membership_id == membership_id,
            *([TimetableSlot.academic_year_id == year.id] if year else []),
        )
    )
    rows = (await session.execute(timetable_query.order_by(
        TimetableSlot.day_of_week, TimetableSlot.starts_at,
    ))).all()
    teacher = await session.get(User, context.user_id)
    timetable = [LessonFigures(
        id=slot.id, starts_at=slot.starts_at.strftime("%H:%M"), ends_at=slot.ends_at.strftime("%H:%M"),
        subject_code=subject.code, subject_name=subject.name, class_name=group.name,
        teacher_name=teacher.display_name if teacher else "Teacher", room=slot.room,
    ) for slot, group, subject in rows]
    today_index = datetime.now(UTC).weekday()
    lessons_today = [lesson for (slot, _group, _subject), lesson in zip(rows, timetable) if slot.day_of_week == today_index]

    attend_total = sum(item.students_total for item in class_summaries)
    attend_marked = sum(item.students_total - item.unmarked for item in class_summaries)
    return TeacherDashboardResponse(
        generated_at=datetime.now(UTC), academic_year=year.name if year else None,
        current_term=await _current_term(session, context.school_id, term_id),
        students_total=sum(item.students_total for item in class_summaries),
        attendance_marked=attend_marked, attendance_total=attend_total,
        upcoming_assessments=sum(item.upcoming_assessments for item in class_summaries),
        overdue_submissions=sum(item.overdue_submissions for item in class_summaries),
        recent_behavior_records=sum(item.recent_behavior_records for item in class_summaries),
        classes=class_summaries, lessons_today=lessons_today, timetable=timetable,
    )
