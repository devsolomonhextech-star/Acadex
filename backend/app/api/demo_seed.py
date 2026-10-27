"""One-click demo data for a freshly set-up school.

Independent sections — billing, attendance, term results, student profile
fields, guardian portal logins, subject coverage, a full weekly timetable,
behaviour notes, documents, and a finished prior school year — each skipping
whatever already exists, so repeated clicks only fill in what is still missing
and real records are never overwritten.
"""
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain.finance import FinanceError, generate_invoices, quantize, record_payment
from app.domain.results import active_default_scale, grade_for, load_bands
from app.security import hash_password
from app.models import (
    AcademicTerm,
    AcademicYear,
    AcademicCalendarEvent,
    AttendanceRecord,
    AttendanceSession,
    AuditEvent,
    BehaviorRecord,
    ClassGroup,
    ClassSubjectAssignment,
    FeeCategory,
    FeeStructure,
    GradingBand,
    GradingScale,
    Guardian,
    MembershipRole,
    Payment,
    ResultPublication,
    School,
    SchoolMembership,
    Student,
    StudentDocument,
    StudentEnrollment,
    StudentGuardian,
    StudentInvoice,
    Task,
    Subject,
    TermResult,
    TimetableSlot,
    User,
)

router = APIRouter(prefix="/api/v1/overview", tags=["overview"])

DEMO_PAYMENT_PREFIX = "DEMO-"
# Issue demo invoices three weeks back so partial ones read as overdue and
# the attention panel gets a genuine finance follow-up.
DEMO_INVOICE_AGE_DAYS = 21
DEMO_FEE_CATEGORIES = (("Tuition", Decimal("450.00")), ("Feeding", Decimal("150.00")))
# Look back over the whole term (capped at four months) so attendance stats
# cover every school day since the term opened, not just the last month.
DEMO_ATTENDANCE_WINDOW_DAYS = 120
# 16 present, 2 late, 1 absent, 1 excused — picked by a stable day/student index.
DEMO_ATTENDANCE_PATTERN = ("present",) * 16 + ("late",) * 2 + ("absent",) + ("excused",)
# Used only when the school has no default grading scale yet; contiguous 0-100.
DEMO_GRADE_BANDS = (
    ("A", Decimal("80.00"), Decimal("100.00"), Decimal("4.00")),
    ("B", Decimal("70.00"), Decimal("79.99"), Decimal("3.00")),
    ("C", Decimal("60.00"), Decimal("69.99"), Decimal("2.00")),
    ("D", Decimal("50.00"), Decimal("59.99"), Decimal("1.00")),
    ("F", Decimal("0.00"), Decimal("49.99"), Decimal("0.00")),
)
# Profile depth: portal logins, a full week timetable, behaviour, documents.
DEMO_PARENT_PASSWORD = "Parent-demo-2026"
DEMO_TEACHER_PASSWORD = "Teacher-demo-2026"
DEMO_EXTRA_TEACHERS = ("Nii Armah", "Adjoa Quaye", "Yao Asare", "Comfort Baidoo")
DEMO_MOTHER_NAMES = ("Akua", "Abena", "Ama", "Efua", "Adwoa", "Naa", "Yaa", "Esi", "Akosua", "Dzidzor")
DEMO_FATHER_NAMES = ("Kwame", "Kofi", "Kojo", "Yaw", "Kwabena", "Nii", "Yao", "Selorm", "Nana", "Kwesi")
DEMO_FEMALE_NAMES = {"Akua", "Abena", "Ama", "Efua", "Adwoa", "Naa", "Yaa", "Afua", "Esi", "Akosua", "Dzidzor"}
DEMO_MALE_NAMES = {"Kwame", "Kofi", "Kojo", "Yaw", "Kwabena", "Nii", "Yao", "Selorm", "Nana", "Kwesi"}
# Five lesson periods covering a school day, as minutes from midnight.
DEMO_PERIODS = ((480, 540), (555, 615), (630, 690), (720, 780), (840, 900))
DEMO_BEHAVIOR_ENTRIES = (
    ("merit", "low", "Won the inter-house quiz",
     "Represented the class in the inter-house general knowledge quiz and finished first.",
     "Certificate of merit awarded"),
    ("merit", "low", "Excellent participation in science lab",
     "Volunteered for every demonstration and handled the apparatus safely.",
     "Commended in class"),
    ("demerit", "low", "Homework not submitted on time",
     "Mathematics homework handed in two days late without a reason.",
     "Detained to finish the work"),
    ("demerit", "medium", "Late to class three times this week",
     "Arrived after the bell on Monday, Wednesday and Friday.",
     "Guardian notified"),
    ("note", "low", "Settling in well this term",
     "Getting along with classmates and participating in group work.", "None"),
    ("note", "low", "Needs extra reading practice",
     "Reading comprehension lags the rest of the class; extra reading recommended.",
     "Weekly reading plan given"),
    ("incident", "medium", "Minor scuffle during break time",
     "A short argument with a classmate over a ball; both learners cooled off quickly.",
     "Mediation with both learners"),
    ("merit", "low", "Helped a classmate with maths",
     "Stayed after class to explain fractions to a struggling classmate.",
     "Praised by the teacher"),
    ("demerit", "low", "Talking during a lesson",
     "Repeated warnings ignored during the history lesson.", "Warning recorded"),
    ("incident", "low", "Broken lab beaker",
     "Accidentally knocked a beaker off the bench during practical work.",
     "Apologised; no injury"),
)
DEMO_DOCUMENTS = (
    ("birth_certificate", "Birth certificate", "BC"),
    ("previous_report", "Previous school report card", "PR"),
    ("medical", "Medical record form", "MED"),
    ("consent", "Guardian consent form", "GC"),
    ("id_card", "Student ID card", "ID"),
)


class DemoSeedResponse(BaseModel):
    invoices_created: int
    payments_created: int
    attendance_records_created: int
    results_created: int
    profiles_filled: int
    guardians_created: int
    teachers_created: int
    subject_assignments_created: int
    class_teachers_set: int
    timetable_created: int
    behavior_created: int
    documents_created: int
    history_year_created: bool
    history_results_created: int
    history_invoices_created: int
    history_payments_created: int
    calendar_events_created: int
    tasks_created: int
    invoiced_total: Decimal
    paid_total: Decimal


@router.post("/demo/seed", response_model=DemoSeedResponse)
async def seed_demo_data(
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DemoSeedResponse:
    """Seed every demo section; each one idempotent on its own guard.

    Fees are guarded by their ``DEMO-`` payment references, attendance skips
    class-dates that already have a sheet, results skip students who already
    have a row, profile sections skip students who already carry that data,
    and the prior school year is created only once — so a double click changes
    nothing, while a partial earlier run is simply completed.
    """
    school_id = context.school_id
    today = date.today()

    async def money_totals() -> tuple[Decimal, Decimal]:
        invoiced, paid = (await session.execute(
            select(func.coalesce(func.sum(StudentInvoice.total_amount), 0),
                   func.coalesce(func.sum(StudentInvoice.paid_amount), 0))
            .where(StudentInvoice.school_id == school_id,
                   StudentInvoice.status != "void")
        )).one()
        return Decimal(invoiced), Decimal(paid)

    term_row = (await session.execute(
        select(AcademicTerm, AcademicYear)
        .join(AcademicYear, (AcademicYear.id == AcademicTerm.academic_year_id)
              & (AcademicYear.school_id == AcademicTerm.school_id))
        .where(AcademicTerm.school_id == school_id)
        .order_by(
            ((AcademicTerm.starts_on <= today) & (today <= AcademicTerm.ends_on)).desc(),
            AcademicYear.starts_on.desc(), AcademicTerm.ordinal,
        )
        .limit(1)
    )).first()
    if term_row is None:
        raise HTTPException(
            status_code=422,
            detail="Create an academic year and term before generating demo data",
        )
    term, year = term_row

    groups = (await session.scalars(
        select(ClassGroup)
        .where(ClassGroup.school_id == school_id, ClassGroup.academic_year_id == year.id)
        .order_by(ClassGroup.name, ClassGroup.id)
    )).all()
    if not groups:
        raise HTTPException(status_code=422, detail="Create a class group before generating demo data")

    calendar_events_created = 0
    term_days = max(0, (term.ends_on - term.starts_on).days)
    sample_calendar = (
        ("Term begins", "term", 0, 0, "First day of teaching for the selected term.", "all"),
        ("New student orientation", "event", 1, 1, "Welcome and orientation for new students.", "students"),
        ("Mid-term break", "holiday", term_days // 2, min(term_days // 2 + 1, term_days), "School closed for the mid-term break.", "all"),
        ("Staff meeting", "meeting", max(1, term_days // 2 - 1), max(1, term_days // 2 - 1), "Teaching and non-teaching staff meeting.", "staff"),
        ("Continuous assessment", "assessment", max(1, term_days * 3 // 4), max(1, term_days * 3 // 4), "Continuous assessment period for all classes.", "students"),
        ("Term ends", "term", term_days, term_days, "Final day of the selected academic term.", "all"),
    )
    for title, category, start_offset, end_offset, description, audience in sample_calendar:
        existing = await session.scalar(select(AcademicCalendarEvent.id).where(
            AcademicCalendarEvent.school_id == school_id,
            AcademicCalendarEvent.academic_year_id == year.id,
            AcademicCalendarEvent.term_id == term.id,
            AcademicCalendarEvent.title == title,
        ))
        if existing is not None:
            continue
        start = term.starts_on + timedelta(days=min(start_offset, term_days))
        end = term.starts_on + timedelta(days=min(end_offset, term_days))
        session.add(AcademicCalendarEvent(
            school_id=school_id, academic_year_id=year.id, term_id=term.id,
            title=title, category=category, audience=audience,
            starts_on=start, ends_on=end, description=description,
            created_by_user_id=context.user_id,
        ))
        calendar_events_created += 1
    if calendar_events_created:
        await session.commit()

    async def class_roster(class_group_id: UUID) -> list[UUID]:
        """Actively enrolled students, ordered stably by admission number."""
        return list(await session.scalars(
            select(StudentEnrollment.student_id)
            .join(Student, (Student.id == StudentEnrollment.student_id)
                  & (Student.school_id == StudentEnrollment.school_id))
            .where(StudentEnrollment.school_id == school_id,
                   StudentEnrollment.class_group_id == class_group_id,
                   StudentEnrollment.status == "active",
                   Student.status == "active")
            .order_by(Student.admission_number, Student.id)
        ))

    # ---------------------------------------------------------------- fees
    invoices_created = 0
    payments_created = 0
    demo_payments = (await session.execute(
        select(func.count()).where(
            Payment.school_id == school_id,
            Payment.reference.like(f"{DEMO_PAYMENT_PREFIX}%"),
        )
    )).scalar_one()
    if not demo_payments:
        category_ids: dict[str, UUID] = {}
        for name, _amount in DEMO_FEE_CATEGORIES:
            row = await session.scalar(select(FeeCategory).where(
                FeeCategory.school_id == school_id, FeeCategory.name == name))
            if row is None:
                row = FeeCategory(school_id=school_id, name=name)
                session.add(row)
                await session.flush()
            category_ids[name] = row.id

        for index, group in enumerate(groups):
            for name, amount in DEMO_FEE_CATEGORIES:
                structure = await session.scalar(select(FeeStructure).where(
                    FeeStructure.school_id == school_id,
                    FeeStructure.class_group_id == group.id,
                    FeeStructure.term_id == term.id,
                    FeeStructure.fee_category_id == category_ids[name],
                ))
                if structure is None:
                    session.add(FeeStructure(
                        school_id=school_id, fee_category_id=category_ids[name],
                        class_group_id=group.id, academic_year_id=year.id, term_id=term.id,
                        # Classes bill slightly different amounts for a lively ledger.
                        amount=quantize(amount + Decimal(index * 25)),
                    ))
                elif structure.status != "active":
                    structure.status = "active"
        # Commit the setup so invoice generation's own commits cannot roll it back.
        await session.commit()

        before = set(await session.scalars(
            select(StudentInvoice.id).where(StudentInvoice.school_id == school_id)))
        for group in groups:
            try:
                outcome = await generate_invoices(
                    session, school_id, context.user_id, group.id, term.id
                )
            except FinanceError:
                # Classes with no actively enrolled students are simply not billed.
                continue
            invoices_created += outcome["created"]
        after = set(await session.scalars(
            select(StudentInvoice.id).where(StudentInvoice.school_id == school_id)))
        new_ids = after - before
        if new_ids:
            await session.execute(
                update(StudentInvoice)
                .where(StudentInvoice.id.in_(new_ids))
                .values(issued_on=today - timedelta(days=DEMO_INVOICE_AGE_DAYS))
            )
            await session.commit()

        # Partial and full payments spread across the last seven weeks so the
        # fees card and activity chart show movement instead of a single spike.
        open_invoices = (await session.scalars(
            select(StudentInvoice)
            .where(StudentInvoice.school_id == school_id,
                   StudentInvoice.status.in_(("issued", "partially_paid")))
            .order_by(StudentInvoice.issued_on, StudentInvoice.created_at, StudentInvoice.id)
        )).all()
        methods = ("mobile_money", "cash", "bank_transfer")
        fractions = (Decimal(1), Decimal("0.6"), Decimal("0.3"))
        for index, invoice in enumerate(open_invoices):
            amount = quantize(invoice.total_amount * fractions[index % len(fractions)])
            if amount <= 0:
                continue
            try:
                await record_payment(
                    session, school_id, context.user_id, invoice.student_id,
                    amount=amount, method=methods[index % len(methods)],
                    payment_date=today - timedelta(weeks=index % 7, days=(index * 2) % 6),
                    reference=f"{DEMO_PAYMENT_PREFIX}{index + 1:03d}",
                    note="Demo payment",
                )
            except FinanceError:
                # A pre-existing conflict only skips that one sample payment.
                continue
            payments_created += 1

    # ---------------------------------------------------------- attendance
    attendance_records_created = 0
    window_start = max(term.starts_on, today - timedelta(days=DEMO_ATTENDANCE_WINDOW_DAYS))
    window_end = min(term.ends_on, today)
    if window_start <= window_end:
        membership_id = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == school_id,
            SchoolMembership.user_id == context.user_id,
            SchoolMembership.status == "active",
        ))
        if membership_id:
            existing_pairs = set((await session.execute(
                select(AttendanceSession.class_group_id, AttendanceSession.attendance_date)
                .where(AttendanceSession.school_id == school_id,
                       AttendanceSession.attendance_date >= window_start,
                       AttendanceSession.attendance_date <= window_end)
            )).all())
            weekdays = [
                window_start + timedelta(days=offset)
                for offset in range((window_end - window_start).days + 1)
                if (window_start + timedelta(days=offset)).weekday() < 5
            ]
            for class_index, group in enumerate(groups):
                roster = await class_roster(group.id)
                if not roster:
                    continue
                for day in weekdays:
                    if (group.id, day) in existing_pairs:
                        # Someone already marked this sheet; never overwrite it.
                        continue
                    sheet = AttendanceSession(
                        school_id=school_id, class_group_id=group.id,
                        attendance_date=day, recorded_by_membership_id=membership_id,
                    )
                    session.add(sheet)
                    await session.flush()
                    for student_index, student_id in enumerate(roster):
                        pick = DEMO_ATTENDANCE_PATTERN[
                            (student_index + class_index * 5 + day.toordinal()) % len(DEMO_ATTENDANCE_PATTERN)
                        ]
                        session.add(AttendanceRecord(
                            school_id=school_id, session_id=sheet.id,
                            student_id=student_id, status=pick,
                        ))
                        attendance_records_created += 1
            await session.commit()

    # -------------------------------------------------------- term results
    results_created = 0
    scale = await active_default_scale(session, school_id)
    if scale is None:
        scale = GradingScale(school_id=school_id, name="Standard scale", is_default=True)
        session.add(scale)
        await session.flush()
        for grade_name, min_percent, max_percent, points in DEMO_GRADE_BANDS:
            session.add(GradingBand(
                school_id=school_id, scale_id=scale.id,
                min_percent=min_percent, max_percent=max_percent,
                grade=grade_name, points=points,
            ))
        await session.flush()
    bands = await load_bands(session, school_id, scale.id)
    for class_index, group in enumerate(groups):
        roster = await class_roster(group.id)
        if not roster:
            continue
        already = set(await session.scalars(
            select(TermResult.student_id).where(
                TermResult.school_id == school_id,
                TermResult.term_id == term.id,
                TermResult.class_group_id == group.id,
            )
        ))
        # Score the whole class so positions stay consistent, then insert
        # only the students still missing a row.
        scored = sorted((
            (quantize(Decimal(55 + (student_index * 9 + class_index * 7) % 40)), student_id)
            for student_index, student_id in enumerate(roster)
        ), key=lambda row: (-row[0], str(row[1])))
        for position, (percent, student_id) in enumerate(scored, start=1):
            if student_id in already:
                continue
            grade, points = grade_for(percent, bands)
            session.add(TermResult(
                school_id=school_id, academic_year_id=year.id, term_id=term.id,
                class_group_id=group.id, student_id=student_id,
                aggregate_percent=percent, grade=grade, points=points,
                position=position if scale.include_positions else None,
            ))
            results_created += 1
    if results_created:
        await session.commit()

    # --------------------------------------------- profile demographics
    # Fill the details the profile header, fact row, and password settings
    # card need: gender, phone, and a school email for every learner.
    school = await session.get(School, school_id)
    school_slug = school.slug if school else "school"
    students_all = list((await session.execute(
        select(Student)
        .where(Student.school_id == school_id, Student.status == "active")
        .order_by(Student.admission_number, Student.id)
    )).scalars())
    profiles_filled = 0
    for index, student in enumerate(students_all):
        changed = False
        if student.gender is None:
            if student.first_name in DEMO_FEMALE_NAMES:
                student.gender = "female"
            elif student.first_name in DEMO_MALE_NAMES:
                student.gender = "male"
            else:
                student.gender = "female" if index % 2 == 0 else "male"
            changed = True
        if student.phone is None:
            student.phone = f"+233 24 {100 + index:03d} {2000 + (index * 37) % 7000:04d}"
            changed = True
        if student.email is None:
            local = f"{student.first_name}.{student.last_name}".lower().replace(" ", "")
            student.email = f"{local}.student@{school_slug}.school.example.com"
            changed = True
        if changed:
            profiles_filled += 1
    if profiles_filled:
        await session.commit()

    # ------------------------------------------- guardian portal accounts
    # Mother and father for every learner, each with a parent-portal login,
    # so Guardian Information, Send Message, and parent sign-in all work.
    guardians_created = 0
    linked_students = set(await session.scalars(
        select(StudentGuardian.student_id).where(StudentGuardian.school_id == school_id)))
    used_emails = set(await session.scalars(select(User.email)))
    for index, student in enumerate(students_all):
        if student.id in linked_students:
            continue
        for relation, given_name, is_primary in (
            ("Mother", DEMO_MOTHER_NAMES[index % len(DEMO_MOTHER_NAMES)], True),
            ("Father", DEMO_FATHER_NAMES[index % len(DEMO_FATHER_NAMES)], False),
        ):
            local = f"{given_name}.{student.last_name}".lower().replace(" ", "")
            email = f"{local}@{school_slug}.school.example.com"
            suffix = 2
            while email in used_emails:
                email = f"{local}{suffix}@{school_slug}.school.example.com"
                suffix += 1
            used_emails.add(email)
            user = User(
                email=email,
                display_name=f"{given_name} {student.last_name}",
                password_hash=hash_password(DEMO_PARENT_PASSWORD),
            )
            session.add(user)
            await session.flush()
            session.add(SchoolMembership(
                school_id=school_id, user_id=user.id, role=MembershipRole.PARENT))
            guardian = Guardian(
                school_id=school_id, user_id=user.id,
                first_name=given_name, last_name=student.last_name,
                relationship=relation, email=email,
                phone=f"+233 {'24' if is_primary else '20'} {100 + index:03d} "
                      f"{3000 + (index * 61 + (0 if is_primary else 7)) % 6000:04d}",
            )
            session.add(guardian)
            await session.flush()
            session.add(StudentGuardian(
                school_id=school_id, student_id=student.id,
                guardian_id=guardian.id, is_primary=is_primary,
            ))
            guardians_created += 1
    if guardians_created:
        await session.commit()

    # ------------------------------------ teachers and subject assignments
    # Give every class the full subject catalogue, adding demo teachers when
    # the school has too few to cover a clash-free timetable.
    teachers_created = 0
    teachers = list((await session.execute(
        select(SchoolMembership)
        .where(
            SchoolMembership.school_id == school_id,
            SchoolMembership.status == "active",
            SchoolMembership.role == MembershipRole.TEACHER,
        )
        .order_by(SchoolMembership.created_at, SchoolMembership.id)
    )).scalars())
    if len(teachers) < 4:
        for name in DEMO_EXTRA_TEACHERS:
            if len(teachers) >= 4:
                break
            local = name.lower().replace(" ", ".")
            email = f"{local}@{school_slug}.school.example.com"
            user = await session.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(
                    email=email, display_name=name,
                    password_hash=hash_password(DEMO_TEACHER_PASSWORD),
                )
                session.add(user)
                await session.flush()
            membership = await session.scalar(select(SchoolMembership).where(
                SchoolMembership.school_id == school_id,
                SchoolMembership.user_id == user.id,
            ))
            if membership is None:
                membership = SchoolMembership(
                    school_id=school_id, user_id=user.id, role=MembershipRole.TEACHER)
                session.add(membership)
                await session.flush()
                teachers_created += 1
            if membership.status == "active" and membership.role == MembershipRole.TEACHER:
                teachers.append(membership)
    if teachers_created:
        await session.commit()

    subjects = list((await session.execute(
        select(Subject)
        .where(Subject.school_id == school_id, Subject.status == "active")
        .order_by(Subject.code, Subject.name)
    )).scalars())
    subject_assignments_created = 0
    if subjects and teachers:
        for class_index, group in enumerate(groups):
            already = set(await session.scalars(
                select(ClassSubjectAssignment.subject_id).where(
                    ClassSubjectAssignment.school_id == school_id,
                    ClassSubjectAssignment.class_group_id == group.id,
                )))
            for subject_index, subject in enumerate(subjects):
                if subject.id in already:
                    continue
                teacher = teachers[(class_index + subject_index) % len(teachers)]
                session.add(ClassSubjectAssignment(
                    school_id=school_id, class_group_id=group.id,
                    subject_id=subject.id, teacher_membership_id=teacher.id,
                ))
                subject_assignments_created += 1
        if subject_assignments_created:
            await session.commit()

    # ------------------------------------------------------ class teachers
    # Every demo class gets a form teacher from the existing staff, so the
    # class-teacher views start populated. Idempotent: owned classes are kept.
    class_teachers_set = 0
    if teachers:
        for group_index, group in enumerate(groups):
            if group.class_teacher_membership_id is not None:
                continue
            teacher = teachers[group_index % len(teachers)]
            if teacher.status != "active" or teacher.role != MembershipRole.TEACHER:
                continue
            group.class_teacher_membership_id = teacher.id
            class_teachers_set += 1
        if class_teachers_set:
            await session.commit()

    # ------------------------------------------------------------ timetable
    # A full Monday–Friday week, five lessons a day, placed only where
    # neither the class nor the teacher is already busy — so the seeded week
    # never contradicts the conflict rules the timetable API enforces.
    timetable_created = 0
    if subjects and teachers:
        class_busy: dict[tuple, list[tuple[int, int]]] = {}
        teacher_busy: dict[tuple, list[tuple[int, int]]] = {}
        for slot in (await session.scalars(
                select(TimetableSlot).where(TimetableSlot.school_id == school_id))):
            slot_start = slot.starts_at.hour * 60 + slot.starts_at.minute
            slot_end = slot.ends_at.hour * 60 + slot.ends_at.minute
            class_busy.setdefault(
                (slot.class_group_id, slot.day_of_week), []).append((slot_start, slot_end))
            teacher_busy.setdefault(
                (slot.teacher_membership_id, slot.day_of_week), []).append((slot_start, slot_end))

        def overlaps(book: dict, day_key: tuple, start: int, end: int) -> bool:
            return any(start < other_end and other_start < end
                       for other_start, other_end in book.get(day_key, ()))

        for class_index, group in enumerate(groups):
            rows = (await session.execute(
                select(ClassSubjectAssignment.subject_id,
                       ClassSubjectAssignment.teacher_membership_id)
                .join(Subject, Subject.id == ClassSubjectAssignment.subject_id)
                .where(
                    ClassSubjectAssignment.school_id == school_id,
                    ClassSubjectAssignment.class_group_id == group.id,
                )
                .order_by(Subject.code)
            )).all()
            if not rows:
                continue
            for day in range(5):  # Monday .. Friday
                for period_index, (period_start, period_end) in enumerate(DEMO_PERIODS):
                    class_key = (group.id, day)
                    if overlaps(class_busy, class_key, period_start, period_end):
                        continue
                    offset = (class_index * 2 + day + period_index) % len(rows)
                    for step in range(len(rows)):
                        subject_id, teacher_id = rows[(offset + step) % len(rows)]
                        if overlaps(teacher_busy, (teacher_id, day), period_start, period_end):
                            continue
                        session.add(TimetableSlot(
                            school_id=school_id, academic_year_id=year.id,
                            class_group_id=group.id, subject_id=subject_id,
                            teacher_membership_id=teacher_id, day_of_week=day,
                            starts_at=time(period_start // 60, period_start % 60),
                            ends_at=time(period_end // 60, period_end % 60),
                            room=f"Room {class_index + 1}",
                        ))
                        class_busy.setdefault(class_key, []).append((period_start, period_end))
                        teacher_busy.setdefault(
                            (teacher_id, day), []).append((period_start, period_end))
                        timetable_created += 1
                        break
        if timetable_created:
            await session.commit()

    # ------------------------------------------------------ behaviour trail
    # Four dated notes per learner — merits, demerits, incidents, and staff
    # observations — so the Behaviour tab has substance on first open.
    behavior_created = 0
    actor_membership_id = await session.scalar(select(SchoolMembership.id).where(
        SchoolMembership.school_id == school_id,
        SchoolMembership.user_id == context.user_id,
        SchoolMembership.status == "active",
    ))
    if actor_membership_id:
        for index, student in enumerate(students_all):
            existing_note = await session.scalar(select(BehaviorRecord.id).where(
                BehaviorRecord.school_id == school_id,
                BehaviorRecord.student_id == student.id,
            ).limit(1))
            if existing_note:
                continue
            for entry_index in range(4):
                category, severity, title, description, action = DEMO_BEHAVIOR_ENTRIES[
                    (index * 4 + entry_index) % len(DEMO_BEHAVIOR_ENTRIES)]
                occurred_on = today - timedelta(days=3 + entry_index * 6 + index % 5)
                if occurred_on < year.starts_on:
                    occurred_on = max(year.starts_on, today - timedelta(days=60)) + timedelta(
                        days=(index + entry_index) % 7)
                if occurred_on > today:
                    occurred_on = today - timedelta(days=1)
                session.add(BehaviorRecord(
                    school_id=school_id, student_id=student.id,
                    occurred_on=occurred_on, category=category, severity=severity,
                    title=title, description=description, action_taken=action,
                    recorded_by_membership_id=actor_membership_id,
                ))
                behavior_created += 1
        if behavior_created:
            await session.commit()

    # ------------------------------------------------------------ staff tasks
    # Seed one realistic, school-scoped task board. The fixed sample titles
    # make this section idempotent without changing or duplicating real tasks.
    tasks_created = 0
    if actor_membership_id and teachers:
        sample_tasks = (
            ("Prepare next week's lesson plans", "Upload lesson plans for the upcoming week and share any resource needs with the office.", "open", "high", 4),
            ("Review outstanding attendance registers", "Check this term's class registers and follow up on any incomplete attendance submissions.", "open", "medium", 3),
            ("Complete student progress comments", "Add concise learning progress comments for students before the parent update is prepared.", "in_progress", "medium", 2),
            ("Organise classroom learning materials", "Confirm the materials needed for the next practical and return shared items after use.", "in_progress", "low", 5),
            ("Submit this week's assessment marks", "Enter and save marks for the latest class assessment in the gradebook.", "completed", "high", -1),
            ("Share the class timetable update", "Check the current timetable and let the class know about this week's lesson changes.", "completed", "low", -3),
        )
        for index, (title, description, task_status, priority, due_offset) in enumerate(sample_tasks):
            sample_title = f"[Demo] {title}"
            exists = await session.scalar(select(Task.id).where(
                Task.school_id == school_id,
                Task.title == sample_title,
            ))
            if exists:
                continue
            assignee = teachers[index % len(teachers)]
            completed_at = datetime.now(UTC) - timedelta(days=1) if task_status == "completed" else None
            session.add(Task(
                school_id=school_id,
                title=sample_title,
                description=description,
                status=task_status,
                priority=priority,
                due_on=today + timedelta(days=due_offset),
                assigned_to_membership_id=assignee.id,
                assigned_by_membership_id=actor_membership_id,
                completed_at=completed_at,
                completed_by_membership_id=assignee.id if completed_at else None,
            ))
            tasks_created += 1
        if tasks_created:
            await session.commit()

    # ------------------------------------------------------- document trail
    # Five core documents per learner so the Documents tab is never empty.
    documents_created = 0
    for student in students_all:
        existing_document = await session.scalar(select(StudentDocument.id).where(
            StudentDocument.school_id == school_id,
            StudentDocument.student_id == student.id,
        ).limit(1))
        if existing_document:
            continue
        for offset, (doc_type, title, prefix) in enumerate(DEMO_DOCUMENTS):
            session.add(StudentDocument(
                school_id=school_id, student_id=student.id,
                doc_type=doc_type, title=title,
                reference=f"{prefix}-{student.admission_number}",
                issued_on=today - timedelta(days=30 + offset * 45),
                notes="Filed by the school office",
                created_by_user_id=context.user_id,
            ))
            documents_created += 1
    if documents_created:
        await session.commit()

    # ------------------------------------------- prior year: results & fees
    # A finished school year behind the current one: mirrored classes,
    # enrolled learners, published results for every term, and invoices
    # settled in full — so Academic History and Fees & Payments show real
    # year-over-year rows instead of a single term.
    history_results_created = 0
    history_invoices_created = 0
    history_payments_created = 0
    shift = timedelta(days=365)
    history_name = f"{(year.starts_on - shift).year}/{(year.ends_on - shift).year}"
    history_exists = await session.scalar(select(AcademicYear.id).where(
        AcademicYear.school_id == school_id, AcademicYear.name == history_name))
    history_year_created = history_exists is None
    if history_year_created and actor_membership_id:
        history_year = AcademicYear(
            school_id=school_id, name=history_name,
            starts_on=year.starts_on - shift, ends_on=year.ends_on - shift,
            status="active",
        )
        session.add(history_year)
        await session.flush()

        current_terms = list(await session.scalars(
            select(AcademicTerm).where(
                AcademicTerm.school_id == school_id,
                AcademicTerm.academic_year_id == year.id,
            ).order_by(AcademicTerm.ordinal)
        ))
        history_terms: list[AcademicTerm] = []
        for source_term in current_terms:
            history_term = AcademicTerm(
                school_id=school_id, academic_year_id=history_year.id,
                name=source_term.name, ordinal=source_term.ordinal,
                starts_on=source_term.starts_on - shift,
                ends_on=source_term.ends_on - shift,
            )
            session.add(history_term)
            history_terms.append(history_term)
        await session.flush()

        mirror_of: dict[UUID, ClassGroup] = {}
        for group in groups:
            mirror = ClassGroup(
                school_id=school_id, academic_year_id=history_year.id,
                name=group.name, grade_level=group.grade_level, stream=group.stream,
            )
            session.add(mirror)
            await session.flush()
            mirror_of[group.id] = mirror

        for group in groups:
            for student_id in await class_roster(group.id):
                session.add(StudentEnrollment(
                    school_id=school_id, student_id=student_id,
                    academic_year_id=history_year.id,
                    class_group_id=mirror_of[group.id].id,
                    enrolled_on=history_year.starts_on + timedelta(days=1),
                    status="active",
                ))
        await session.commit()

        for class_index, group in enumerate(groups):
            mirror = mirror_of[group.id]
            roster = await class_roster(mirror.id)
            if not roster:
                continue
            for history_term in history_terms:
                # Score the whole class so positions stay consistent.
                scored = sorted((
                    (quantize(Decimal(58 + (
                        student_index * 7 + class_index * 5 + history_term.ordinal * 9
                    ) % 40)), student_id)
                    for student_index, student_id in enumerate(roster)
                ), key=lambda row: (-row[0], str(row[1])))
                for position, (percent, student_id) in enumerate(scored, start=1):
                    grade, points = grade_for(percent, bands)
                    session.add(TermResult(
                        school_id=school_id, academic_year_id=history_year.id,
                        term_id=history_term.id, class_group_id=mirror.id,
                        student_id=student_id, aggregate_percent=percent,
                        grade=grade, points=points,
                        position=position if scale.include_positions else None,
                    ))
                    history_results_created += 1
                existing_publication = await session.scalar(
                    select(ResultPublication.id).where(
                        ResultPublication.school_id == school_id,
                        ResultPublication.term_id == history_term.id,
                        ResultPublication.class_group_id == mirror.id,
                    ).limit(1))
                if existing_publication is None:
                    session.add(ResultPublication(
                        school_id=school_id, academic_year_id=history_year.id,
                        term_id=history_term.id, class_group_id=mirror.id,
                        status="published", grading_scale_id=scale.id,
                        published_by_membership_id=actor_membership_id,
                        published_at=datetime.now(UTC),
                    ))
        await session.commit()

        # Fee structures for the mirrored classes, then bill and settle them.
        history_category_ids: dict[str, UUID] = {}
        for name, _amount in DEMO_FEE_CATEGORIES:
            row = await session.scalar(select(FeeCategory).where(
                FeeCategory.school_id == school_id, FeeCategory.name == name))
            if row is None:
                row = FeeCategory(school_id=school_id, name=name)
                session.add(row)
                await session.flush()
            history_category_ids[name] = row.id

        for class_index, group in enumerate(groups):
            mirror = mirror_of[group.id]
            for history_term in history_terms:
                for name, amount in DEMO_FEE_CATEGORIES:
                    session.add(FeeStructure(
                        school_id=school_id,
                        fee_category_id=history_category_ids[name],
                        class_group_id=mirror.id,
                        academic_year_id=history_year.id,
                        term_id=history_term.id,
                        amount=quantize(amount + Decimal(class_index * 25)),
                    ))
        await session.commit()

        for group in groups:
            mirror = mirror_of[group.id]
            for history_term in history_terms:
                try:
                    outcome = await generate_invoices(
                        session, school_id, context.user_id, mirror.id, history_term.id)
                except FinanceError:
                    continue
                history_invoices_created += outcome["created"]

        # Backdate the issues so the ledger reads like a finished year.
        for history_term in history_terms:
            await session.execute(
                update(StudentInvoice)
                .where(
                    StudentInvoice.school_id == school_id,
                    StudentInvoice.academic_year_id == history_year.id,
                    StudentInvoice.term_id == history_term.id,
                )
                .values(issued_on=history_term.ends_on)
            )
        await session.commit()

        history_invoices = list((await session.scalars(
            select(StudentInvoice).where(
                StudentInvoice.school_id == school_id,
                StudentInvoice.academic_year_id == history_year.id,
                StudentInvoice.status.in_(("issued", "partially_paid")),
            ).order_by(StudentInvoice.issued_on, StudentInvoice.created_at, StudentInvoice.id)
        )))
        history_methods = ("mobile_money", "cash", "bank_transfer")
        for payment_index, invoice in enumerate(history_invoices):
            balance = invoice.total_amount - invoice.paid_amount
            if balance <= 0:
                continue
            try:
                await record_payment(
                    session, school_id, context.user_id, invoice.student_id,
                    amount=balance,
                    method=history_methods[payment_index % len(history_methods)],
                    payment_date=min(invoice.issued_on + timedelta(days=14), today),
                    reference=f"{DEMO_PAYMENT_PREFIX}H{payment_index + 1:03d}",
                    note="Demo payment",
                )
            except FinanceError:
                continue
            history_payments_created += 1
        await session.commit()

    total_created = (
        invoices_created + payments_created + attendance_records_created + results_created
        + profiles_filled + guardians_created + teachers_created
        + subject_assignments_created + class_teachers_set + timetable_created + behavior_created
        + documents_created + history_results_created + history_invoices_created
        + history_payments_created + calendar_events_created + (1 if history_year_created else 0)
        + tasks_created
    )
    if total_created:
        session.add(AuditEvent(
            school_id=school_id, actor_user_id=context.user_id,
            action="overview.demo_data_seeded", resource_type="school",
            resource_id=school_id,
        ))
        await session.commit()

    invoiced, paid = await money_totals()
    return DemoSeedResponse(
        invoices_created=invoices_created, payments_created=payments_created,
        attendance_records_created=attendance_records_created,
        results_created=results_created,
        profiles_filled=profiles_filled, guardians_created=guardians_created,
        teachers_created=teachers_created,
        subject_assignments_created=subject_assignments_created,
        class_teachers_set=class_teachers_set,
        timetable_created=timetable_created, behavior_created=behavior_created,
        documents_created=documents_created,
        history_year_created=history_year_created,
        history_results_created=history_results_created,
        history_invoices_created=history_invoices_created,
        history_payments_created=history_payments_created,
        calendar_events_created=calendar_events_created,
        tasks_created=tasks_created,
        invoiced_total=invoiced, paid_total=paid,
    )
