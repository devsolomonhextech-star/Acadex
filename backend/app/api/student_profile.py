"""One aggregated profile for a single student, computed from live rows.

Identity, enrolment, guardians, attendance, term results, invoices, and
today's class schedule come back in a single response so the profile page
renders without a request waterfall. Sections a role may not see (fees for
non-finance roles) are returned as ``null`` rather than 403, matching the
overview dashboard's convention.
"""
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.api.students import student_roles
from app.db import get_session
from app.models import (
    AcademicTerm,
    AcademicYear,
    AttendanceRecord,
    AttendanceSession,
    ClassGroup,
    Guardian,
    MembershipRole,
    ResultPublication,
    SchoolMembership,
    Student,
    StudentEnrollment,
    StudentGuardian,
    StudentInvoice,
    Subject,
    TermResult,
    TimetableSlot,
    User,
)

router = APIRouter(prefix="/api/v1/students", tags=["student-profile"])

FINANCE_ROLES = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.FINANCE)


class ProfileStudent(BaseModel):
    id: UUID
    admission_number: str
    first_name: str
    last_name: str
    display_name: str
    date_of_birth: date | None
    age_years: int | None
    status: str


class ProfileEnrollment(BaseModel):
    class_group_id: UUID
    class_name: str
    grade_level: str
    stream: str
    academic_year: str
    enrolled_on: date


class ProfileGuardian(BaseModel):
    guardian_id: UUID
    full_name: str
    relationship: str
    email: str | None
    phone: str | None
    is_primary: bool


class ProfileAttendance(BaseModel):
    present: int
    absent: int
    late: int
    excused: int
    days_marked: int
    rate_percent: float | None
    recent: list["ProfileAttendanceDay"]


class ProfileAttendanceDay(BaseModel):
    day: date
    status: str


class ProfileInvoice(BaseModel):
    id: UUID
    invoice_number: str
    term_name: str
    total_amount: Decimal
    paid_amount: Decimal
    balance: Decimal
    status: str
    issued_on: date


class ProfileFinance(BaseModel):
    invoiced_total: Decimal
    paid_total: Decimal
    outstanding_total: Decimal
    invoices: list[ProfileInvoice]


class ProfileTermResult(BaseModel):
    term_id: UUID
    term_name: str
    academic_year: str
    ordinal: int
    aggregate_percent: Decimal
    grade: str | None
    position: int | None
    published: bool


class ProfileLesson(BaseModel):
    starts_at: str
    ends_at: str
    subject_code: str
    subject_name: str
    teacher_name: str
    room: str | None


class StudentProfile(BaseModel):
    generated_at: datetime
    student: ProfileStudent
    enrollment: ProfileEnrollment | None
    guardians: list[ProfileGuardian]
    attendance: ProfileAttendance | None
    finance: ProfileFinance | None
    results: list[ProfileTermResult]
    schedule_today: list[ProfileLesson]


async def _active_term(session: AsyncSession, school_id: UUID) -> AcademicTerm | None:
    """The term covering today, falling back to the most recent one on record."""
    today = date.today()
    return await session.scalar(
        select(AcademicTerm)
        .where(AcademicTerm.school_id == school_id)
        .order_by(
            ((AcademicTerm.starts_on <= today) & (today <= AcademicTerm.ends_on)).desc(),
            AcademicTerm.starts_on.desc(),
            AcademicTerm.ordinal,
        )
        .limit(1)
    )


@router.get("/{student_id}/profile", response_model=StudentProfile)
async def student_profile(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StudentProfile:
    """Everything the student profile page shows, in one role-scoped payload."""
    school_id = context.school_id
    student = await session.scalar(select(Student).where(
        Student.id == student_id, Student.school_id == school_id,
    ))
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    today = date.today()
    age = None
    if student.date_of_birth:
        age = today.year - student.date_of_birth.year - (
            (today.month, today.day) < (student.date_of_birth.month, student.date_of_birth.day)
        )

    # Most recent enrolment, preferring the active one.
    enrollment_row = (await session.execute(
        select(StudentEnrollment, ClassGroup, AcademicYear)
        .join(ClassGroup, (ClassGroup.id == StudentEnrollment.class_group_id)
              & (ClassGroup.school_id == StudentEnrollment.school_id))
        .join(AcademicYear, (AcademicYear.id == StudentEnrollment.academic_year_id)
              & (AcademicYear.school_id == StudentEnrollment.school_id))
        .where(StudentEnrollment.school_id == school_id,
               StudentEnrollment.student_id == student_id)
        .order_by((StudentEnrollment.status == "active").desc(),
                  StudentEnrollment.enrolled_on.desc())
        .limit(1)
    )).first()
    enrollment = None
    class_group_id = None
    if enrollment_row:
        row, group, year = enrollment_row
        class_group_id = group.id
        enrollment = ProfileEnrollment(
            class_group_id=group.id, class_name=group.name, grade_level=group.grade_level,
            stream=group.stream, academic_year=year.name, enrolled_on=row.enrolled_on,
        )

    guardian_rows = (await session.execute(
        select(StudentGuardian, Guardian)
        .join(Guardian, (Guardian.id == StudentGuardian.guardian_id)
              & (Guardian.school_id == StudentGuardian.school_id))
        .where(StudentGuardian.school_id == school_id,
               StudentGuardian.student_id == student_id)
        .order_by(StudentGuardian.is_primary.desc(), Guardian.last_name, Guardian.first_name)
    )).all()
    guardians = [ProfileGuardian(
        guardian_id=guardian.id,
        full_name=f"{guardian.first_name} {guardian.last_name}",
        relationship=guardian.relationship, email=guardian.email, phone=guardian.phone,
        is_primary=link.is_primary,
    ) for link, guardian in guardian_rows]

    # Attendance: whole current term when one exists, plus a 30-day trail.
    attendance = None
    if context.role in (
        MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL,
        MembershipRole.REGISTRAR, MembershipRole.TEACHER,
    ):
        term = await _active_term(session, school_id)
        date_filters = []
        if term:
            date_filters = [
                AttendanceSession.attendance_date >= term.starts_on,
                AttendanceSession.attendance_date <= term.ends_on,
            ]
        counts = dict((await session.execute(
            select(AttendanceRecord.status, func.count())
            .join(AttendanceSession, (AttendanceSession.id == AttendanceRecord.session_id)
                  & (AttendanceSession.school_id == AttendanceRecord.school_id))
            .where(AttendanceRecord.school_id == school_id,
                   AttendanceRecord.student_id == student_id,
                   *date_filters)
            .group_by(AttendanceRecord.status)
        )).all())
        recent_rows = (await session.execute(
            select(AttendanceSession.attendance_date, AttendanceRecord.status)
            .join(AttendanceSession, (AttendanceSession.id == AttendanceRecord.session_id)
                  & (AttendanceSession.school_id == AttendanceRecord.school_id))
            .where(AttendanceRecord.school_id == school_id,
                   AttendanceRecord.student_id == student_id,
                   AttendanceSession.attendance_date >= today - timedelta(days=30))
            .order_by(AttendanceSession.attendance_date)
        )).all()
        present = counts.get("present", 0)
        late = counts.get("late", 0)
        total = present + late + counts.get("absent", 0) + counts.get("excused", 0)
        attendance = ProfileAttendance(
            present=present, absent=counts.get("absent", 0), late=late,
            excused=counts.get("excused", 0), days_marked=total,
            rate_percent=round((present + late) * 100 / total, 1) if total else None,
            recent=[ProfileAttendanceDay(day=day, status=status) for day, status in recent_rows],
        )

    # Fees are money: only finance-capable roles receive the section.
    finance = None
    if context.role in FINANCE_ROLES:
        invoice_rows = (await session.execute(
            select(StudentInvoice, AcademicTerm.name)
            .join(AcademicTerm, (AcademicTerm.id == StudentInvoice.term_id)
                  & (AcademicTerm.school_id == StudentInvoice.school_id))
            .where(StudentInvoice.school_id == school_id,
                   StudentInvoice.student_id == student_id,
                   StudentInvoice.status != "void")
            .order_by(StudentInvoice.issued_on.desc(), StudentInvoice.invoice_number)
        )).all()
        invoices = [ProfileInvoice(
            id=invoice.id, invoice_number=invoice.invoice_number, term_name=term_name,
            total_amount=invoice.total_amount, paid_amount=invoice.paid_amount,
            balance=invoice.total_amount - invoice.paid_amount,
            status=invoice.status, issued_on=invoice.issued_on,
        ) for invoice, term_name in invoice_rows]
        invoiced = sum((item.total_amount for item in invoices), Decimal(0))
        paid = sum((item.paid_amount for item in invoices), Decimal(0))
        finance = ProfileFinance(
            invoiced_total=invoiced, paid_total=paid,
            outstanding_total=invoiced - paid, invoices=invoices,
        )

    result_rows = (await session.execute(
        select(TermResult, AcademicTerm.name, AcademicTerm.ordinal,
               AcademicYear.name, ResultPublication.status)
        .join(AcademicTerm, (AcademicTerm.id == TermResult.term_id)
              & (AcademicTerm.school_id == TermResult.school_id))
        .join(AcademicYear, (AcademicYear.id == AcademicTerm.academic_year_id)
              & (AcademicYear.school_id == AcademicTerm.school_id))
        .outerjoin(ResultPublication, (ResultPublication.school_id == TermResult.school_id)
                   & (ResultPublication.term_id == TermResult.term_id)
                   & (ResultPublication.class_group_id == TermResult.class_group_id))
        .where(TermResult.school_id == school_id, TermResult.student_id == student_id)
        .order_by(AcademicYear.starts_on.desc(), AcademicTerm.ordinal)
    )).all()
    results = [ProfileTermResult(
        term_id=result.term_id, term_name=term_name, academic_year=year_name,
        ordinal=ordinal, aggregate_percent=result.aggregate_percent, grade=result.grade,
        position=result.position, published=publication == "published",
    ) for result, term_name, ordinal, year_name, publication in result_rows]

    schedule_today: list[ProfileLesson] = []
    if class_group_id:
        slot_rows = (await session.execute(
            select(TimetableSlot, Subject, User)
            .join(Subject, (Subject.id == TimetableSlot.subject_id)
                  & (Subject.school_id == TimetableSlot.school_id))
            .join(SchoolMembership, (SchoolMembership.id == TimetableSlot.teacher_membership_id)
                  & (SchoolMembership.school_id == TimetableSlot.school_id))
            .join(User, User.id == SchoolMembership.user_id)
            .where(TimetableSlot.school_id == school_id,
                   TimetableSlot.class_group_id == class_group_id,
                   TimetableSlot.day_of_week == datetime.now(UTC).weekday())
            .order_by(TimetableSlot.starts_at)
        )).all()
        schedule_today = [ProfileLesson(
            starts_at=slot.starts_at.strftime("%H:%M"), ends_at=slot.ends_at.strftime("%H:%M"),
            subject_code=subject.code, subject_name=subject.name,
            teacher_name=user.display_name, room=slot.room,
        ) for slot, subject, user in slot_rows]

    return StudentProfile(
        generated_at=datetime.now(UTC),
        student=ProfileStudent(
            id=student.id, admission_number=student.admission_number,
            first_name=student.first_name, last_name=student.last_name,
            display_name=f"{student.first_name} {student.last_name}",
            date_of_birth=student.date_of_birth, age_years=age, status=student.status,
        ),
        enrollment=enrollment, guardians=guardians, attendance=attendance,
        finance=finance, results=results, schedule_today=schedule_today,
    )
