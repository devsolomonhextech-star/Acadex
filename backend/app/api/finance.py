"""Fee structures, invoice generation, invoices, payments, and finance summaries."""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain.finance import (
    FinanceError,
    PaymentOutcome,
    finance_summary,
    generate_invoices,
    quantize,
    record_payment,
)
from app.models import (
    AcademicTerm as Term,
)
from app.models import (
    AuditEvent,
    ClassGroup,
    FeeCategory,
    FeeStructure,
    InvoiceLineItem,
    MembershipRole,
    Payment,
    PaymentAllocation,
    Student,
    StudentEnrollment,
    StudentInvoice,
)

router = APIRouter(prefix="/api/v1/finance", tags=["finance"])

finance_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.FINANCE)
PAYMENT_METHODS = ("cash", "mobile_money", "bank_transfer", "card", "cheque", "other")


class FeeCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class FeeCategoryResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    name: str
    created_at: datetime


class FeeStructureCreate(BaseModel):
    fee_category_id: UUID
    class_group_id: UUID
    term_id: UUID
    amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class FeeStructureUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    status: Literal["active", "archived"] | None = None


class FeeStructureResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    fee_category_id: UUID
    category_name: str
    class_group_id: UUID
    class_name: str
    academic_year_id: UUID
    term_id: UUID
    term_name: str
    amount: Decimal
    status: str


class GenerateInvoicesRequest(BaseModel):
    class_group_id: UUID
    term_id: UUID


class GenerateInvoicesResponse(BaseModel):
    created: int
    skipped: int
    students: int
    fee_lines_per_invoice: int
    total_billed: Decimal


class InvoiceListResponse(BaseModel):
    items: list["InvoiceSummary"]
    page: int
    page_size: int
    total: int


class InvoiceSummary(BaseModel):
    id: UUID
    invoice_number: str
    student_id: UUID
    student_name: str
    admission_number: str
    class_name: str | None
    term_id: UUID
    term_name: str
    total_amount: Decimal
    paid_amount: Decimal
    balance: Decimal
    status: str
    issued_on: date


class InvoiceLineResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    description: str
    amount: Decimal
    fee_structure_id: UUID | None


class InvoiceAllocationResponse(BaseModel):
    id: UUID
    payment_id: UUID
    receipt_number: str
    payment_date: date
    method: str
    amount: Decimal


class InvoiceDetail(InvoiceSummary):
    academic_year_id: UUID
    lines: list[InvoiceLineResponse]
    allocations: list[InvoiceAllocationResponse]


class PaymentCreate(BaseModel):
    student_id: UUID
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    method: Literal["cash", "mobile_money", "bank_transfer", "card", "cheque", "other"]
    payment_date: date = Field(default_factory=date.today)
    reference: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=255)


class PaymentResponse(BaseModel):
    id: UUID
    receipt_number: str
    student_id: UUID
    student_name: str
    amount: Decimal
    method: str
    reference: str | None
    payment_date: date
    status: str
    note: str | None
    allocated_amount: Decimal
    unallocated_amount: Decimal
    created_at: date


class PaymentListResponse(BaseModel):
    items: list[PaymentResponse]
    page: int
    page_size: int
    total: int


class SummaryResponse(BaseModel):
    invoiced_total: Decimal
    paid_total: Decimal
    outstanding_total: Decimal
    open_invoice_count: int
    payments_total: Decimal
    credit_total: Decimal


def _conflict(detail: str, code: int = 409) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


async def _audit(session: AsyncSession, context: TenantContext, action: str, resource_type: str, resource_id: UUID) -> None:
    session.add(AuditEvent(
        school_id=context.school_id, actor_user_id=context.user_id,
        action=action, resource_type=resource_type, resource_id=resource_id,
    ))


@router.get("/fee-categories", response_model=list[FeeCategoryResponse])
async def list_fee_categories(
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    query = select(FeeCategory).where(FeeCategory.school_id == context.school_id).order_by(FeeCategory.name)
    return list((await session.scalars(query)).all())


@router.post("/fee-categories", response_model=FeeCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_fee_category(
    payload: FeeCategoryCreate,
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FeeCategory:
    row = FeeCategory(school_id=context.school_id, name=payload.name.strip())
    if not row.name:
        raise _conflict("Fee category name cannot be empty", 422)
    session.add(row)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise _conflict(f"A fee category named \"{row.name}\" already exists") from None
    await _audit(session, context, "finance.fee_category_created", "fee_category", row.id)
    await session.commit()
    return row


@router.get("/fee-structures", response_model=list[FeeStructureResponse])
async def list_fee_structures(
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    class_group_id: UUID | None = None,
    term_id: UUID | None = None,
    include_archived: bool = False,
):
    query = (
        select(FeeStructure, FeeCategory.name, ClassGroup.name, Term.name)
        .join(FeeCategory, FeeCategory.id == FeeStructure.fee_category_id)
        .join(ClassGroup, ClassGroup.id == FeeStructure.class_group_id)
        .join(Term, Term.id == FeeStructure.term_id)
        .where(FeeStructure.school_id == context.school_id)
    )
    if class_group_id is not None:
        query = query.where(FeeStructure.class_group_id == class_group_id)
    if term_id is not None:
        query = query.where(FeeStructure.term_id == term_id)
    if not include_archived:
        query = query.where(FeeStructure.status == "active")
    query = query.order_by(FeeStructure.created_at.desc(), FeeStructure.id)
    rows = (await session.execute(query)).all()
    return [
        FeeStructureResponse(
            id=structure.id,
            fee_category_id=structure.fee_category_id,
            category_name=category_name,
            class_group_id=structure.class_group_id,
            class_name=class_name,
            academic_year_id=structure.academic_year_id,
            term_id=structure.term_id,
            term_name=term_name,
            amount=structure.amount,
            status=structure.status,
        )
        for structure, category_name, class_name, term_name in rows
    ]


@router.post("/fee-structures", response_model=FeeStructureResponse, status_code=status.HTTP_201_CREATED)
async def create_fee_structure(
    payload: FeeStructureCreate,
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    category = await session.scalar(select(FeeCategory).where(
        FeeCategory.id == payload.fee_category_id, FeeCategory.school_id == context.school_id,
    ))
    if category is None:
        raise _conflict("Fee category not found", 404)
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == payload.class_group_id, ClassGroup.school_id == context.school_id,
    ))
    if group is None:
        raise _conflict("Class group not found", 404)
    term = await session.scalar(select(Term).where(
        Term.id == payload.term_id, Term.school_id == context.school_id,
    ))
    if term is None:
        raise _conflict("Academic term not found", 404)
    if term.academic_year_id != group.academic_year_id:
        raise _conflict("The term does not belong to the class group's academic year", 422)
    row = FeeStructure(
        school_id=context.school_id,
        fee_category_id=category.id,
        class_group_id=group.id,
        academic_year_id=group.academic_year_id,
        term_id=term.id,
        amount=payload.amount,
    )
    session.add(row)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise _conflict(
            "This fee is already defined for the class and term; edit the existing structure instead"
        ) from None
    await _audit(session, context, "finance.fee_structure_created", "fee_structure", row.id)
    await session.commit()
    return FeeStructureResponse(
        id=row.id,
        fee_category_id=category.id,
        category_name=category.name,
        class_group_id=group.id,
        class_name=group.name,
        academic_year_id=row.academic_year_id,
        term_id=term.id,
        term_name=term.name,
        amount=row.amount,
        status=row.status,
    )


@router.patch("/fee-structures/{structure_id}", response_model=FeeStructureResponse)
async def update_fee_structure(
    structure_id: UUID,
    payload: FeeStructureUpdate,
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    row = await session.scalar(select(FeeStructure).where(
        FeeStructure.id == structure_id, FeeStructure.school_id == context.school_id,
    ))
    if row is None:
        raise _conflict("Fee structure not found", 404)
    if payload.amount is not None:
        row.amount = payload.amount
    if payload.status is not None:
        row.status = payload.status
    await _audit(session, context, "finance.fee_structure_updated", "fee_structure", row.id)
    await session.commit()
    listed = await list_fee_structures(context=context, session=session, class_group_id=row.class_group_id, include_archived=True)
    return next(item for item in listed if item.id == row.id)


@router.post(
    "/invoices/generate", response_model=GenerateInvoicesResponse, status_code=status.HTTP_201_CREATED
)
async def generate_class_invoices(
    payload: GenerateInvoicesRequest,
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> GenerateInvoicesResponse:
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == payload.class_group_id, ClassGroup.school_id == context.school_id,
    ))
    if group is None:
        raise _conflict("Class group not found", 404)
    term = await session.scalar(select(Term).where(
        Term.id == payload.term_id, Term.school_id == context.school_id,
    ))
    if term is None:
        raise _conflict("Academic term not found", 404)
    if term.academic_year_id != group.academic_year_id:
        raise _conflict("The term does not belong to the class group's academic year", 422)
    try:
        result = await generate_invoices(
            session, context.school_id, context.user_id, group.id, term.id
        )
    except FinanceError as error:
        raise _conflict(str(error), error.status_code) from None
    return GenerateInvoicesResponse(**result)


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    term_id: UUID | None = None,
    invoice_status: Literal["issued", "partially_paid", "paid", "void"] | None = Query(
        default=None, alias="status"
    ),
    search: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
):
    student_join = (
        select(
            StudentInvoice,
            Student.first_name,
            Student.last_name,
            Student.admission_number,
            ClassGroup.name.label("class_name"),
            Term.name.label("term_name"),
        )
        .join(Student, Student.id == StudentInvoice.student_id)
        .outerjoin(
            StudentEnrollment,
            (StudentEnrollment.student_id == StudentInvoice.student_id)
            & (StudentEnrollment.academic_year_id == StudentInvoice.academic_year_id)
            & (StudentEnrollment.school_id == StudentInvoice.school_id),
        )
        .outerjoin(ClassGroup, ClassGroup.id == StudentEnrollment.class_group_id)
        .join(Term, Term.id == StudentInvoice.term_id)
        .where(StudentInvoice.school_id == context.school_id)
    )
    if term_id is not None:
        student_join = student_join.where(StudentInvoice.term_id == term_id)
    if invoice_status is not None:
        student_join = student_join.where(StudentInvoice.status == invoice_status)
    if search.strip():
        needle = f"%{search.strip()}%"
        student_join = student_join.where(
            or_(
                Student.first_name.ilike(needle),
                Student.last_name.ilike(needle),
                Student.admission_number.ilike(needle),
                StudentInvoice.invoice_number.ilike(needle),
            )
        )
    total = (
        await session.execute(
            select(func.count()).select_from(student_join.subquery())
        )
    ).scalar_one()
    rows = (
        await session.execute(
            student_join.order_by(StudentInvoice.issued_on.desc(), StudentInvoice.invoice_number)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        InvoiceSummary(
            id=invoice.id,
            invoice_number=invoice.invoice_number,
            student_id=invoice.student_id,
            student_name=f"{first_name} {last_name}",
            admission_number=admission_number,
            class_name=class_name,
            term_id=invoice.term_id,
            term_name=term_name,
            total_amount=invoice.total_amount,
            paid_amount=invoice.paid_amount,
            balance=quantize(invoice.total_amount - invoice.paid_amount),
            status=invoice.status,
            issued_on=invoice.issued_on,
        )
        for invoice, first_name, last_name, admission_number, class_name, term_name in rows
    ]
    return InvoiceListResponse(items=items, page=page, page_size=page_size, total=total)


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetail)
async def invoice_detail(
    invoice_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    row = (
        await session.execute(
            select(StudentInvoice, Student.first_name, Student.last_name, Student.admission_number, Term.name)
            .join(Student, Student.id == StudentInvoice.student_id)
            .join(Term, Term.id == StudentInvoice.term_id)
            .where(
                StudentInvoice.id == invoice_id,
                StudentInvoice.school_id == context.school_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise _conflict("Invoice not found", 404)
    invoice, first_name, last_name, admission_number, term_name = row
    lines = list((await session.scalars(
        select(InvoiceLineItem)
        .where(InvoiceLineItem.invoice_id == invoice.id)
        .order_by(InvoiceLineItem.created_at, InvoiceLineItem.id)
    )).all())
    allocation_rows = (
        await session.execute(
            select(PaymentAllocation, Payment.receipt_number, Payment.payment_date, Payment.method)
            .join(Payment, Payment.id == PaymentAllocation.payment_id)
            .where(PaymentAllocation.invoice_id == invoice.id)
            .order_by(Payment.payment_date, Payment.created_at)
        )
    ).all()
    class_name = await session.scalar(
        select(ClassGroup.name)
        .join(StudentEnrollment, StudentEnrollment.class_group_id == ClassGroup.id)
        .where(
            StudentEnrollment.school_id == context.school_id,
            StudentEnrollment.student_id == invoice.student_id,
            StudentEnrollment.academic_year_id == invoice.academic_year_id,
        )
        .limit(1)
    )
    return InvoiceDetail(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        student_id=invoice.student_id,
        student_name=f"{first_name} {last_name}",
        admission_number=admission_number,
        class_name=class_name,
        term_id=invoice.term_id,
        term_name=term_name,
        total_amount=invoice.total_amount,
        paid_amount=invoice.paid_amount,
        balance=quantize(invoice.total_amount - invoice.paid_amount),
        status=invoice.status,
        issued_on=invoice.issued_on,
        academic_year_id=invoice.academic_year_id,
        lines=[
            InvoiceLineResponse(
                id=line.id, description=line.description, amount=line.amount,
                fee_structure_id=line.fee_structure_id,
            )
            for line in lines
        ],
        allocations=[
            InvoiceAllocationResponse(
                id=allocation.id,
                payment_id=allocation.payment_id,
                receipt_number=receipt_number,
                payment_date=payment_date,
                method=method,
                amount=allocation.amount,
            )
            for allocation, receipt_number, payment_date, method in allocation_rows
        ],
    )


@router.post("/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    payload: PaymentCreate,
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PaymentResponse:
    if payload.payment_date > date.today():
        raise _conflict("Payment date cannot be in the future", 422)
    student = await session.scalar(select(Student).where(
        Student.id == payload.student_id, Student.school_id == context.school_id,
    ))
    if student is None:
        raise _conflict("Student not found", 404)
    try:
        outcome: PaymentOutcome = await record_payment(
            session,
            context.school_id,
            context.user_id,
            student.id,
            payload.amount,
            payload.method,
            payload.payment_date,
            payload.reference.strip() if payload.reference else None,
            payload.note.strip() if payload.note else None,
        )
    except FinanceError as error:
        raise _conflict(str(error), error.status_code) from None
    return PaymentResponse(
        id=outcome.payment.id,
        receipt_number=outcome.payment.receipt_number,
        student_id=student.id,
        student_name=f"{student.first_name} {student.last_name}",
        amount=outcome.payment.amount,
        method=outcome.payment.method,
        reference=outcome.payment.reference,
        payment_date=outcome.payment.payment_date,
        status=outcome.payment.status,
        note=outcome.payment.note,
        allocated_amount=outcome.allocated,
        unallocated_amount=outcome.unallocated,
        created_at=outcome.payment.created_at.date() if outcome.payment.created_at else date.today(),
    )


@router.get("/payments", response_model=PaymentListResponse)
async def list_payments(
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    student_id: UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
):
    filters = [Payment.school_id == context.school_id]
    if student_id is not None:
        filters.append(Payment.student_id == student_id)
    query = (
        select(Payment, Student.first_name, Student.last_name, func.coalesce(func.sum(PaymentAllocation.amount), Decimal(0)))
        .join(Student, Student.id == Payment.student_id)
        .outerjoin(PaymentAllocation, PaymentAllocation.payment_id == Payment.id)
        .where(*filters)
        .group_by(Payment.id, Student.first_name, Student.last_name)
    )
    total = (
        await session.execute(
            select(func.count()).select_from(Payment).where(*filters)
        )
    ).scalar_one()
    rows = (
        await session.execute(
            query.order_by(Payment.payment_date.desc(), Payment.created_at.desc(), Payment.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        PaymentResponse(
            id=payment.id,
            receipt_number=payment.receipt_number,
            student_id=payment.student_id,
            student_name=f"{first_name} {last_name}",
            amount=payment.amount,
            method=payment.method,
            reference=payment.reference,
            payment_date=payment.payment_date,
            status=payment.status,
            note=payment.note,
            allocated_amount=quantize(allocated),
            unallocated_amount=quantize(payment.amount - allocated),
            created_at=payment.created_at.date() if payment.created_at else payment.payment_date,
        )
        for payment, first_name, last_name, allocated in rows
    ]
    return PaymentListResponse(items=items, page=page, page_size=page_size, total=total)


@router.get("/summary", response_model=SummaryResponse)
async def finance_summary_endpoint(
    context: Annotated[TenantContext, Depends(require_roles(*finance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    term_id: UUID | None = None,
) -> SummaryResponse:
    if term_id is not None:
        owned = await session.scalar(select(Term.id).where(
            Term.id == term_id, Term.school_id == context.school_id,
        ))
        if owned is None:
            raise _conflict("Academic term not found", 404)
    return SummaryResponse(**await finance_summary(session, context.school_id, term_id))
