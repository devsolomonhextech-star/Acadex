"""Weighted term totals, result preview, publication, and printable report cards."""
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain.results import (
    PublicationError,
    active_default_scale,
    build_student_totals,
    compute_subject_totals,
    load_bands,
    missing_assessment_scores,
    replace_computed_results,
    require_computable,
    subject_names,
)
from app.models import (
    AcademicTerm,
    AcademicYear,
    AuditEvent,
    ClassGroup,
    ClassSubjectAssignment,
    GradingScale,
    MembershipRole,
    ResultPublication,
    School,
    SchoolMembership,
    Student,
    StudentEnrollment,
    Subject,
    TermResult,
    TermSubjectResult,
    User,
)

router = APIRouter(prefix="/api/v1/results", tags=["results"])
read_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR, MembershipRole.TEACHER)
compute_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR)
publish_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL)


class PublicationState(BaseModel):
    status: str
    published_at: datetime | None
    withdrawn_at: datetime | None


class SubjectResultRow(BaseModel):
    subject_id: UUID
    subject_name: str
    subject_code: str
    weighted_total: Decimal
    grade: str | None
    points: Decimal | None
    assessment_count: int
    total_weight: Decimal


class StudentResultRow(BaseModel):
    student_id: UUID
    admission_number: str
    first_name: str
    last_name: str
    subjects: list[SubjectResultRow]
    aggregate_percent: Decimal | None
    grade: str | None
    points: Decimal | None
    position: int | None


class ClassResultsResponse(BaseModel):
    class_group_id: UUID
    class_name: str
    term_id: UUID
    term_name: str
    academic_year_id: UUID
    publication: PublicationState
    grading_scale_name: str | None
    students: list[StudentResultRow]


class ComputeRequest(BaseModel):
    class_group_id: UUID
    term_id: UUID


class PublishRequest(BaseModel):
    class_group_id: UUID
    term_id: UUID
    confirm_class_name: str


async def _membership_id(session: AsyncSession, context: TenantContext) -> UUID:
    membership_id = await session.scalar(select(SchoolMembership.id).where(
        SchoolMembership.school_id == context.school_id,
        SchoolMembership.user_id == context.user_id,
        SchoolMembership.status == "active",
    ))
    if membership_id is None:
        raise HTTPException(status_code=403, detail="Active school membership required")
    return membership_id


async def _resolve_class_term(
    session: AsyncSession, context: TenantContext, class_group_id: UUID, term_id: UUID,
) -> tuple[ClassGroup, AcademicTerm]:
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == class_group_id, ClassGroup.school_id == context.school_id,
    ))
    term = await session.scalar(select(AcademicTerm).where(
        AcademicTerm.id == term_id, AcademicTerm.school_id == context.school_id,
    ))
    if group is None or term is None or term.academic_year_id != group.academic_year_id:
        raise HTTPException(status_code=404, detail="Class or term not found for the same academic year")
    return group, term


async def _publication_state(
    session: AsyncSession, school_id: UUID, term_id: UUID, class_group_id: UUID, *, lock: bool = False,
) -> tuple[ResultPublication | None, str]:
    query = select(ResultPublication).where(
        ResultPublication.school_id == school_id,
        ResultPublication.term_id == term_id,
        ResultPublication.class_group_id == class_group_id,
    )
    if lock:
        query = query.with_for_update()
    publication = await session.scalar(query)
    if publication is None:
        return None, "draft"
    return publication, publication.status


async def _build_response(
    session: AsyncSession,
    context: TenantContext,
    group: ClassGroup,
    term: AcademicTerm,
) -> ClassResultsResponse:
    publication = await session.scalar(select(ResultPublication).where(
        ResultPublication.school_id == context.school_id,
        ResultPublication.term_id == term.id,
        ResultPublication.class_group_id == group.id,
    ))
    scale = await active_default_scale(session, context.school_id)
    names = await subject_names(session, context.school_id)
    subject_rows = await session.execute(select(TermSubjectResult).where(
        TermSubjectResult.school_id == context.school_id,
        TermSubjectResult.term_id == term.id,
        TermSubjectResult.class_group_id == group.id,
    ))
    by_student: dict[UUID, list[SubjectResultRow]] = {}
    for row in subject_rows.scalars():
        name, code = names.get(row.subject_id, ("Unknown subject", ""))
        by_student.setdefault(row.student_id, []).append(SubjectResultRow(
            subject_id=row.subject_id, subject_name=name, subject_code=code,
            weighted_total=row.weighted_total, grade=row.grade, points=row.points,
            assessment_count=row.assessment_count, total_weight=row.total_weight,
        ))
    term_rows = await session.execute(select(TermResult, Student).select_from(TermResult).join(
        Student, (Student.id == TermResult.student_id) & (Student.school_id == TermResult.school_id),
    ).where(
        TermResult.school_id == context.school_id,
        TermResult.term_id == term.id,
        TermResult.class_group_id == group.id,
    ).order_by(TermResult.position.asc().nulls_last(), Student.last_name, Student.first_name))
    students = [StudentResultRow(
        student_id=student.id, admission_number=student.admission_number,
        first_name=student.first_name, last_name=student.last_name,
        subjects=sorted(by_student.get(student.id, []), key=lambda row: row.subject_name),
        aggregate_percent=result.aggregate_percent, grade=result.grade,
        points=result.points, position=result.position,
    ) for result, student in term_rows.all()]
    return ClassResultsResponse(
        class_group_id=group.id, class_name=group.name, term_id=term.id, term_name=term.name,
        academic_year_id=group.academic_year_id,
        publication=PublicationState(
            status=publication.status if publication else "draft",
            published_at=publication.published_at if publication else None,
            withdrawn_at=publication.withdrawn_at if publication else None,
        ),
        grading_scale_name=scale.name if scale else None,
        students=students,
    )


async def _compute(
    session: AsyncSession, context: TenantContext, group: ClassGroup, term: AcademicTerm,
) -> None:
    """Recompute and persist weighted totals; raises on locked or ungraded state."""
    await require_computable(session, context.school_id, term.id, group.id)
    scale = await active_default_scale(session, context.school_id)
    if scale is None:
        raise HTTPException(
            status_code=422,
            detail="Set an active default grading scale before computing results",
        )
    bands = await load_bands(session, context.school_id, scale.id)
    subject_totals, subject_weights = await compute_subject_totals(
        session, context.school_id, group.id, group.academic_year_id, term.id, bands,
    )
    if not subject_totals:
        raise HTTPException(
            status_code=422,
            detail="No approved assessments with complete scores exist for this class and term",
        )
    student_totals = build_student_totals(subject_totals, subject_weights, bands, scale.include_positions)
    await replace_computed_results(
        session, context.school_id, group.academic_year_id, term.id, group.id,
        subject_totals, student_totals,
    )


@router.post("/compute", response_model=ClassResultsResponse)
async def compute_results(
    payload: ComputeRequest,
    context: Annotated[TenantContext, Depends(require_roles(*compute_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    group, term = await _resolve_class_term(session, context, payload.class_group_id, payload.term_id)
    try:
        await _compute(session, context, group, term)
    except PublicationError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from None
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="results.computed", resource_type="class_group", resource_id=group.id))
    await session.commit()
    return await _build_response(session, context, group, term)


@router.get("/class", response_model=ClassResultsResponse)
async def get_class_results(
    class_group_id: UUID,
    term_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*read_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    if context.role == MembershipRole.TEACHER:
        member_id = await _membership_id(session, context)
        assigned = await session.scalar(select(ClassSubjectAssignment.id).where(
            ClassSubjectAssignment.school_id == context.school_id,
            ClassSubjectAssignment.teacher_membership_id == member_id,
            ClassSubjectAssignment.class_group_id == class_group_id,
        ).limit(1))
        if assigned is None:
            raise HTTPException(status_code=403, detail="You are not assigned to this class")
    group, term = await _resolve_class_term(session, context, class_group_id, term_id)
    return await _build_response(session, context, group, term)


@router.post("/publish", response_model=ClassResultsResponse)
async def publish_results(
    payload: PublishRequest,
    context: Annotated[TenantContext, Depends(require_roles(*publish_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    group, term = await _resolve_class_term(session, context, payload.class_group_id, payload.term_id)
    if payload.confirm_class_name.strip() != group.name:
        raise HTTPException(
            status_code=422,
            detail=f"Type the class name exactly ({group.name}) to confirm publication",
        )
    publication, publication_status = await _publication_state(
        session, context.school_id, term.id, group.id, lock=True,
)
    if publication_status == "published":
        raise HTTPException(status_code=409, detail="Results for this class and term are already published")
    missing = await missing_assessment_scores(session, context.school_id, group.id, group.academic_year_id, term.id)
    if missing:
        raise HTTPException(
            status_code=422,
            detail="Approved assessments are still missing scores: " + ", ".join(sorted(missing)),
        )
    try:
        await _compute(session, context, group, term)
    except PublicationError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from None
    scale = await active_default_scale(session, context.school_id)
    member_id = await _membership_id(session, context)
    now = datetime.now(UTC)
    if publication is None:
        publication = ResultPublication(
            school_id=context.school_id, academic_year_id=group.academic_year_id,
            term_id=term.id, class_group_id=group.id,
        )
        session.add(publication)
    publication.status = "published"
    publication.grading_scale_id = scale.id if scale else None
    publication.published_by_membership_id = member_id
    publication.published_at = now
    publication.withdrawn_by_membership_id = None
    publication.withdrawn_at = None
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="results.published", resource_type="class_group", resource_id=group.id))
    await session.commit()
    return await _build_response(session, context, group, term)


@router.post("/withdraw", response_model=ClassResultsResponse)
async def withdraw_results(
    payload: ComputeRequest,
    context: Annotated[TenantContext, Depends(require_roles(*publish_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    group, term = await _resolve_class_term(session, context, payload.class_group_id, payload.term_id)
    publication, publication_status = await _publication_state(
        session, context.school_id, term.id, group.id, lock=True,
)
    if publication is None or publication_status != "published":
        raise HTTPException(status_code=409, detail="Results for this class and term are not published")
    member_id = await _membership_id(session, context)
    publication.status = "withdrawn"
    publication.withdrawn_by_membership_id = member_id
    publication.withdrawn_at = datetime.now(UTC)
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="results.withdrawn", resource_type="class_group", resource_id=group.id))
    await session.commit()
    return await _build_response(session, context, group, term)


class ReportCardSubject(BaseModel):
    subject_id: UUID
    subject_name: str
    subject_code: str
    weighted_total: Decimal
    grade: str | None
    points: Decimal | None
    assessment_count: int
    total_weight: Decimal


class ReportCardResponse(BaseModel):
    school_name: str
    academic_year_id: UUID
    academic_year_name: str
    term_id: UUID
    term_name: str
    term_starts_on: date
    term_ends_on: date
    class_group_id: UUID
    class_name: str
    class_stream: str
    student_id: UUID
    admission_number: str
    first_name: str
    last_name: str
    subjects: list[ReportCardSubject]
    aggregate_percent: Decimal
    aggregate_grade: str | None
    aggregate_points: Decimal | None
    position: int | None
    class_size: int
    grading_scale_name: str | None
    published_at: datetime | None
    published_by: str | None


@router.get("/report-card", response_model=ReportCardResponse)
async def get_report_card(
    student_id: UUID,
    term_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*read_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """A printable report card, served only from published results."""
    term = await session.scalar(select(AcademicTerm).where(
        AcademicTerm.id == term_id, AcademicTerm.school_id == context.school_id,
    ))
    if term is None:
        raise HTTPException(status_code=404, detail="Term not found")
    student = await session.scalar(select(Student).where(
        Student.id == student_id, Student.school_id == context.school_id,
    ))
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    enrollment = await session.scalar(select(StudentEnrollment).where(
        StudentEnrollment.school_id == context.school_id,
        StudentEnrollment.student_id == student_id,
        StudentEnrollment.academic_year_id == term.academic_year_id,
        StudentEnrollment.status == "active",
    ))
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Student is not enrolled for this term's academic year")
    if context.role == MembershipRole.TEACHER:
        member_id = await _membership_id(session, context)
        assigned = await session.scalar(select(ClassSubjectAssignment.id).where(
            ClassSubjectAssignment.school_id == context.school_id,
            ClassSubjectAssignment.teacher_membership_id == member_id,
            ClassSubjectAssignment.class_group_id == enrollment.class_group_id,
        ).limit(1))
        if assigned is None:
            raise HTTPException(status_code=403, detail="You are not assigned to this class")

    publication = await session.scalar(select(ResultPublication).where(
        ResultPublication.school_id == context.school_id,
        ResultPublication.term_id == term.id,
        ResultPublication.class_group_id == enrollment.class_group_id,
    ))
    if publication is None or publication.status != "published":
        raise HTTPException(
            status_code=409,
            detail="Report cards are only available once results for this class and term are published",
        )
    term_result = await session.scalar(select(TermResult).where(
        TermResult.school_id == context.school_id,
        TermResult.term_id == term.id,
        TermResult.class_group_id == enrollment.class_group_id,
        TermResult.student_id == student_id,
    ))
    if term_result is None:
        raise HTTPException(status_code=409, detail="No computed results exist for this student and term")

    subject_rows = await session.execute(
        select(TermSubjectResult, Subject)
        .select_from(TermSubjectResult)
        .join(Subject, (Subject.id == TermSubjectResult.subject_id)
              & (Subject.school_id == TermSubjectResult.school_id))
        .where(TermSubjectResult.school_id == context.school_id,
               TermSubjectResult.term_id == term.id,
               TermSubjectResult.class_group_id == enrollment.class_group_id,
               TermSubjectResult.student_id == student_id)
        .order_by(Subject.name)
    )
    subjects = [ReportCardSubject(
        subject_id=subject.id, subject_name=subject.name, subject_code=subject.code,
        weighted_total=row.weighted_total, grade=row.grade, points=row.points,
        assessment_count=row.assessment_count, total_weight=row.total_weight,
    ) for row, subject in subject_rows.all()]

    class_size = (await session.execute(
        select(func.count(TermResult.id)).where(
            TermResult.school_id == context.school_id,
            TermResult.term_id == term.id,
            TermResult.class_group_id == enrollment.class_group_id,
        ))).scalar_one()
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == enrollment.class_group_id, ClassGroup.school_id == context.school_id,
    ))
    year = await session.scalar(select(AcademicYear).where(
        AcademicYear.id == term.academic_year_id, AcademicYear.school_id == context.school_id,
    ))
    school_name = await session.scalar(select(School.name).where(School.id == context.school_id))
    year_name = year.name if year else ""
    class_name = group.name if group else ""
    class_stream = group.stream if group else ""

    grading_scale_name: str | None = None
    if publication.grading_scale_id:
        grading_scale_name = await session.scalar(select(GradingScale.name).where(
            GradingScale.id == publication.grading_scale_id,
            GradingScale.school_id == context.school_id,
        ))
    if grading_scale_name is None:
        fallback_scale = await active_default_scale(session, context.school_id)
        grading_scale_name = fallback_scale.name if fallback_scale else None
    published_by: str | None = None
    if publication.published_by_membership_id:
        published_by = await session.scalar(
            select(User.display_name)
            .select_from(SchoolMembership)
            .join(User, User.id == SchoolMembership.user_id)
            .where(SchoolMembership.id == publication.published_by_membership_id)
        )
    return ReportCardResponse(
        school_name=school_name or "", academic_year_id=term.academic_year_id, academic_year_name=year_name,
        term_id=term.id, term_name=term.name, term_starts_on=term.starts_on, term_ends_on=term.ends_on,
        class_group_id=enrollment.class_group_id, class_name=class_name, class_stream=class_stream,
        student_id=student.id, admission_number=student.admission_number,
        first_name=student.first_name, last_name=student.last_name, subjects=subjects,
        aggregate_percent=term_result.aggregate_percent, aggregate_grade=term_result.grade,
        aggregate_points=term_result.points, position=term_result.position, class_size=class_size,
        grading_scale_name=grading_scale_name, published_at=publication.published_at,
        published_by=published_by or None,
    )
