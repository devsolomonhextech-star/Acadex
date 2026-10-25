"""One-click demo data for a freshly set-up school.

Three independent sections — billing, attendance, and term results — each
skipping whatever already exists, so repeated clicks only fill in what is
still missing and real records are never overwritten.
"""
from datetime import UTC, date, datetime, timedelta
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
from app.models import (
    AcademicTerm,
    AcademicYear,
    AttendanceRecord,
    AttendanceSession,
    AuditEvent,
    ClassGroup,
    FeeCategory,
    FeeStructure,
    GradingBand,
    GradingScale,
    MembershipRole,
    Payment,
    SchoolMembership,
    Student,
    StudentEnrollment,
    StudentInvoice,
    TermResult,
)

router = APIRouter(prefix="/api/v1/overview", tags=["overview"])

DEMO_PAYMENT_PREFIX = "DEMO-"
# Issue demo invoices three weeks back so partial ones read as overdue and
# the attention panel gets a genuine finance follow-up.
DEMO_INVOICE_AGE_DAYS = 21
DEMO_FEE_CATEGORIES = (("Tuition", Decimal("450.00")), ("Feeding", Decimal("150.00")))
DEMO_ATTENDANCE_WINDOW_DAYS = 30
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


class DemoSeedResponse(BaseModel):
    invoices_created: int
    payments_created: int
    attendance_records_created: int
    results_created: int
    invoiced_total: Decimal
    paid_total: Decimal


@router.post("/demo/seed", response_model=DemoSeedResponse)
async def seed_demo_data(
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DemoSeedResponse:
    """Seed billing, attendance, and term results; each section idempotent.

    Fees are guarded by their ``DEMO-`` payment references, attendance skips
    class-dates that already have a sheet, and results skip students who
    already have a row — so a double click changes nothing, while a partial
    earlier run is simply completed.
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

    total_created = invoices_created + payments_created + attendance_records_created + results_created
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
        invoiced_total=invoiced, paid_total=paid,
    )
