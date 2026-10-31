"""Fee-driven invoice generation and decimal-safe payment allocation.

All money arithmetic is Decimal, quantized half-up to two places. Invoice
totals are historical snapshots: payments allocate oldest-invoice-first, never
exceed an invoice balance, and an overpayment stays as unallocated credit on
the student's account. Numbering (INV-/RCT-) uses count-based sequences with
the unique constraints as the race backstop and bounded retries on conflict.
"""
from dataclasses import dataclass
from collections.abc import Sequence
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AuditEvent,
    FeeCategory,
    FeeStructure,
    InvoiceLineItem,
    Notification,
    Payment,
    PaymentAllocation,
    PaymentRefund,
    PaymentRefundAllocation,
    Student,
    StudentEnrollment,
    StudentInvoice,
)

MONEY = Decimal("0.01")
ZERO = Decimal(0)


class FinanceError(Exception):
    """Business-rule violation in a finance operation; carries the HTTP status the API should use."""

    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


def quantize(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


@dataclass
class PaymentOutcome:
    payment: Payment
    allocated: Decimal
    unallocated: Decimal
    invoices_paid: int


async def _next_sequence(session: AsyncSession, school_id: UUID, model) -> int:
    count = await session.scalar(
        select(func.count()).select_from(model).where(model.school_id == school_id)
    )
    return (count or 0) + 1


async def generate_invoices(
    session: AsyncSession,
    school_id: UUID,
    actor_id: UUID,
    class_group_id: UUID,
    term_id: UUID,
) -> dict:
    """Create one invoice per actively enrolled student from active fee structures.

    Students who already have an invoice for this term are skipped, so a repeat
    run never double-bills. Invoice numbers come from a count-based sequence;
    a numbering race rolls back and retries before failing cleanly.
    """
    structures = (
        await session.execute(
            select(FeeStructure, FeeCategory.name)
            .join(FeeCategory, FeeCategory.id == FeeStructure.fee_category_id)
            .where(
                FeeStructure.school_id == school_id,
                FeeStructure.class_group_id == class_group_id,
                FeeStructure.term_id == term_id,
                FeeStructure.status == "active",
            )
            .order_by(FeeStructure.created_at, FeeStructure.id)
        )
    ).all()
    if not structures:
        raise FinanceError(
            "This class has no active fee structures for the selected term", 422
        )

    students = (
        await session.execute(
            select(StudentEnrollment.student_id, Student.admission_number)
            .join(Student, Student.id == StudentEnrollment.student_id)
            .where(
                StudentEnrollment.school_id == school_id,
                StudentEnrollment.class_group_id == class_group_id,
                StudentEnrollment.status == "active",
                Student.status == "active",
            )
            .order_by(Student.admission_number, Student.id)
        )
    ).all()
    if not students:
        raise FinanceError("This class has no actively enrolled students to bill", 422)

    already_billed = set(
        await session.scalars(
            select(StudentInvoice.student_id).where(
                StudentInvoice.school_id == school_id,
                StudentInvoice.term_id == term_id,
                StudentInvoice.student_id.in_([row.student_id for row in students]),
            )
        )
    )
    to_bill = [row for row in students if row.student_id not in already_billed]

    created = 0
    total_billed = ZERO
    for _attempt in range(3):
        try:
            start = await _next_sequence(session, school_id, StudentInvoice)
            created = 0
            total_billed = ZERO
            invoice_total = quantize(sum(
                (quantize(structure.amount) for structure, _ in structures), ZERO
            ))
            for offset, row in enumerate(to_bill):
                invoice = StudentInvoice(
                    school_id=school_id,
                    student_id=row.student_id,
                    academic_year_id=structures[0][0].academic_year_id,
                    term_id=term_id,
                    invoice_number=f"INV-{start + offset:06d}",
                    total_amount=invoice_total,
                )
                session.add(invoice)
                await session.flush()
                for structure, category_name in structures:
                    session.add(
                        InvoiceLineItem(
                            school_id=school_id,
                            invoice_id=invoice.id,
                            fee_structure_id=structure.id,
                            fee_category_id=structure.fee_category_id,
                            description=category_name,
                            amount=quantize(structure.amount),
                        )
                    )
                total_billed = quantize(total_billed + invoice_total)
                created += 1
            await session.flush()
            break
        except IntegrityError:
            await session.rollback()
    else:
        raise FinanceError("Invoice numbering conflict; please retry")

    session.add(
        AuditEvent(
            school_id=school_id,
            actor_user_id=actor_id,
            action="finance.invoices_generated",
            resource_type="student_invoice",
            resource_id=class_group_id,
            details={"created_count": created, "skipped_count": len(students) - created,
                     "total_amount": str(total_billed), "term_id": str(term_id)},
        )
    )
    await session.commit()
    return {
        "created": created,
        "skipped": len(students) - created,
        "students": len(students),
        "fee_lines_per_invoice": len(structures),
        "total_billed": total_billed,
    }


async def record_payment(
    session: AsyncSession,
    school_id: UUID,
    actor_id: UUID,
    student_id: UUID,
    amount: Decimal,
    method: str,
    payment_date: date,
    reference: str | None,
    note: str | None,
    parent_user_ids: Sequence[UUID] = (),
    student_name: str | None = None,
) -> PaymentOutcome:
    """Record a payment and allocate it to the student's open invoices, oldest first.

    The payment, its allocations, and every invoice balance/status update commit
    together; any unique-constraint race rolls the whole thing back.
    """
    amount = quantize(amount)
    if amount <= ZERO:
        raise FinanceError("Payment amount must be greater than zero")
    if reference:
        existing = await session.scalar(
            select(Payment.id).where(
                Payment.school_id == school_id, Payment.reference == reference
            )
        )
        if existing:
            raise FinanceError(
                f"A payment with reference \"{reference}\" has already been recorded"
            )

    open_invoices = (
        await session.scalars(
            select(StudentInvoice)
            .where(
                StudentInvoice.school_id == school_id,
                StudentInvoice.student_id == student_id,
                StudentInvoice.status.in_(("issued", "partially_paid")),
            )
            .order_by(StudentInvoice.issued_on, StudentInvoice.created_at, StudentInvoice.id)
        )
    ).all()

    for _attempt in range(3):
        try:
            receipt = f"RCT-{await _next_sequence(session, school_id, Payment):06d}"
            payment = Payment(
                school_id=school_id,
                student_id=student_id,
                recorded_by_user_id=actor_id,
                amount=amount,
                method=method,
                reference=reference,
                receipt_number=receipt,
                payment_date=payment_date,
                note=note,
            )
            session.add(payment)
            await session.flush()

            remaining = amount
            allocated = ZERO
            invoices_paid = 0
            for invoice in open_invoices:
                if remaining <= ZERO:
                    break
                balance = quantize(invoice.total_amount - invoice.paid_amount)
                if balance <= ZERO:
                    continue
                portion = min(balance, remaining)
                session.add(
                    PaymentAllocation(
                        school_id=school_id,
                        payment_id=payment.id,
                        invoice_id=invoice.id,
                        amount=portion,
                    )
                )
                invoice.paid_amount = quantize(invoice.paid_amount + portion)
                invoice.status = (
                    "paid" if invoice.paid_amount >= invoice.total_amount else "partially_paid"
                )
                remaining = quantize(remaining - portion)
                allocated = quantize(allocated + portion)
                invoices_paid += 1
            await session.flush()
            session.add(
                AuditEvent(
                    school_id=school_id,
                    actor_user_id=actor_id,
                    action="finance.payment_recorded",
                    resource_type="payment",
                    resource_id=payment.id,
                    details={"receipt_number": payment.receipt_number, "amount": str(amount),
                             "method": method, "payment_date": payment_date.isoformat(),
                             "allocated_amount": str(allocated), "unallocated_amount": str(amount - allocated),
                             "invoices_paid": invoices_paid},
                )
            )
            for parent_user_id in dict.fromkeys(parent_user_ids):
                session.add(Notification(
                    school_id=school_id,
                    user_id=parent_user_id,
                    title="Fee payment recorded",
                    body=f"A fee payment of GHS {amount:.2f} was recorded for {student_name or 'your child'} (receipt {payment.receipt_number}).",
                    type="fee_payment",
                    link="/fees",
                ))
            await session.commit()
            return PaymentOutcome(
                payment=payment,
                allocated=quantize(allocated),
                unallocated=quantize(amount - allocated),
                invoices_paid=invoices_paid,
            )
        except IntegrityError as error:
            await session.rollback()
            if "reference" in str(error.orig).lower() and reference:
                raise FinanceError(
                    f"A payment with reference \"{reference}\" has already been recorded"
                ) from None
    raise FinanceError("Receipt numbering conflict; please retry")


async def finance_summary(
    session: AsyncSession, school_id: UUID, term_id: UUID | None = None
) -> dict:
    """Term- or school-wide totals: invoiced, paid, outstanding, and held credit."""
    invoice_filters = [StudentInvoice.school_id == school_id]
    if term_id is not None:
        invoice_filters.append(StudentInvoice.term_id == term_id)
    invoiced, paid, open_count = (
        await session.execute(
            select(
                func.coalesce(func.sum(StudentInvoice.total_amount), ZERO),
                func.coalesce(func.sum(StudentInvoice.paid_amount), ZERO),
                func.count()
                .filter(StudentInvoice.status.in_(("issued", "partially_paid"))),
            ).where(*invoice_filters)
        )
    ).one()
    payments_total = await session.scalar(
        select(func.coalesce(func.sum(Payment.amount), ZERO)).where(
            Payment.school_id == school_id,
            Payment.status == "recorded",
        )
    )
    refund_total = await session.scalar(
        select(func.coalesce(func.sum(PaymentRefund.amount), ZERO)).where(
            PaymentRefund.school_id == school_id,
        )
    )
    allocated_total = await session.scalar(
        select(func.coalesce(func.sum(PaymentAllocation.amount), ZERO)).where(
            PaymentAllocation.school_id == school_id
        )
    )
    refunded_allocations_total = await session.scalar(
        select(func.coalesce(func.sum(PaymentRefundAllocation.amount), ZERO)).where(
            PaymentRefundAllocation.school_id == school_id
        )
    )
    invoiced, paid = quantize(invoiced), quantize(paid)
    payments_total = quantize(payments_total - refund_total)
    allocated_total = quantize(allocated_total - refunded_allocations_total)
    return {
        "invoiced_total": invoiced,
        "paid_total": paid,
        "outstanding_total": quantize(invoiced - paid),
        "open_invoice_count": int(open_count),
        "payments_total": payments_total,
        "credit_total": quantize(payments_total - allocated_total),
    }
