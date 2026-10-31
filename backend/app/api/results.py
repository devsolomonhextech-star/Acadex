"""Weighted term totals, result preview, publication, and printable report cards."""
from datetime import UTC, date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain.notifications import resolve_recipients
from app.domain.parent_notifications import dispatch_parent_notifications
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
    Assessment,
    AssessmentScore,
    AuditEvent,
    ClassGroup,
    ClassSubjectAssignment,
    GradingScale,
    MembershipRole,
    Notification,
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


class AssessmentBreakdownRow(BaseModel):
    id: UUID
    title: str
    category: str
    score: Decimal | None
    max_score: Decimal
    score_percent: Decimal | None
    weight_percent: Decimal
    contribution_percent: Decimal | None
    submission_status: str


class SubjectBreakdownRow(BaseModel):
    subject_id: UUID
    subject_name: str
    weighted_total: Decimal | None
    grade: str | None
    points: Decimal | None
    total_weight: Decimal
    weight_share_percent: Decimal | None
    term_contribution_percent: Decimal | None
    assessments: list[AssessmentBreakdownRow]


class GradeBandBreakdown(BaseModel):
    min_percent: Decimal
    max_percent: Decimal
    description: str | None


class StudentBreakdownResponse(BaseModel):
    student_id: UUID
    student_name: str
    admission_number: str
    class_name: str
    term_name: str
    grading_scale_name: str | None
    aggregate_percent: Decimal | None
    grade: str | None
    points: Decimal | None
    grade_band: GradeBandBreakdown | None
    position: int | None
    class_size: int
    subjects: list[SubjectBreakdownRow]


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


@router.get("/student-breakdown", response_model=StudentBreakdownResponse)
async def get_student_breakdown(
    class_group_id: UUID,
    term_id: UUID,
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*read_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Explain one learner's approved assessment marks and weighted term grade."""
    group, term = await _resolve_class_term(session, context, class_group_id, term_id)
    if context.role == MembershipRole.TEACHER:
        member_id = await _membership_id(session, context)
        assigned = await session.scalar(select(ClassSubjectAssignment.id).where(
            ClassSubjectAssignment.school_id == context.school_id,
            ClassSubjectAssignment.teacher_membership_id == member_id,
            ClassSubjectAssignment.class_group_id == group.id,
        ).limit(1))
        if assigned is None:
            raise HTTPException(status_code=403, detail="You are not assigned to this class")
    student = await session.scalar(
        select(Student)
        .join(StudentEnrollment, (StudentEnrollment.student_id == Student.id)
              & (StudentEnrollment.school_id == Student.school_id))
        .where(
            Student.id == student_id,
            Student.school_id == context.school_id,
            StudentEnrollment.academic_year_id == group.academic_year_id,
            StudentEnrollment.class_group_id == group.id,
            StudentEnrollment.status == "active",
        )
    )
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found in this class")

    publication = await session.scalar(select(ResultPublication).where(
        ResultPublication.school_id == context.school_id,
        ResultPublication.term_id == term.id,
        ResultPublication.class_group_id == group.id,
    ))
    scale = None
    if publication and publication.grading_scale_id:
        scale = await session.scalar(select(GradingScale).where(
            GradingScale.id == publication.grading_scale_id,
            GradingScale.school_id == context.school_id,
        ))
    if scale is None:
        scale = await active_default_scale(session, context.school_id)
    assessments = (await session.execute(
        select(Assessment, Subject, AssessmentScore)
        .join(Subject, (Subject.id == Assessment.subject_id)
              & (Subject.school_id == Assessment.school_id))
        .outerjoin(AssessmentScore, and_(
            AssessmentScore.school_id == Assessment.school_id,
            AssessmentScore.assessment_id == Assessment.id,
            AssessmentScore.student_id == student.id,
        ))
        .where(
            Assessment.school_id == context.school_id,
            Assessment.class_group_id == group.id,
            Assessment.academic_year_id == group.academic_year_id,
            Assessment.term_id == term.id,
            Assessment.status == "approved",
        )
        .order_by(Subject.name, Assessment.due_on, Assessment.created_at, Assessment.title)
    )).all()

    weight_by_subject: dict[UUID, Decimal] = {}
    rows_by_subject: dict[UUID, list[tuple[Assessment, Subject, AssessmentScore | None]]] = {}
    for assessment, subject, score_row in assessments:
        weight_by_subject[subject.id] = weight_by_subject.get(subject.id, Decimal(0)) + assessment.weight_percent
        rows_by_subject.setdefault(subject.id, []).append((assessment, subject, score_row))
    saved_subjects = {row.subject_id: row for row in (await session.scalars(select(TermSubjectResult).where(
        TermSubjectResult.school_id == context.school_id,
        TermSubjectResult.class_group_id == group.id,
        TermSubjectResult.term_id == term.id,
        TermSubjectResult.student_id == student.id,
    ))).all()}
    term_result = await session.scalar(select(TermResult).where(
        TermResult.school_id == context.school_id,
        TermResult.class_group_id == group.id,
        TermResult.term_id == term.id,
        TermResult.student_id == student.id,
    ))
    included_weights = {
        subject_id: (row.total_weight if row.total_weight > 0 else Decimal(1))
        for subject_id, row in saved_subjects.items()
    }
    overall_weight = sum(included_weights.values(), Decimal(0))
    subject_breakdowns: list[SubjectBreakdownRow] = []
    for subject_id, subject_rows in rows_by_subject.items():
        total_weight = weight_by_subject[subject_id]
        complete = all(
            score_row is not None and score_row.score is not None
            for assessment, _subject, score_row in subject_rows
            if assessment.weight_percent > 0
        )
        scored_count = sum(1 for _assessment, _subject, score_row in subject_rows
                           if score_row is not None and score_row.score is not None)
        calculations: list[AssessmentBreakdownRow] = []
        calculated_total = Decimal(0)
        for assessment, subject, score_row in subject_rows:
            score = score_row.score if score_row else None
            score_percent = (score * Decimal(100) / assessment.max_score) if score is not None else None
            contribution = None
            if score_percent is not None:
                if total_weight > 0:
                    contribution = score_percent * assessment.weight_percent / total_weight
                elif scored_count:
                    contribution = score_percent / scored_count
                calculated_total += contribution or Decimal(0)
            calculations.append(AssessmentBreakdownRow(
                id=assessment.id, title=assessment.title, category=assessment.category,
                score=score, max_score=assessment.max_score,
                score_percent=score_percent.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if score_percent is not None else None,
                weight_percent=assessment.weight_percent,
                contribution_percent=contribution.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if contribution is not None else None,
                submission_status=score_row.submission_status if score_row else "not_recorded",
            ))
        saved = saved_subjects.get(subject_id)
        actual_total = saved.weighted_total if saved else (
            calculated_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if complete and scored_count else None
        )
        share_weight = included_weights.get(subject_id, total_weight if total_weight > 0 else Decimal(1))
        weight_share = (share_weight * Decimal(100) / overall_weight) if overall_weight and subject_id in included_weights else None
        term_contribution = (actual_total * share_weight / overall_weight) if actual_total is not None and overall_weight and subject_id in included_weights else None
        subject_breakdowns.append(SubjectBreakdownRow(
            subject_id=subject_id,
            subject_name=subject_rows[0][1].name,
            weighted_total=actual_total,
            grade=saved.grade if saved else None,
            points=saved.points if saved else None,
            total_weight=total_weight,
            weight_share_percent=weight_share.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if weight_share is not None else None,
            term_contribution_percent=term_contribution.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if term_contribution is not None else None,
            assessments=calculations,
        ))
    class_size = int(await session.scalar(select(func.count()).select_from(StudentEnrollment).where(
        StudentEnrollment.school_id == context.school_id,
        StudentEnrollment.academic_year_id == group.academic_year_id,
        StudentEnrollment.class_group_id == group.id,
        StudentEnrollment.status == "active",
    )) or 0)
    bands = await load_bands(session, context.school_id, scale.id) if scale else []
    current_band = next((band for band in bands if term_result and term_result.grade == band.grade), None)
    return StudentBreakdownResponse(
        student_id=student.id,
        student_name=f"{student.first_name} {student.last_name}",
        admission_number=student.admission_number,
        class_name=group.name,
        term_name=term.name,
        grading_scale_name=scale.name if scale else None,
        aggregate_percent=term_result.aggregate_percent if term_result else None,
        grade=term_result.grade if term_result else None,
        points=term_result.points if term_result else None,
        grade_band=GradeBandBreakdown(
            min_percent=current_band.min_percent,
            max_percent=current_band.max_percent,
            description=current_band.description,
        ) if current_band else None,
        position=term_result.position if term_result else None,
        class_size=class_size,
        subjects=subject_breakdowns,
    )


@router.post("/publish", response_model=ClassResultsResponse)
async def publish_results(
    payload: PublishRequest,
    background: BackgroundTasks,
    request: Request,
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
    parent_user_ids = await resolve_recipients(
        session, context.school_id, audience="class", class_group_id=group.id,
    )
    report_notice = f"{term.name} results are now available for {group.name}. Open Acadex Connect to view your child's report."
    for user_id in parent_user_ids:
        session.add(Notification(
            school_id=context.school_id,
            user_id=user_id,
            title="Report card published",
            body=report_notice,
            type="report_published",
            link="/academics",
        ))
    await session.commit()
    if parent_user_ids:
        await dispatch_parent_notifications(
            request, background,
            school_id=context.school_id,
            recipients=parent_user_ids,
            title="Report card published",
            push_body=report_notice,
            link="/academics",
            preference_key="reports",
        )
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
