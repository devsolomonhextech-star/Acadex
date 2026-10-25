"""One aggregated profile for a single student, computed from live rows.

Identity, enrolment, guardians, attendance, term results, invoices, subjects,
the full weekly timetable, behaviour notes, documents, and a recent-activity
feed come back in a single response so the profile page renders without a
request waterfall. Sections a role may not see (fees for non-finance roles)
are returned as ``null`` rather than 403, matching the overview dashboard.

The same module owns the profile's management actions: editing the student,
setting the portal password, recording behaviour, filing documents, and
messaging the guardians.
"""
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
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
    BehaviorRecord,
    ClassGroup,
    ClassSubjectAssignment,
    Guardian,
    MembershipRole,
    Notification,
    Payment,
    PaymentAllocation,
    ResultPublication,
    SchoolMembership,
    Student,
    StudentDocument,
    StudentEnrollment,
    StudentGuardian,
    StudentInvoice,
    Subject,
    TermResult,
    TimetableSlot,
    User,
)
from app.security import hash_password, verify_password

router = APIRouter(prefix="/api/v1/students", tags=["student-profile"])

FINANCE_ROLES = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.FINANCE)
STAFF_ROLES = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR)
EDIT_ROLES = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR)

DAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


class ProfileStudent(BaseModel):
    id: UUID
    admission_number: str
    first_name: str
    last_name: str
    display_name: str
    date_of_birth: date | None
    age_years: int | None
    gender: str | None
    phone: str | None
    email: str | None
    status: str
    has_portal_login: bool


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
    has_portal_login: bool


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


class ProfilePayment(BaseModel):
    id: UUID
    receipt_number: str
    amount: Decimal
    method: str
    reference: str | None
    payment_date: date
    allocated_amount: Decimal
    unallocated_amount: Decimal


class ProfileFinance(BaseModel):
    invoiced_total: Decimal
    paid_total: Decimal
    outstanding_total: Decimal
    invoices: list[ProfileInvoice]
    payments: list[ProfilePayment]


class ProfileTermResult(BaseModel):
    term_id: UUID
    term_name: str
    academic_year: str
    ordinal: int
    aggregate_percent: Decimal
    grade: str | None
    position: int | None
    published: bool


class ProfileSubject(BaseModel):
    subject_code: str
    subject_name: str
    teacher_name: str | None


class ProfileLesson(BaseModel):
    starts_at: str
    ends_at: str
    subject_code: str
    subject_name: str
    teacher_name: str
    room: str | None


class ProfileWeekdayLesson(ProfileLesson):
    day_of_week: int
    day_name: str


class ProfileBehavior(BaseModel):
    id: UUID
    occurred_on: date
    category: str
    severity: str
    title: str
    description: str | None
    action_taken: str | None
    recorded_by: str


class ProfileDocument(BaseModel):
    id: UUID
    doc_type: str
    title: str
    reference: str | None
    issued_on: date | None
    notes: str | None
    created_at: datetime
    added_by: str


class ProfileActivity(BaseModel):
    key: str
    kind: Literal["attendance", "payment", "result", "behavior", "document"]
    title: str
    detail: str
    at: datetime
    day: date


class StudentProfile(BaseModel):
    generated_at: datetime
    student: ProfileStudent
    enrollment: ProfileEnrollment | None
    guardians: list[ProfileGuardian]
    attendance: ProfileAttendance | None
    finance: ProfileFinance | None
    results: list[ProfileTermResult]
    subjects: list[ProfileSubject]
    schedule_today: list[ProfileLesson]
    schedule: list[ProfileWeekdayLesson]
    behavior: list[ProfileBehavior]
    documents: list[ProfileDocument]
    activities: list[ProfileActivity]


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


async def _find_student(session: AsyncSession, school_id: UUID, student_id: UUID) -> Student:
    student = await session.scalar(select(Student).where(
        Student.id == student_id, Student.school_id == school_id,
    ))
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.get("/{student_id}/profile", response_model=StudentProfile)
async def student_profile(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StudentProfile:
    """Everything the student profile page shows, in one role-scoped payload."""
    school_id = context.school_id
    student = await _find_student(session, school_id, student_id)

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
        is_primary=link.is_primary, has_portal_login=guardian.user_id is not None,
    ) for link, guardian in guardian_rows]

    # Attendance: whole current term when one exists, plus a 30-day trail.
    attendance = None
    attendance_role = context.role in (
        MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL,
        MembershipRole.REGISTRAR, MembershipRole.TEACHER,
    )
    if attendance_role:
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
            payments=[
                ProfilePayment(
                    id=payment.id,
                    receipt_number=payment.receipt_number,
                    amount=payment.amount,
                    method=payment.method,
                    reference=payment.reference,
                    payment_date=payment.payment_date,
                    allocated_amount=allocated,
                    unallocated_amount=payment.amount - allocated,
                )
                for payment, allocated in (await session.execute(
                    select(Payment, func.coalesce(func.sum(PaymentAllocation.amount), Decimal(0)))
                    .outerjoin(
                        PaymentAllocation,
                        (PaymentAllocation.payment_id == Payment.id)
                        & (PaymentAllocation.school_id == school_id),
                    )
                    .where(
                        Payment.school_id == school_id,
                        Payment.student_id == student_id,
                        Payment.status == "recorded",
                    )
                    .group_by(Payment.id)
                    .order_by(Payment.payment_date.desc(), Payment.created_at.desc())
                )).all()
            ],
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

    # Subjects taught in the class, each with its teacher of record.
    subjects: list[ProfileSubject] = []
    if class_group_id:
        subject_rows = (await session.execute(
            select(Subject, User.display_name)
            .join(ClassSubjectAssignment, (ClassSubjectAssignment.subject_id == Subject.id)
                  & (ClassSubjectAssignment.school_id == Subject.school_id))
            .outerjoin(SchoolMembership, (SchoolMembership.id == ClassSubjectAssignment.teacher_membership_id)
                       & (SchoolMembership.school_id == ClassSubjectAssignment.school_id))
            .outerjoin(User, User.id == SchoolMembership.user_id)
            .where(ClassSubjectAssignment.school_id == school_id,
                   ClassSubjectAssignment.class_group_id == class_group_id)
            .order_by(Subject.name)
        )).all()
        subjects = [ProfileSubject(
            subject_code=subject.code, subject_name=subject.name, teacher_name=teacher_name,
        ) for subject, teacher_name in subject_rows]

    schedule_today: list[ProfileLesson] = []
    schedule: list[ProfileWeekdayLesson] = []
    if class_group_id:
        slot_rows = (await session.execute(
            select(TimetableSlot, Subject, User)
            .join(Subject, (Subject.id == TimetableSlot.subject_id)
                  & (Subject.school_id == TimetableSlot.school_id))
            .join(SchoolMembership, (SchoolMembership.id == TimetableSlot.teacher_membership_id)
                  & (SchoolMembership.school_id == TimetableSlot.school_id))
            .join(User, User.id == SchoolMembership.user_id)
            .where(TimetableSlot.school_id == school_id,
                   TimetableSlot.class_group_id == class_group_id)
            .order_by(TimetableSlot.day_of_week, TimetableSlot.starts_at)
        )).all()
        schedule = [ProfileWeekdayLesson(
            day_of_week=slot.day_of_week, day_name=DAY_NAMES[slot.day_of_week],
            starts_at=slot.starts_at.strftime("%H:%M"), ends_at=slot.ends_at.strftime("%H:%M"),
            subject_code=subject.code, subject_name=subject.name,
            teacher_name=user.display_name, room=slot.room,
        ) for slot, subject, user in slot_rows]
        today_index = datetime.now(UTC).weekday()
        schedule_today = [ProfileLesson(
            starts_at=item.starts_at, ends_at=item.ends_at, subject_code=item.subject_code,
            subject_name=item.subject_name, teacher_name=item.teacher_name, room=item.room,
        ) for item in schedule if item.day_of_week == today_index]

    behavior_rows = (await session.execute(
        select(BehaviorRecord, User.display_name)
        .join(SchoolMembership, (SchoolMembership.id == BehaviorRecord.recorded_by_membership_id)
              & (SchoolMembership.school_id == BehaviorRecord.school_id))
        .join(User, User.id == SchoolMembership.user_id)
        .where(BehaviorRecord.school_id == school_id, BehaviorRecord.student_id == student_id)
        .order_by(BehaviorRecord.occurred_on.desc(), BehaviorRecord.created_at.desc())
    )).all()
    behavior = [ProfileBehavior(
        id=record.id, occurred_on=record.occurred_on, category=record.category,
        severity=record.severity, title=record.title, description=record.description,
        action_taken=record.action_taken, recorded_by=recorder,
    ) for record, recorder in behavior_rows]

    document_rows = (await session.execute(
        select(StudentDocument, User.display_name)
        .join(User, User.id == StudentDocument.created_by_user_id)
        .where(StudentDocument.school_id == school_id, StudentDocument.student_id == student_id)
        .order_by(StudentDocument.created_at.desc())
    )).all()
    documents = [ProfileDocument(
        id=record.id, doc_type=record.doc_type, title=record.title,
        reference=record.reference, issued_on=record.issued_on, notes=record.notes,
        created_at=record.created_at, added_by=adder,
    ) for record, adder in document_rows]

    activities = await _recent_activities(
        session, school_id, student_id, attendance_role,
        context.role in FINANCE_ROLES, behavior, documents,
    )

    return StudentProfile(
        generated_at=datetime.now(UTC),
        student=ProfileStudent(
            id=student.id, admission_number=student.admission_number,
            first_name=student.first_name, last_name=student.last_name,
            display_name=f"{student.first_name} {student.last_name}",
            date_of_birth=student.date_of_birth, age_years=age,
            gender=student.gender, phone=student.phone, email=student.email,
            status=student.status, has_portal_login=student.user_id is not None,
        ),
        enrollment=enrollment, guardians=guardians, attendance=attendance,
        finance=finance, results=results, subjects=subjects,
        schedule_today=schedule_today, schedule=schedule,
        behavior=behavior, documents=documents, activities=activities,
    )


async def _recent_activities(
    session: AsyncSession,
    school_id: UUID,
    student_id: UUID,
    include_attendance: bool,
    include_finance: bool,
    behavior: list[ProfileBehavior],
    documents: list[ProfileDocument],
) -> list[ProfileActivity]:
    """Latest life events across the student's record, newest first."""
    feed: list[ProfileActivity] = []

    if include_attendance:
        attendance_rows = (await session.execute(
            select(AttendanceSession.attendance_date, AttendanceRecord.status,
                   AttendanceRecord.updated_at)
            .join(AttendanceSession, (AttendanceSession.id == AttendanceRecord.session_id)
                  & (AttendanceSession.school_id == AttendanceRecord.school_id))
            .where(AttendanceRecord.school_id == school_id,
                   AttendanceRecord.student_id == student_id)
            .order_by(AttendanceSession.attendance_date.desc())
            .limit(4)
        )).all()
        labels = {"present": "Present", "absent": "Absent", "late": "Late", "excused": "Excused"}
        for day, status, marked_at in attendance_rows:
            feed.append(ProfileActivity(
                key=f"attendance-{day}", kind="attendance", title="Attendance marked",
                detail=f"Marked {labels.get(status, status)} for the day",
                at=marked_at or datetime.combine(day, time(8, 0), tzinfo=UTC), day=day,
            ))

    if include_finance:
        payment_rows = (await session.execute(
            select(Payment).where(Payment.school_id == school_id,
                                  Payment.student_id == student_id,
                                  Payment.status == "recorded")
            .order_by(Payment.payment_date.desc(), Payment.created_at.desc())
            .limit(4)
        )).scalars().all()
        for payment in payment_rows:
            feed.append(ProfileActivity(
                key=f"payment-{payment.id}", kind="payment", title="Fee payment received",
                detail=f"₵ {payment.amount:,.2f} · {payment.method.replace('_', ' ')} · {payment.receipt_number}",
                at=payment.created_at, day=payment.payment_date,
            ))

    result_rows = (await session.execute(
        select(TermResult, AcademicTerm.name)
        .join(AcademicTerm, (AcademicTerm.id == TermResult.term_id)
              & (AcademicTerm.school_id == TermResult.school_id))
        .where(TermResult.school_id == school_id, TermResult.student_id == student_id)
        .order_by(TermResult.computed_at.desc())
        .limit(3)
    )).all()
    for result, term_name in result_rows:
        position = f", placed {result.position} in class" if result.position else ""
        feed.append(ProfileActivity(
            key=f"result-{result.id}", kind="result", title="Term result computed",
            detail=f"{term_name}: {result.aggregate_percent}% ({result.grade or 'no grade'}){position}",
            at=result.computed_at, day=result.computed_at.date(),
        ))

    for record in behavior[:3]:
        feed.append(ProfileActivity(
            key=f"behavior-{record.id}", kind="behavior", title=f"{record.category.title()} noted",
            detail=record.title, at=datetime.combine(record.occurred_on, time(9, 0), tzinfo=UTC),
            day=record.occurred_on,
        ))

    for record in documents[:3]:
        feed.append(ProfileActivity(
            key=f"document-{record.id}", kind="document", title="Document filed",
            detail=record.title, at=record.created_at, day=record.created_at.date(),
        ))

    feed.sort(key=lambda item: item.at, reverse=True)
    return feed[:10]


# ----------------------------------------------------------------- management


class StudentUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    date_of_birth: date | None = None
    gender: Literal["male", "female", "other"] | None = None
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=254)
    status: Literal["active", "transferred", "graduated", "withdrawn"] | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def normalize_person_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = " ".join(value.split())
        if not value:
            raise ValueError("Name cannot be empty")
        return value

    @field_validator("phone", "email")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("date_of_birth")
    @classmethod
    def birth_date_is_not_in_future(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return value


@router.patch("/{student_id}", response_model=ProfileStudent)
async def edit_student(
    student_id: UUID,
    payload: StudentUpdate,
    context: Annotated[TenantContext, Depends(require_roles(*EDIT_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProfileStudent:
    """Update the editable profile fields of one student."""
    student = await _find_student(session, context.school_id, student_id)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(student, field, value)
    await session.commit()
    await session.refresh(student)
    today = date.today()
    age = None
    if student.date_of_birth:
        age = today.year - student.date_of_birth.year - (
            (today.month, today.day) < (student.date_of_birth.month, student.date_of_birth.day)
        )
    return ProfileStudent(
        id=student.id, admission_number=student.admission_number,
        first_name=student.first_name, last_name=student.last_name,
        display_name=f"{student.first_name} {student.last_name}",
        date_of_birth=student.date_of_birth, age_years=age,
        gender=student.gender, phone=student.phone, email=student.email,
        status=student.status, has_portal_login=student.user_id is not None,
    )


class PasswordReset(BaseModel):
    current_password: str | None = Field(default=None, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class PasswordResetResult(BaseModel):
    email: str
    created_account: bool


@router.post("/{student_id}/password", response_model=PasswordResetResult)
async def set_student_password(
    student_id: UUID,
    payload: PasswordReset,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PasswordResetResult:
    """Set or reset a student's portal password, creating the account on first use.

    When an account already exists and a current password is supplied it must
    match, so the sidebar form cannot silently overwrite a working login.
    """
    student = await _find_student(session, context.school_id, student_id)
    created_account = False

    if student.user_id is not None:
        user = await session.get(User, student.user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="Student account not found")
        if payload.current_password and not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(status_code=403, detail="The current password is incorrect")
        user.password_hash = hash_password(payload.new_password)
    else:
        if student.email is None:
            raise HTTPException(
                status_code=422,
                detail="Add an email address to the student first, or edit the profile to set one",
            )
        existing = await session.scalar(select(User).where(User.email == student.email))
        if existing is not None:
            raise HTTPException(status_code=409, detail="That email already belongs to another account")
        user = User(
            email=student.email, display_name=f"{student.first_name} {student.last_name}",
            password_hash=hash_password(payload.new_password),
        )
        session.add(user)
        await session.flush()
        session.add(SchoolMembership(
            school_id=context.school_id, user_id=user.id, role=MembershipRole.STUDENT,
        ))
        student.user_id = user.id
        created_account = True

    await session.commit()
    return PasswordResetResult(email=student.email or "", created_account=created_account)


class BehaviorCreate(BaseModel):
    occurred_on: date
    category: Literal["merit", "demerit", "incident", "note"]
    severity: Literal["low", "medium", "high"] = "low"
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    action_taken: str | None = Field(default=None, max_length=240)


@router.post("/{student_id}/behavior", response_model=ProfileBehavior, status_code=201)
async def record_behavior(
    student_id: UUID,
    payload: BehaviorCreate,
    context: Annotated[TenantContext, Depends(require_roles(*EDIT_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProfileBehavior:
    """Attach a behaviour note to a student's record."""
    student = await _find_student(session, context.school_id, student_id)
    membership = await session.scalar(select(SchoolMembership).where(
        SchoolMembership.school_id == context.school_id,
        SchoolMembership.user_id == context.user_id,
        SchoolMembership.status == "active",
    ))
    if membership is None:  # pragma: no cover - every staff user has a membership
        raise HTTPException(status_code=403, detail="No active membership")
    record = BehaviorRecord(
        school_id=context.school_id, student_id=student.id,
        occurred_on=payload.occurred_on, category=payload.category,
        severity=payload.severity, title=payload.title.strip(),
        description=payload.description, action_taken=payload.action_taken,
        recorded_by_membership_id=membership.id,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    actor = await session.scalar(select(User.display_name).where(User.id == context.user_id))
    return ProfileBehavior(
        id=record.id, occurred_on=record.occurred_on, category=record.category,
        severity=record.severity, title=record.title, description=record.description,
        action_taken=record.action_taken, recorded_by=actor or "Staff",
    )


@router.delete("/{student_id}/behavior/{record_id}", status_code=204)
async def delete_behavior(
    student_id: UUID,
    record_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Remove a behaviour note from a student's record."""
    record = await session.scalar(select(BehaviorRecord).where(
        BehaviorRecord.id == record_id,
        BehaviorRecord.student_id == student_id,
        BehaviorRecord.school_id == context.school_id,
    ))
    if record is None:
        raise HTTPException(status_code=404, detail="Behaviour record not found")
    await session.delete(record)
    await session.commit()


class DocumentCreate(BaseModel):
    doc_type: Literal["id_card", "birth_certificate", "previous_report", "medical", "consent", "other"]
    title: str = Field(min_length=1, max_length=120)
    reference: str | None = Field(default=None, max_length=80)
    issued_on: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


@router.post("/{student_id}/documents", response_model=ProfileDocument, status_code=201)
async def file_document(
    student_id: UUID,
    payload: DocumentCreate,
    context: Annotated[TenantContext, Depends(require_roles(*EDIT_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProfileDocument:
    """Record a document on file for a student."""
    student = await _find_student(session, context.school_id, student_id)
    record = StudentDocument(
        school_id=context.school_id, student_id=student.id,
        doc_type=payload.doc_type, title=payload.title.strip(),
        reference=payload.reference, issued_on=payload.issued_on, notes=payload.notes,
        created_by_user_id=context.user_id,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    actor = await session.scalar(select(User.display_name).where(User.id == context.user_id))
    return ProfileDocument(
        id=record.id, doc_type=record.doc_type, title=record.title,
        reference=record.reference, issued_on=record.issued_on, notes=record.notes,
        created_at=record.created_at, added_by=actor or "Staff",
    )


@router.delete("/{student_id}/documents/{record_id}", status_code=204)
async def delete_document(
    student_id: UUID,
    record_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Remove a document from a student's record."""
    record = await session.scalar(select(StudentDocument).where(
        StudentDocument.id == record_id,
        StudentDocument.student_id == student_id,
        StudentDocument.school_id == context.school_id,
    ))
    if record is None:
        raise HTTPException(status_code=404, detail="Document not found")
    await session.delete(record)
    await session.commit()


class MessageCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=4000)


class MessageResult(BaseModel):
    recipients: int
    guardian_names: list[str]


@router.post("/{student_id}/message", response_model=MessageResult)
async def message_guardians(
    student_id: UUID,
    payload: MessageCreate,
    context: Annotated[TenantContext, Depends(require_roles(*STAFF_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MessageResult:
    """Send a message to every guardian of the student that has a portal login."""
    student = await _find_student(session, context.school_id, student_id)
    rows = (await session.execute(
        select(Guardian)
        .join(StudentGuardian, StudentGuardian.guardian_id == Guardian.id)
        .where(StudentGuardian.school_id == context.school_id,
               StudentGuardian.student_id == student.id,
               Guardian.user_id.is_not(None))
    )).scalars().all()
    if not rows:
        raise HTTPException(
            status_code=409,
            detail="No guardian of this student has a portal login yet",
        )
    sender = await session.scalar(select(User.display_name).where(User.id == context.user_id))
    for guardian in rows:
        session.add(Notification(
            school_id=context.school_id, user_id=guardian.user_id,
            title=f"{payload.title} — {student.first_name} {student.last_name}",
            body=payload.body, type="message",
            link=f"/students/{student.id}",
        ))
    await session.commit()
    return MessageResult(
        recipients=len(rows),
        guardian_names=[f"{g.first_name} {g.last_name}" for g in rows],
    )
