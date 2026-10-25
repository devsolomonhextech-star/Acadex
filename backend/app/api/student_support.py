"""Explainable early-support signals and school-owned intervention tracking.

Signals are rules over current school records, not dropout predictions or
automated student decisions. A staff member reviews the context before acting.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import (
    AcademicTerm,
    AcademicYear,
    Assessment,
    AssessmentScore,
    AttendanceRecord,
    AttendanceSession,
    AuditEvent,
    BehaviorRecord,
    ClassGroup,
    ClassSubjectAssignment,
    MembershipRole,
    SchoolMembership,
    Student,
    StudentEnrollment,
    StudentSupportIntervention,
    User,
)

router = APIRouter(prefix="/api/v1/student-support", tags=["student support"])
support_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR, MembershipRole.TEACHER, MembershipRole.STAFF)
manager_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR)
InterventionCategory = Literal["attendance", "academic", "assignment", "wellbeing", "family_contact", "other"]
InterventionStatus = Literal["planned", "in_progress", "completed", "cancelled"]


class SupportSignal(BaseModel):
    key: str
    title: str
    detail: str
    severity: Literal["watch", "concern"]


class SupportRecommendation(BaseModel):
    category: InterventionCategory
    title: str
    action: str
    suggested_owner: str


class StudentSupportRow(BaseModel):
    student_id: UUID
    first_name: str
    last_name: str
    admission_number: str
    class_group_id: UUID
    class_name: str
    support_score: int
    support_level: Literal["urgent_review", "follow_up", "monitor", "no_current_signal"]
    attendance_rate: float | None
    recent_attendance_rate: float | None
    assessment_average: float | None
    assessment_change_points: float | None
    missing_assignments: int
    recent_incidents: int
    signal_count: int
    signals: list[SupportSignal]
    recommendations: list[SupportRecommendation]


class SupportSummary(BaseModel):
    academic_year_id: UUID
    academic_year_name: str
    term_id: UUID | None
    term_name: str | None
    generated_at: datetime
    students_total: int
    urgent_review: int
    follow_up: int
    monitor: int
    students: list[StudentSupportRow]


class InterventionCreate(BaseModel):
    student_id: UUID
    academic_year_id: UUID
    term_id: UUID | None = None
    category: InterventionCategory
    title: str = Field(min_length=3, max_length=140)
    action: str = Field(min_length=8, max_length=3000)
    assigned_to_membership_id: UUID | None = None
    follow_up_on: date | None = None

    @field_validator("title", "action")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return " ".join(value.split())


class InterventionUpdate(BaseModel):
    status: InterventionStatus | None = None
    assigned_to_membership_id: UUID | None = None
    follow_up_on: date | None = None
    outcome: str | None = Field(default=None, max_length=3000)

    @field_validator("outcome")
    @classmethod
    def normalize_outcome(cls, value: str | None) -> str | None:
        return " ".join(value.split()) if value and value.strip() else None


class InterventionRow(BaseModel):
    id: UUID
    student_id: UUID
    student_name: str
    admission_number: str
    class_name: str
    academic_year_id: UUID
    term_id: UUID | None
    category: str
    title: str
    action: str
    status: str
    assigned_to_membership_id: UUID | None
    assigned_to_name: str | None
    follow_up_on: date | None
    outcome: str | None
    baseline_attendance_rate: float | None
    baseline_assessment_average: float | None
    latest_attendance_rate: float | None
    latest_assessment_average: float | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AssigneeRow(BaseModel):
    membership_id: UUID
    display_name: str
    role: str


def _attendance_rate(records: list[tuple[date, str]]) -> tuple[float | None, int]:
    counted = [status for _, status in records if status in {"present", "late", "absent"}]
    if not counted:
        return None, 0
    return round(sum(status in {"present", "late"} for status in counted) * 100 / len(counted), 1), len(counted)


async def _metric_snapshot(
    session: AsyncSession, school_id: UUID, student_id: UUID,
    academic_year: AcademicYear, term: AcademicTerm | None,
) -> tuple[Decimal | None, Decimal | None]:
    start = term.starts_on if term else academic_year.starts_on
    end = min(date.today(), term.ends_on if term else academic_year.ends_on)
    attendance_rows = (await session.execute(
        select(AttendanceRecord.status)
        .join(AttendanceSession, (AttendanceSession.id == AttendanceRecord.session_id)
              & (AttendanceSession.school_id == AttendanceRecord.school_id))
        .where(AttendanceRecord.school_id == school_id,
               AttendanceRecord.student_id == student_id,
               AttendanceSession.attendance_date >= start,
               AttendanceSession.attendance_date <= end)
    )).scalars().all()
    attendance_rate, _ = _attendance_rate([(end, value) for value in attendance_rows])
    score_query = select(AssessmentScore.score, Assessment.max_score).join(
        Assessment, (Assessment.id == AssessmentScore.assessment_id)
        & (Assessment.school_id == AssessmentScore.school_id)
    ).where(
        AssessmentScore.school_id == school_id,
        AssessmentScore.student_id == student_id,
        Assessment.academic_year_id == academic_year.id,
        Assessment.status.in_(("submitted", "approved")),
        or_(Assessment.due_on.is_(None), Assessment.due_on <= end),
        AssessmentScore.score.is_not(None),
    )
    if term:
        score_query = score_query.where(Assessment.term_id == term.id)
    scores = (await session.execute(score_query)).all()
    assessment_average = (
        Decimal(str(sum(float(score * Decimal(100) / max_score) for score, max_score in scores) / len(scores))).quantize(Decimal("0.01"))
        if scores else None
    )
    return Decimal(str(attendance_rate)).quantize(Decimal("0.01")) if attendance_rate is not None else None, assessment_average


def _recommendations(keys: set[str]) -> list[SupportRecommendation]:
    result: list[SupportRecommendation] = []
    if "attendance_low" in keys or "attendance_drop" in keys:
        result.append(SupportRecommendation(
            category="attendance", title="Agree an attendance check-in",
            action="Meet privately with the student, review the recent attendance pattern with their family, identify practical barriers, and agree on a check-in date within one week.",
            suggested_owner="Class teacher · family contact",
        ))
    if "assessment_low" in keys or "assessment_drop" in keys:
        result.append(SupportRecommendation(
            category="academic", title="Plan a short learning review",
            action="Review the latest marked work with the student, identify the topics causing difficulty, and set one or two achievable practice goals for the next two weeks.",
            suggested_owner="Subject teacher",
        ))
    if "assignments_missing" in keys:
        result.append(SupportRecommendation(
            category="assignment", title="Break outstanding work into steps",
            action="Confirm the missing-work status with the student, agree which task to complete first, and set a realistic check-back date. Update the gradebook if the work was submitted or excused.",
            suggested_owner="Subject teacher",
        ))
    if "behavior_review" in keys:
        result.append(SupportRecommendation(
            category="wellbeing", title="Offer a supportive conversation",
            action="Review the underlying incident notes for context, speak with the student privately, and offer a counsellor check-in where appropriate. Do not infer intent from the count alone.",
            suggested_owner="Counsellor · trusted staff member",
        ))
    return result


def _score_student(
    *,
    student,
    class_group_id: UUID,
    class_name: str,
    attendance: list[tuple[date, str]],
    scores: list[tuple[date, float]],
    missing_assignments: int,
    recent_incidents: int,
    comparison_end: date,
) -> StudentSupportRow:
    signals: list[SupportSignal] = []
    keys: set[str] = set()
    score = 0

    attendance_rate, attendance_count = _attendance_rate(attendance)
    recent_rate, recent_count = _attendance_rate([
        (day, state) for day, state in attendance if comparison_end - timedelta(days=30) < day <= comparison_end
    ])
    previous_rate, previous_count = _attendance_rate([
        (day, state) for day, state in attendance if comparison_end - timedelta(days=60) < day <= comparison_end - timedelta(days=30)
    ])
    attendance_points = 0
    if attendance_rate is not None and attendance_count >= 5:
        if attendance_rate < 70:
            attendance_points = 38
            keys.add("attendance_low")
            signals.append(SupportSignal(key="attendance_low", title="Low attendance", detail=f"Attendance is {attendance_rate:.1f}% across {attendance_count} marked days in this period.", severity="concern"))
        elif attendance_rate < 82:
            attendance_points = 26
            keys.add("attendance_low")
            signals.append(SupportSignal(key="attendance_low", title="Attendance needs review", detail=f"Attendance is {attendance_rate:.1f}% across {attendance_count} marked days in this period.", severity="watch"))
        elif attendance_rate < 90:
            attendance_points = 12
            keys.add("attendance_low")
            signals.append(SupportSignal(key="attendance_low", title="Attendance below school target", detail=f"Attendance is {attendance_rate:.1f}% across {attendance_count} marked days in this period.", severity="watch"))
    if recent_rate is not None and previous_rate is not None and recent_count >= 4 and previous_count >= 4:
        delta = round(recent_rate - previous_rate, 1)
        if delta <= -15:
            attendance_points = min(48, attendance_points + 22)
            keys.add("attendance_drop")
            signals.append(SupportSignal(key="attendance_drop", title="Recent attendance drop", detail=f"Attendance changed from {previous_rate:.1f}% to {recent_rate:.1f}% across comparable 30-day windows.", severity="concern"))

    average = round(sum(value for _, value in scores) / len(scores), 1) if scores else None
    assessment_change = None
    assessment_points = 0
    ordered_scores = sorted(scores, key=lambda row: row[0])
    if average is not None and len(ordered_scores) >= 2:
        if average < 40:
            assessment_points = 32
            keys.add("assessment_low")
            signals.append(SupportSignal(key="assessment_low", title="Low recent assessment average", detail=f"Average is {average:.1f}% across {len(ordered_scores)} marked assessments.", severity="concern"))
        elif average < 55:
            assessment_points = 22
            keys.add("assessment_low")
            signals.append(SupportSignal(key="assessment_low", title="Assessment results need review", detail=f"Average is {average:.1f}% across {len(ordered_scores)} marked assessments.", severity="watch"))
        elif average < 65:
            assessment_points = 10
            keys.add("assessment_low")
            signals.append(SupportSignal(key="assessment_low", title="Assessment average below review threshold", detail=f"Average is {average:.1f}% across {len(ordered_scores)} marked assessments.", severity="watch"))
    if len(ordered_scores) >= 6:
        earlier = [value for _, value in ordered_scores[-6:-3]]
        latest = [value for _, value in ordered_scores[-3:]]
        assessment_change = round(sum(latest) / len(latest) - sum(earlier) / len(earlier), 1)
        if assessment_change <= -15:
            assessment_points = min(48, assessment_points + 22)
            keys.add("assessment_drop")
            signals.append(SupportSignal(key="assessment_drop", title="Sudden performance drop", detail=f"Latest three marked assessments average {abs(assessment_change):.1f} points lower than the preceding three.", severity="concern"))

    assignment_points = 0
    if missing_assignments:
        assignment_points = min(24, 12 + max(0, missing_assignments - 1) * 4)
        keys.add("assignments_missing")
        signals.append(SupportSignal(key="assignments_missing", title="Missing assignment work recorded", detail=f"A teacher marked {missing_assignments} due assignment{'' if missing_assignments == 1 else 's'} as missing.", severity="concern" if missing_assignments >= 2 else "watch"))

    behavior_points = 0
    if recent_incidents >= 2:
        behavior_points = 12 if recent_incidents >= 4 else 8
        keys.add("behavior_review")
        signals.append(SupportSignal(key="behavior_review", title="Recent incident notes to review", detail=f"{recent_incidents} medium- or high-severity demerit/incident notes were recorded in the last 30 days. Review the notes and context with care.", severity="watch"))

    score = min(100, attendance_points + assessment_points + assignment_points + behavior_points)
    level = "urgent_review" if score >= 65 else "follow_up" if score >= 40 else "monitor" if score >= 25 else "no_current_signal"
    return StudentSupportRow(
        student_id=student.id, first_name=student.first_name, last_name=student.last_name,
        admission_number=student.admission_number, class_group_id=class_group_id, class_name=class_name,
        support_score=score, support_level=level, attendance_rate=attendance_rate,
        recent_attendance_rate=recent_rate, assessment_average=average,
        assessment_change_points=assessment_change, missing_assignments=missing_assignments,
        recent_incidents=recent_incidents, signal_count=len(signals), signals=signals,
        recommendations=_recommendations(keys),
    )


@router.get("", response_model=SupportSummary)
async def get_student_support(
    context: Annotated[TenantContext, Depends(require_roles(*support_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    academic_year_id: UUID | None = None,
    term_id: UUID | None = None,
):
    today = date.today()
    year_query = select(AcademicYear).where(AcademicYear.school_id == context.school_id)
    if academic_year_id:
        year_query = year_query.where(AcademicYear.id == academic_year_id)
    else:
        year_query = year_query.where(AcademicYear.starts_on <= today, AcademicYear.ends_on >= today)
    year_query = year_query.order_by(AcademicYear.starts_on.desc()).limit(1)
    academic_year = await session.scalar(year_query)
    if academic_year is None:
        raise HTTPException(status_code=404, detail="No academic year is available for student support")
    selected_term = None
    if term_id:
        selected_term = await session.scalar(select(AcademicTerm).where(
            AcademicTerm.id == term_id, AcademicTerm.school_id == context.school_id,
            AcademicTerm.academic_year_id == academic_year.id,
        ))
        if selected_term is None:
            raise HTTPException(status_code=404, detail="Term not found in the selected academic year")

    classes_query = select(ClassGroup).where(
        ClassGroup.school_id == context.school_id,
        ClassGroup.academic_year_id == academic_year.id,
    )
    assigned_student_ids: set[UUID] | None = None
    if context.role in (MembershipRole.TEACHER, MembershipRole.STAFF):
        membership_id = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.user_id == context.user_id,
            SchoolMembership.status == "active",
        ))
        if context.role == MembershipRole.TEACHER:
            class_ids = set(await session.scalars(select(ClassSubjectAssignment.class_group_id).where(
                ClassSubjectAssignment.school_id == context.school_id,
                ClassSubjectAssignment.teacher_membership_id == membership_id,
            )))
            classes_query = classes_query.where(ClassGroup.id.in_(class_ids)) if class_ids else classes_query.where(ClassGroup.id == UUID(int=0))
        else:
            assigned_student_ids = set(await session.scalars(select(StudentSupportIntervention.student_id).where(
                StudentSupportIntervention.school_id == context.school_id,
                StudentSupportIntervention.academic_year_id == academic_year.id,
                StudentSupportIntervention.assigned_to_membership_id == membership_id,
                StudentSupportIntervention.status.in_(("planned", "in_progress")),
            )))
    class_groups = list((await session.scalars(classes_query.order_by(ClassGroup.name))).all())
    class_by_id = {group.id: group for group in class_groups}
    class_ids = list(class_by_id)
    if not class_ids:
        return SupportSummary(
            academic_year_id=academic_year.id, academic_year_name=academic_year.name,
            term_id=selected_term.id if selected_term else None, term_name=selected_term.name if selected_term else None,
            generated_at=datetime.now().astimezone(), students_total=0, urgent_review=0, follow_up=0, monitor=0, students=[],
        )
    enrollment_query = (
        select(Student, StudentEnrollment.class_group_id)
        .join(StudentEnrollment, (StudentEnrollment.student_id == Student.id) & (StudentEnrollment.school_id == Student.school_id))
        .where(
            StudentEnrollment.school_id == context.school_id,
            StudentEnrollment.academic_year_id == academic_year.id,
            StudentEnrollment.class_group_id.in_(class_ids),
            StudentEnrollment.status == "active", Student.status == "active",
        )
    )
    if assigned_student_ids is not None:
        enrollment_query = enrollment_query.where(Student.id.in_(assigned_student_ids)) if assigned_student_ids else enrollment_query.where(Student.id == UUID(int=0))
    enrollment_rows = (await session.execute(
        enrollment_query.order_by(Student.last_name, Student.first_name, Student.admission_number)
    )).all()
    student_ids = [student.id for student, _ in enrollment_rows]
    if not student_ids:
        return SupportSummary(
            academic_year_id=academic_year.id, academic_year_name=academic_year.name,
            term_id=selected_term.id if selected_term else None, term_name=selected_term.name if selected_term else None,
            generated_at=datetime.now().astimezone(), students_total=0, urgent_review=0, follow_up=0, monitor=0, students=[],
        )
    period_start = selected_term.starts_on if selected_term else academic_year.starts_on
    period_end = min(today, selected_term.ends_on if selected_term else academic_year.ends_on)
    comparison_end = period_end

    attendance_rows = (await session.execute(
        select(AttendanceRecord.student_id, AttendanceSession.attendance_date, AttendanceRecord.status)
        .join(AttendanceSession, (AttendanceSession.id == AttendanceRecord.session_id) & (AttendanceSession.school_id == AttendanceRecord.school_id))
        .where(
            AttendanceRecord.school_id == context.school_id,
            AttendanceRecord.student_id.in_(student_ids),
            AttendanceSession.class_group_id.in_(class_ids),
            AttendanceSession.attendance_date >= period_start,
            AttendanceSession.attendance_date <= period_end,
        )
    )).all()
    attendance_by_student: dict[UUID, list[tuple[date, str]]] = {}
    for student_id, attendance_date, attendance_status in attendance_rows:
        attendance_by_student.setdefault(student_id, []).append((attendance_date, attendance_status))

    assessment_query = select(
        AssessmentScore.student_id, Assessment.due_on, AssessmentScore.score,
        Assessment.max_score, Assessment.category, AssessmentScore.submission_status,
    ).join(Assessment, (Assessment.id == AssessmentScore.assessment_id) & (Assessment.school_id == AssessmentScore.school_id)).where(
        AssessmentScore.school_id == context.school_id,
        AssessmentScore.student_id.in_(student_ids),
        Assessment.academic_year_id == academic_year.id,
        Assessment.status.in_(("submitted", "approved")),
    )
    if selected_term:
        assessment_query = assessment_query.where(Assessment.term_id == selected_term.id)
    scored_rows = (await session.execute(assessment_query)).all()
    score_by_student: dict[UUID, list[tuple[date, float]]] = {}
    missing_by_student: dict[UUID, int] = {}
    for student_id, due_on, value, max_score, category, submission_status in scored_rows:
        if value is not None and max_score:
            score_by_student.setdefault(student_id, []).append((due_on or period_end, float(value * Decimal(100) / max_score)))
        if category in {"assignment", "project"} and due_on and due_on < period_end and submission_status == "missing":
            missing_by_student[student_id] = missing_by_student.get(student_id, 0) + 1

    incident_rows = (await session.execute(
        select(BehaviorRecord.student_id)
        .where(
            BehaviorRecord.school_id == context.school_id,
            BehaviorRecord.student_id.in_(student_ids),
            BehaviorRecord.occurred_on >= comparison_end - timedelta(days=30),
            BehaviorRecord.occurred_on <= comparison_end,
            BehaviorRecord.category.in_(("demerit", "incident")),
            BehaviorRecord.severity.in_(("medium", "high")),
        )
    )).all()
    incidents_by_student: dict[UUID, int] = {}
    for (student_id,) in incident_rows:
        incidents_by_student[student_id] = incidents_by_student.get(student_id, 0) + 1

    students = [
        _score_student(
            student=student,
            class_group_id=group_id,
            class_name=class_by_id[group_id].name,
            attendance=attendance_by_student.get(student.id, []),
            scores=score_by_student.get(student.id, []),
            missing_assignments=missing_by_student.get(student.id, 0),
            recent_incidents=incidents_by_student.get(student.id, 0),
            comparison_end=comparison_end,
        )
        for student, group_id in enrollment_rows
    ]
    return SupportSummary(
        academic_year_id=academic_year.id, academic_year_name=academic_year.name,
        term_id=selected_term.id if selected_term else None, term_name=selected_term.name if selected_term else None,
        generated_at=datetime.now().astimezone(), students_total=len(students),
        urgent_review=sum(row.support_level == "urgent_review" for row in students),
        follow_up=sum(row.support_level == "follow_up" for row in students),
        monitor=sum(row.support_level == "monitor" for row in students),
        students=students,
    )


@router.get("/assignees", response_model=list[AssigneeRow])
async def list_assignees(
    context: Annotated[TenantContext, Depends(require_roles(*manager_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    rows = (await session.execute(
        select(SchoolMembership, User.display_name)
        .join(User, User.id == SchoolMembership.user_id)
        .where(
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.status == "active", User.status == "active",
            SchoolMembership.role.in_((MembershipRole.TEACHER, MembershipRole.STAFF)),
        ).order_by(User.display_name)
    )).all()
    return [AssigneeRow(membership_id=membership.id, display_name=name, role=membership.role.value) for membership, name in rows]


async def _intervention_rows(session: AsyncSession, context: TenantContext, academic_year_id: UUID, term_id: UUID | None):
    query = (
        select(StudentSupportIntervention, Student.first_name, Student.last_name, Student.admission_number,
               ClassGroup.name, User.display_name)
        .join(Student, (Student.id == StudentSupportIntervention.student_id) & (Student.school_id == StudentSupportIntervention.school_id))
        .join(StudentEnrollment, (StudentEnrollment.student_id == Student.id)
              & (StudentEnrollment.school_id == Student.school_id)
              & (StudentEnrollment.academic_year_id == StudentSupportIntervention.academic_year_id))
        .join(ClassGroup, (ClassGroup.id == StudentEnrollment.class_group_id) & (ClassGroup.school_id == StudentEnrollment.school_id))
        .outerjoin(SchoolMembership, (SchoolMembership.id == StudentSupportIntervention.assigned_to_membership_id)
                   & (SchoolMembership.school_id == StudentSupportIntervention.school_id))
        .outerjoin(User, User.id == SchoolMembership.user_id)
        .where(StudentSupportIntervention.school_id == context.school_id,
               StudentSupportIntervention.academic_year_id == academic_year_id)
    )
    if term_id:
        query = query.where(StudentSupportIntervention.term_id == term_id)
    if context.role in (MembershipRole.TEACHER, MembershipRole.STAFF):
        member_id = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.user_id == context.user_id,
            SchoolMembership.status == "active",
        ))
        query = query.where(StudentSupportIntervention.assigned_to_membership_id == member_id)
    query = query.order_by(StudentSupportIntervention.created_at.desc()).limit(300)
    return (await session.execute(query)).all()


def _intervention_response(rows) -> list[InterventionRow]:
    return [InterventionRow(
        id=intervention.id, student_id=intervention.student_id,
        student_name=f"{first_name} {last_name}", admission_number=admission_number,
        class_name=class_name, academic_year_id=intervention.academic_year_id,
        term_id=intervention.term_id, category=intervention.category, title=intervention.title,
        action=intervention.action, status=intervention.status,
        assigned_to_membership_id=intervention.assigned_to_membership_id,
        assigned_to_name=assigned_name, follow_up_on=intervention.follow_up_on,
        outcome=intervention.outcome, completed_at=intervention.completed_at,
        baseline_attendance_rate=float(intervention.baseline_attendance_rate) if intervention.baseline_attendance_rate is not None else None,
        baseline_assessment_average=float(intervention.baseline_assessment_average) if intervention.baseline_assessment_average is not None else None,
        latest_attendance_rate=float(intervention.latest_attendance_rate) if intervention.latest_attendance_rate is not None else None,
        latest_assessment_average=float(intervention.latest_assessment_average) if intervention.latest_assessment_average is not None else None,
        created_at=intervention.created_at, updated_at=intervention.updated_at,
    ) for intervention, first_name, last_name, admission_number, class_name, assigned_name in rows]


@router.get("/interventions", response_model=list[InterventionRow])
async def list_interventions(
    context: Annotated[TenantContext, Depends(require_roles(*support_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    academic_year_id: UUID,
    term_id: UUID | None = None,
):
    year = await session.scalar(select(AcademicYear.id).where(
        AcademicYear.id == academic_year_id, AcademicYear.school_id == context.school_id,
    ))
    if year is None:
        raise HTTPException(status_code=404, detail="Academic year not found")
    return _intervention_response(await _intervention_rows(session, context, academic_year_id, term_id))


@router.post("/interventions", response_model=InterventionRow, status_code=status.HTTP_201_CREATED)
async def create_intervention(
    payload: InterventionCreate,
    context: Annotated[TenantContext, Depends(require_roles(*support_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    if context.role == MembershipRole.STAFF:
        raise HTTPException(status_code=403, detail="Support staff can update actions assigned to them; school leaders create and assign plans")
    membership_id = await session.scalar(select(SchoolMembership.id).where(
        SchoolMembership.school_id == context.school_id,
        SchoolMembership.user_id == context.user_id,
        SchoolMembership.status == "active",
    ))
    enrollment = await session.execute(
        select(Student, StudentEnrollment.class_group_id)
        .join(StudentEnrollment, (StudentEnrollment.student_id == Student.id) & (StudentEnrollment.school_id == Student.school_id))
        .where(StudentEnrollment.school_id == context.school_id,
               StudentEnrollment.student_id == payload.student_id,
               StudentEnrollment.academic_year_id == payload.academic_year_id,
               StudentEnrollment.status == "active", Student.status == "active")
    )
    row = enrollment.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Active student enrollment not found for this academic year")
    student, class_group_id = row
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == class_group_id, ClassGroup.school_id == context.school_id,
    ))
    if context.role in (MembershipRole.TEACHER, MembershipRole.STAFF):
        assigned = await session.scalar(select(ClassSubjectAssignment.id).where(
            ClassSubjectAssignment.school_id == context.school_id,
            ClassSubjectAssignment.class_group_id == class_group_id,
            ClassSubjectAssignment.teacher_membership_id == membership_id,
        ).limit(1))
        if not assigned:
            raise HTTPException(status_code=403, detail="You can only create a follow-up for students in your assigned classes")
    term = None
    if payload.term_id:
        term = await session.scalar(select(AcademicTerm).where(
            AcademicTerm.id == payload.term_id, AcademicTerm.school_id == context.school_id,
            AcademicTerm.academic_year_id == payload.academic_year_id,
        ))
        if term is None:
            raise HTTPException(status_code=404, detail="Term not found in this academic year")
    academic_year = await session.scalar(select(AcademicYear).where(
        AcademicYear.id == payload.academic_year_id, AcademicYear.school_id == context.school_id,
    ))
    baseline_attendance, baseline_assessment = await _metric_snapshot(
        session, context.school_id, student.id, academic_year, term,
    )
    assignee_id = membership_id if context.role == MembershipRole.TEACHER else payload.assigned_to_membership_id
    if assignee_id:
        assignee = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.id == assignee_id, SchoolMembership.school_id == context.school_id,
            SchoolMembership.status == "active",
            SchoolMembership.role.in_((MembershipRole.TEACHER, MembershipRole.STAFF)),
        ))
        if assignee is None:
            raise HTTPException(status_code=422, detail="Choose an active teacher or support staff member at this school")
    elif context.role == MembershipRole.TEACHER:
        raise HTTPException(status_code=422, detail="A teacher follow-up must be assigned to its teacher")
    intervention = StudentSupportIntervention(
        school_id=context.school_id, student_id=student.id,
        academic_year_id=payload.academic_year_id, term_id=term.id if term else None,
        created_by_membership_id=membership_id, assigned_to_membership_id=assignee_id,
        category=payload.category, title=payload.title, action=payload.action,
        follow_up_on=payload.follow_up_on,
        baseline_attendance_rate=baseline_attendance,
        baseline_assessment_average=baseline_assessment,
        latest_attendance_rate=baseline_attendance,
        latest_assessment_average=baseline_assessment,
    )
    session.add(intervention)
    await session.flush()
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="student_support.intervention_created", resource_type="student_support_intervention", resource_id=intervention.id))
    await session.commit()
    rows = await session.execute(
        select(StudentSupportIntervention, Student.first_name, Student.last_name, Student.admission_number,
               ClassGroup.name, User.display_name)
        .join(Student, Student.id == StudentSupportIntervention.student_id)
        .join(StudentEnrollment, (StudentEnrollment.student_id == Student.id)
              & (StudentEnrollment.school_id == Student.school_id)
              & (StudentEnrollment.academic_year_id == StudentSupportIntervention.academic_year_id))
        .join(ClassGroup, ClassGroup.id == StudentEnrollment.class_group_id)
        .outerjoin(SchoolMembership, SchoolMembership.id == StudentSupportIntervention.assigned_to_membership_id)
        .outerjoin(User, User.id == SchoolMembership.user_id)
        .where(StudentSupportIntervention.id == intervention.id,
               StudentSupportIntervention.school_id == context.school_id)
    )
    return _intervention_response(rows.all())[0]


@router.patch("/interventions/{intervention_id}", response_model=InterventionRow)
async def update_intervention(
    intervention_id: UUID,
    payload: InterventionUpdate,
    context: Annotated[TenantContext, Depends(require_roles(*support_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    intervention = await session.scalar(select(StudentSupportIntervention).where(
        StudentSupportIntervention.id == intervention_id,
        StudentSupportIntervention.school_id == context.school_id,
    ).with_for_update())
    if intervention is None:
        raise HTTPException(status_code=404, detail="Intervention not found")
    if context.role in (MembershipRole.TEACHER, MembershipRole.STAFF):
        membership_id = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.user_id == context.user_id,
            SchoolMembership.status == "active",
        ))
        if intervention.assigned_to_membership_id != membership_id:
            raise HTTPException(status_code=403, detail="Only the assigned staff member can update this follow-up")
        if "assigned_to_membership_id" in payload.model_fields_set:
            raise HTTPException(status_code=403, detail="Only school leaders can reassign a follow-up")
    if "assigned_to_membership_id" in payload.model_fields_set:
        if payload.assigned_to_membership_id is None:
            intervention.assigned_to_membership_id = None
        else:
            assignee = await session.scalar(select(SchoolMembership.id).where(
                SchoolMembership.id == payload.assigned_to_membership_id,
                SchoolMembership.school_id == context.school_id,
                SchoolMembership.status == "active",
                SchoolMembership.role.in_((MembershipRole.TEACHER, MembershipRole.STAFF)),
            ))
            if assignee is None:
                raise HTTPException(status_code=422, detail="Choose an active teacher or support staff member at this school")
            intervention.assigned_to_membership_id = assignee
    if payload.status is not None:
        intervention.status = payload.status
        intervention.completed_at = datetime.now().astimezone() if payload.status == "completed" else None
    if "follow_up_on" in payload.model_fields_set:
        intervention.follow_up_on = payload.follow_up_on
    if "outcome" in payload.model_fields_set:
        intervention.outcome = payload.outcome
    academic_year = await session.scalar(select(AcademicYear).where(
        AcademicYear.id == intervention.academic_year_id, AcademicYear.school_id == context.school_id,
    ))
    term = await session.scalar(select(AcademicTerm).where(
        AcademicTerm.school_id == context.school_id,
        AcademicTerm.academic_year_id == intervention.academic_year_id,
        AcademicTerm.id == intervention.term_id,
    )) if intervention.term_id else None
    latest_attendance, latest_assessment = await _metric_snapshot(
        session, context.school_id, intervention.student_id, academic_year, term,
    )
    intervention.latest_attendance_rate = latest_attendance
    intervention.latest_assessment_average = latest_assessment
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="student_support.intervention_updated", resource_type="student_support_intervention", resource_id=intervention.id))
    await session.commit()
    rows = await session.execute(
        select(StudentSupportIntervention, Student.first_name, Student.last_name, Student.admission_number,
               ClassGroup.name, User.display_name)
        .join(Student, Student.id == StudentSupportIntervention.student_id)
        .join(StudentEnrollment, (StudentEnrollment.student_id == Student.id)
              & (StudentEnrollment.school_id == Student.school_id)
              & (StudentEnrollment.academic_year_id == StudentSupportIntervention.academic_year_id))
        .join(ClassGroup, ClassGroup.id == StudentEnrollment.class_group_id)
        .outerjoin(SchoolMembership, SchoolMembership.id == StudentSupportIntervention.assigned_to_membership_id)
        .outerjoin(User, User.id == SchoolMembership.user_id)
        .where(StudentSupportIntervention.id == intervention.id,
               StudentSupportIntervention.school_id == context.school_id)
    )
    return _intervention_response(rows.all())[0]
