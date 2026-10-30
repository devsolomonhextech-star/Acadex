"""Assessment setup, class score entry, and moderation workflows."""
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import (
    AcademicTerm,
    Assessment,
    AssessmentScore,
    AuditEvent,
    ClassGroup,
    ClassSubjectAssignment,
    MembershipRole,
    SchoolMembership,
    Student,
    StudentEnrollment,
    Subject,
)

router = APIRouter(prefix="/api/v1/assessments", tags=["assessments"])
read_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR, MembershipRole.TEACHER)
write_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.REGISTRAR, MembershipRole.TEACHER)
review_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL)
AssessmentCategory = Literal["quiz", "assignment", "project", "class_test", "examination", "practical", "other"]


class AssessmentCreate(BaseModel):
    class_group_id: UUID
    subject_id: UUID
    term_id: UUID
    title: str = Field(min_length=2, max_length=120)
    category: AssessmentCategory
    max_score: Decimal = Field(gt=0, le=1000, max_digits=7, decimal_places=2)
    weight_percent: Decimal = Field(default=Decimal(0), ge=0, le=100, max_digits=5, decimal_places=2)
    due_on: date | None = None

    @model_validator(mode="after")
    def normalize_title(self):
        self.title = self.title.strip()
        if len(self.title) < 2:
            raise ValueError("Assessment title must contain at least two characters")
        return self


class AssessmentSummary(BaseModel):
    id: UUID
    academic_year_id: UUID
    class_group_id: UUID
    class_name: str
    subject_id: UUID
    subject_name: str
    subject_code: str
    term_id: UUID
    term_name: str
    title: str
    category: str
    max_score: Decimal
    weight_percent: Decimal
    due_on: date | None
    status: str
    review_note: str | None
    created_at: datetime
    updated_at: datetime


class GradebookMark(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: UUID
    score: Decimal | None = Field(default=None, ge=0, max_digits=7, decimal_places=2)
    comment: str | None = Field(default=None, max_length=240)
    submission_status: Literal["not_recorded", "submitted", "missing", "excused"] = "not_recorded"


class GradebookSave(BaseModel):
    marks: list[GradebookMark] = Field(min_length=1, max_length=500)


class GradebookStudent(BaseModel):
    student_id: UUID
    admission_number: str
    first_name: str
    last_name: str
    score: Decimal | None
    comment: str | None
    submission_status: Literal["not_recorded", "submitted", "missing", "excused"]


class GradebookResponse(BaseModel):
    assessment: AssessmentSummary
    students: list[GradebookStudent]


class ReviewDecision(BaseModel):
    decision: Literal["approve", "return"]
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def return_needs_note(self):
        if self.decision == "return" and (self.note is None or len(self.note.strip()) < 5):
            raise ValueError("Add at least five characters explaining what needs correction")
        if self.note is not None:
            self.note = self.note.strip() or None
        return self


async def _membership_id(session: AsyncSession, context: TenantContext) -> UUID:
    membership_id = await session.scalar(select(SchoolMembership.id).where(
        SchoolMembership.school_id == context.school_id,
        SchoolMembership.user_id == context.user_id,
        SchoolMembership.status == "active",
    ))
    if membership_id is None:
        raise HTTPException(status_code=403, detail="Active school membership required")
    return membership_id


async def _has_assignment(session: AsyncSession, school_id: UUID, member_id: UUID, class_id: UUID, subject_id: UUID) -> bool:
    assignment = await session.scalar(select(ClassSubjectAssignment.id).where(
        ClassSubjectAssignment.school_id == school_id,
        ClassSubjectAssignment.teacher_membership_id == member_id,
        ClassSubjectAssignment.class_group_id == class_id,
        ClassSubjectAssignment.subject_id == subject_id,
    ).limit(1))
    return assignment is not None


async def _get_assessment(session: AsyncSession, context: TenantContext, assessment_id: UUID, *, editing: bool = False, lock: bool = False) -> Assessment:
    query = select(Assessment).where(Assessment.id == assessment_id, Assessment.school_id == context.school_id)
    if editing or lock:
        query = query.with_for_update()
    assessment = await session.scalar(query)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if context.role == MembershipRole.TEACHER:
        member_id = await _membership_id(session, context)
        if not await _has_assignment(session, context.school_id, member_id, assessment.class_group_id, assessment.subject_id):
            raise HTTPException(status_code=403, detail="You are not assigned to this class and subject")
    if editing and assessment.status not in {"open", "returned"}:
        raise HTTPException(status_code=409, detail="This assessment is locked while it is submitted or approved")
    return assessment


async def _summary(session: AsyncSession, assessment: Assessment) -> AssessmentSummary:
    # Three explicit lookups: multi-FROM join inference on these entities is ambiguous.
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == assessment.class_group_id, ClassGroup.school_id == assessment.school_id))
    subject = await session.scalar(select(Subject).where(
        Subject.id == assessment.subject_id, Subject.school_id == assessment.school_id))
    term = await session.scalar(select(AcademicTerm).where(
        AcademicTerm.id == assessment.term_id,
        AcademicTerm.school_id == assessment.school_id,
        AcademicTerm.academic_year_id == assessment.academic_year_id))
    if group is None or subject is None or term is None:
        raise HTTPException(status_code=404, detail="Class, subject, or term not found")
    return AssessmentSummary(
        id=assessment.id, academic_year_id=assessment.academic_year_id,
        class_group_id=assessment.class_group_id, class_name=group.name,
        subject_id=subject.id, subject_name=subject.name, subject_code=subject.code,
        term_id=term.id, term_name=term.name, title=assessment.title, category=assessment.category,
        max_score=assessment.max_score, weight_percent=assessment.weight_percent,
        due_on=assessment.due_on, status=assessment.status, review_note=assessment.review_note,
        created_at=assessment.created_at, updated_at=assessment.updated_at,
    )


@router.get("", response_model=list[AssessmentSummary])
async def list_assessments(
    context: Annotated[TenantContext, Depends(require_roles(*read_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    academic_year_id: UUID | None = None,
    class_group_id: UUID | None = None,
    subject_id: UUID | None = None,
    status_filter: Literal["open", "submitted", "returned", "approved"] | None = None,
):
    query = (
        select(Assessment, ClassGroup.name, Subject.name, Subject.code, AcademicTerm.name)
        .join(ClassGroup, (ClassGroup.id == Assessment.class_group_id) & (ClassGroup.school_id == Assessment.school_id))
        .join(Subject, (Subject.id == Assessment.subject_id) & (Subject.school_id == Assessment.school_id))
        .join(AcademicTerm, (AcademicTerm.id == Assessment.term_id)
              & (AcademicTerm.school_id == Assessment.school_id)
              & (AcademicTerm.academic_year_id == Assessment.academic_year_id))
        .where(Assessment.school_id == context.school_id)
    )
    if context.role == MembershipRole.TEACHER:
        member_id = await _membership_id(session, context)
        query = query.join(ClassSubjectAssignment, (
            (ClassSubjectAssignment.school_id == Assessment.school_id)
            & (ClassSubjectAssignment.class_group_id == Assessment.class_group_id)
            & (ClassSubjectAssignment.subject_id == Assessment.subject_id)
        )).where(ClassSubjectAssignment.teacher_membership_id == member_id)
    if academic_year_id:
        query = query.where(Assessment.academic_year_id == academic_year_id)
    if class_group_id:
        query = query.where(Assessment.class_group_id == class_group_id)
    if subject_id:
        query = query.where(Assessment.subject_id == subject_id)
    if status_filter:
        query = query.where(Assessment.status == status_filter)
    rows = (await session.execute(query.order_by(AcademicTerm.ordinal, ClassGroup.name, Subject.name, Assessment.created_at.desc()))).all()
    return [AssessmentSummary(
        id=item.id, academic_year_id=item.academic_year_id, class_group_id=item.class_group_id,
        class_name=class_name, subject_id=item.subject_id, subject_name=subject_name,
        subject_code=subject_code, term_id=item.term_id, term_name=term_name, title=item.title,
        category=item.category, max_score=item.max_score, weight_percent=item.weight_percent,
        due_on=item.due_on, status=item.status, review_note=item.review_note,
        created_at=item.created_at, updated_at=item.updated_at,
    ) for item, class_name, subject_name, subject_code, term_name in rows]


@router.post("", response_model=AssessmentSummary, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: AssessmentCreate,
    context: Annotated[TenantContext, Depends(require_roles(*write_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == payload.class_group_id, ClassGroup.school_id == context.school_id,
    ))
    subject = await session.scalar(select(Subject).where(
        Subject.id == payload.subject_id, Subject.school_id == context.school_id, Subject.status == "active",
    ))
    term = await session.scalar(select(AcademicTerm).where(
        AcademicTerm.id == payload.term_id, AcademicTerm.school_id == context.school_id,
    ))
    if group is None or subject is None or term is None or term.academic_year_id != group.academic_year_id:
        raise HTTPException(status_code=404, detail="Class, subject, or term not found for the same academic year")
    if payload.due_on and not term.starts_on <= payload.due_on <= term.ends_on:
        raise HTTPException(status_code=422, detail="Assessment due date must fall within its term")
    member_id = await _membership_id(session, context)
    if context.role == MembershipRole.TEACHER and not await _has_assignment(
        session, context.school_id, member_id, group.id, subject.id,
    ):
        raise HTTPException(status_code=403, detail="You are not assigned to this class and subject")
    row = Assessment(
        id=uuid4(), school_id=context.school_id, academic_year_id=group.academic_year_id,
        class_group_id=group.id, subject_id=subject.id, term_id=term.id,
        title=payload.title, category=payload.category, max_score=payload.max_score,
        weight_percent=payload.weight_percent, due_on=payload.due_on,
        created_by_membership_id=member_id,
    )
    session.add(row)
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="assessment.created", resource_type="assessment", resource_id=row.id))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="An assessment with this title already exists for this subject and term") from None
    return await _summary(session, row)


@router.get("/{assessment_id}/gradebook", response_model=GradebookResponse)
async def get_gradebook(
    assessment_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*read_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    assessment = await _get_assessment(session, context, assessment_id)
    rows = await session.execute(
        select(Student, AssessmentScore)
        .join(StudentEnrollment, (StudentEnrollment.student_id == Student.id)
              & (StudentEnrollment.school_id == Student.school_id))
        .outerjoin(AssessmentScore, (AssessmentScore.school_id == Student.school_id)
                   & (AssessmentScore.student_id == Student.id)
                   & (AssessmentScore.assessment_id == assessment.id))
        .where(StudentEnrollment.school_id == context.school_id,
               StudentEnrollment.class_group_id == assessment.class_group_id,
               StudentEnrollment.academic_year_id == assessment.academic_year_id,
               StudentEnrollment.status == "active", Student.status == "active")
        .order_by(Student.last_name, Student.first_name, Student.admission_number)
    )
    roster = [GradebookStudent(
        student_id=student.id, admission_number=student.admission_number,
        first_name=student.first_name, last_name=student.last_name,
        score=score.score if score else None, comment=score.comment if score else None,
        submission_status=score.submission_status if score else "not_recorded",
    ) for student, score in rows.all()]
    return GradebookResponse(assessment=await _summary(session, assessment), students=roster)


@router.put("/{assessment_id}/gradebook", response_model=GradebookResponse)
async def save_gradebook(
    assessment_id: UUID,
    payload: GradebookSave,
    context: Annotated[TenantContext, Depends(require_roles(*write_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    assessment = await _get_assessment(session, context, assessment_id, editing=True)
    marks = {mark.student_id: mark for mark in payload.marks}
    if len(marks) != len(payload.marks):
        raise HTTPException(status_code=422, detail="Each student can appear only once")
    roster_ids = set((await session.scalars(select(StudentEnrollment.student_id)
        .join(Student, (Student.id == StudentEnrollment.student_id) & (Student.school_id == StudentEnrollment.school_id))
        .where(StudentEnrollment.school_id == context.school_id,
               StudentEnrollment.class_group_id == assessment.class_group_id,
               StudentEnrollment.academic_year_id == assessment.academic_year_id,
               StudentEnrollment.status == "active", Student.status == "active"))).all())
    if set(marks) != roster_ids:
        raise HTTPException(status_code=422, detail="Scores must include every currently enrolled student exactly once")
    for mark in payload.marks:
        if mark.score is not None and mark.score > assessment.max_score:
            raise HTTPException(status_code=422, detail=f"A score cannot exceed {assessment.max_score}")
    member_id = await _membership_id(session, context)
    current = await session.scalars(select(AssessmentScore).where(
        AssessmentScore.school_id == context.school_id, AssessmentScore.assessment_id == assessment.id,
    ).with_for_update())
    existing = {row.student_id: row for row in current}
    audited_changes: list[dict[str, str | None]] = []
    for student_id, mark in marks.items():
        comment = mark.comment.strip() if mark.comment and mark.comment.strip() else None
        score = existing.get(student_id)
        if score is None:
            session.add(AssessmentScore(
                id=uuid4(), school_id=context.school_id, assessment_id=assessment.id,
                student_id=student_id, score=mark.score, comment=comment,
                submission_status=mark.submission_status,
                updated_by_membership_id=member_id,
            ))
            audited_changes.append({"student_id": str(student_id), "before_score": None,
                                    "after_score": str(mark.score) if mark.score is not None else None,
                                    "after_status": mark.submission_status})
        else:
            if score.score != mark.score or score.submission_status != mark.submission_status:
                audited_changes.append({"student_id": str(student_id),
                    "before_score": str(score.score) if score.score is not None else None,
                    "after_score": str(mark.score) if mark.score is not None else None,
                    "before_status": score.submission_status, "after_status": mark.submission_status})
            score.score = mark.score
            score.comment = comment
            score.submission_status = mark.submission_status
            score.updated_by_membership_id = member_id
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="assessment.scores_saved", resource_type="assessment", resource_id=assessment.id,
                           details={"changed_scores": audited_changes}))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Scores changed at the same time. Reload and try again") from None
    return await get_gradebook(assessment.id, context, session)


@router.post("/{assessment_id}/submit", response_model=AssessmentSummary)
async def submit_assessment(
    assessment_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*write_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    assessment = await _get_assessment(session, context, assessment_id, lock=True)
    if assessment.status not in {"open", "returned"}:
        raise HTTPException(status_code=409, detail="Only open or returned assessments can be submitted")
    roster_ids = set((await session.scalars(select(StudentEnrollment.student_id)
        .join(Student, (Student.id == StudentEnrollment.student_id) & (Student.school_id == StudentEnrollment.school_id))
        .where(StudentEnrollment.school_id == context.school_id,
               StudentEnrollment.class_group_id == assessment.class_group_id,
               StudentEnrollment.academic_year_id == assessment.academic_year_id,
               StudentEnrollment.status == "active", Student.status == "active"))).all())
    score_ids = set((await session.scalars(select(AssessmentScore.student_id).where(
        AssessmentScore.school_id == context.school_id, AssessmentScore.assessment_id == assessment.id,
        AssessmentScore.score.is_not(None),
    ))).all())
    if not roster_ids or not roster_ids.issubset(score_ids):
        raise HTTPException(status_code=422, detail="Enter a score for every active student before submitting")
    assessment.status = "submitted"
    assessment.review_note = None
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="assessment.submitted", resource_type="assessment", resource_id=assessment.id))
    await session.commit()
    return await _summary(session, assessment)


@router.post("/{assessment_id}/review", response_model=AssessmentSummary)
async def review_assessment(
    assessment_id: UUID,
    payload: ReviewDecision,
    context: Annotated[TenantContext, Depends(require_roles(*review_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    assessment = await session.scalar(select(Assessment).where(
        Assessment.id == assessment_id, Assessment.school_id == context.school_id,
    ).with_for_update())
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if assessment.status != "submitted":
        raise HTTPException(status_code=409, detail="Only submitted assessments can be reviewed")
    member_id = await _membership_id(session, context)
    approved = payload.decision == "approve"
    assessment.status = "approved" if approved else "returned"
    assessment.review_note = None if approved else payload.note
    assessment.reviewed_by_membership_id = member_id
    assessment.reviewed_at = datetime.now(UTC)
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="assessment.approved" if approved else "assessment.returned",
                           resource_type="assessment", resource_id=assessment.id))
    await session.commit()
    return await _summary(session, assessment)
