"""Weighted term aggregation, grade lookup, and publication rules.

Assessment weights are normalized over the approved assessments actually recorded
for a subject/term, so a school does not need its weights to sum to exactly 100.
All arithmetic uses Decimal; financial-style rounding is half-up to two places.
"""
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assessment,
    AssessmentScore,
    GradingBand,
    GradingScale,
    ResultPublication,
    Student,
    StudentEnrollment,
    Subject,
    TermResult,
    TermSubjectResult,
)

TWO_PLACES = Decimal("0.01")
ZERO = Decimal(0)
HUNDRED = Decimal(100)


class GradingScaleError(Exception):
    """Raised when a grading scale payload is structurally invalid."""


class PublicationError(Exception):
    """Raised when a publication transition violates a business rule."""

    def __init__(self, detail: str, status_code: int = 409):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class BandInput:
    min_percent: Decimal
    max_percent: Decimal
    grade: str
    points: Decimal | None
    description: str | None


@dataclass(frozen=True)
class SubjectTotal:
    subject_id: UUID
    weighted_total: Decimal
    grade: str | None
    points: Decimal | None
    assessment_count: int
    total_weight: Decimal


@dataclass(frozen=True)
class StudentTermTotal:
    student_id: UUID
    aggregate_percent: Decimal
    grade: str | None
    points: Decimal | None
    position: int | None


def quantize(value: Decimal) -> Decimal:
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def validate_bands(bands: list[BandInput]) -> list[BandInput]:
    """Require contiguous coverage from 0 to 100 with no overlaps or gaps."""
    if not bands:
        raise GradingScaleError("A grading scale needs at least one grade band")
    ordered = sorted(bands, key=lambda band: band.min_percent)
    if ordered[0].min_percent != ZERO:
        raise GradingScaleError("The lowest band must start at 0")
    if ordered[-1].max_percent != HUNDRED:
        raise GradingScaleError("The highest band must end at 100")
    previous_max: Decimal | None = None
    for band in ordered:
        if band.min_percent > band.max_percent:
            raise GradingScaleError("A band's minimum cannot exceed its maximum")
        if band.points is not None and band.points < ZERO:
            raise GradingScaleError("Grade points cannot be negative")
        if previous_max is not None and band.min_percent != previous_max + TWO_PLACES:
            raise GradingScaleError("Grade bands must be contiguous with no gaps or overlaps")
        previous_max = band.max_percent
    return ordered


def grade_for(percent: Decimal, bands: list[GradingBand]) -> tuple[str | None, Decimal | None]:
    """Return (grade, points) for a percentage using inclusive band bounds."""
    for band in bands:
        if band.min_percent <= percent <= band.max_percent:
            return band.grade, band.points
    return None, None


async def active_default_scale(session: AsyncSession, school_id: UUID) -> GradingScale | None:
    scale = await session.scalar(select(GradingScale).where(
        GradingScale.school_id == school_id,
        GradingScale.is_default.is_(True),
        GradingScale.status == "active",
    ))
    return scale


async def load_bands(session: AsyncSession, school_id: UUID, scale_id: UUID) -> list[GradingBand]:
    result = await session.execute(select(GradingBand).where(
        GradingBand.school_id == school_id, GradingBand.scale_id == scale_id,
    ).order_by(GradingBand.min_percent))
    return list(result.scalars())


async def is_published(session: AsyncSession, school_id: UUID, term_id: UUID, class_group_id: UUID) -> bool:
    status = await session.scalar(select(ResultPublication.status).where(
        ResultPublication.school_id == school_id,
        ResultPublication.term_id == term_id,
        ResultPublication.class_group_id == class_group_id,
    ))
    return status == "published"


async def _approved_assessments(
    session: AsyncSession, school_id: UUID, class_group_id: UUID, term_id: UUID,
) -> list[Assessment]:
    result = await session.execute(select(Assessment).where(
        Assessment.school_id == school_id,
        Assessment.class_group_id == class_group_id,
        Assessment.term_id == term_id,
        Assessment.status == "approved",
    ))
    return list(result.scalars())


async def _roster(
    session: AsyncSession, school_id: UUID, class_group_id: UUID, academic_year_id: UUID,
) -> list[Student]:
    result = await session.execute(
        select(Student)
        .join(StudentEnrollment, (StudentEnrollment.student_id == Student.id)
              & (StudentEnrollment.school_id == Student.school_id))
        .where(StudentEnrollment.school_id == school_id,
               StudentEnrollment.class_group_id == class_group_id,
               StudentEnrollment.academic_year_id == academic_year_id,
               StudentEnrollment.status == "active", Student.status == "active")
        .order_by(Student.last_name, Student.first_name, Student.admission_number)
    )
    return list(result.scalars())


async def compute_subject_totals(
    session: AsyncSession,
    school_id: UUID,
    class_group_id: UUID,
    academic_year_id: UUID,
    term_id: UUID,
    bands: list[GradingBand],
) -> tuple[dict[tuple[UUID, UUID], SubjectTotal], dict[UUID, Decimal]]:
    """Weighted totals per (student, subject) plus the weight sum per subject.

    Only approved assessments count. A student missing a score on any approved
    assessment is excluded from that subject until the score is recorded.
    """
    assessments = await _approved_assessments(session, school_id, class_group_id, term_id)
    subject_weights: dict[UUID, Decimal] = {}
    for assessment in assessments:
        subject_weights[assessment.subject_id] = (
            subject_weights.get(assessment.subject_id, ZERO) + assessment.weight_percent
        )
    totals: dict[tuple[UUID, UUID], SubjectTotal] = {}
    if not assessments:
        return totals, subject_weights

    score_rows = await session.execute(
        select(AssessmentScore.assessment_id, AssessmentScore.student_id, AssessmentScore.score)
        .where(AssessmentScore.school_id == school_id,
               AssessmentScore.assessment_id.in_([a.id for a in assessments]))
    )
    scores: dict[tuple[UUID, UUID], Decimal | None] = {}
    for assessment_id, student_id, score in score_rows.all():
        scores[(assessment_id, student_id)] = score

    by_subject: dict[UUID, list[Assessment]] = {}
    for assessment in assessments:
        by_subject.setdefault(assessment.subject_id, []).append(assessment)

    roster = await _roster(session, school_id, class_group_id, academic_year_id)
    for subject_id, subject_assessments in by_subject.items():
        weight_sum = subject_weights[subject_id]
        for student in roster:
            earned = ZERO
            counted = 0
            complete = True
            for assessment in subject_assessments:
                score = scores.get((assessment.id, student.id))
                if score is None:
                    if assessment.weight_percent > ZERO:
                        complete = False
                    continue
                earned += (score / assessment.max_score) * assessment.weight_percent
                counted += 1
            if not complete or counted == 0:
                continue
            if weight_sum > ZERO:
                weighted_total = quantize(earned * HUNDRED / weight_sum)
            else:
                # No weights configured: plain mean of percentage scores.
                percentages = [scores[(a.id, student.id)] / a.max_score
                               for a in subject_assessments
                               if scores.get((a.id, student.id)) is not None]
                weighted_total = quantize(sum(percentages, ZERO) * HUNDRED / Decimal(counted))
            grade, points = grade_for(weighted_total, bands)
            totals[(student.id, subject_id)] = SubjectTotal(
                subject_id=subject_id, weighted_total=weighted_total, grade=grade,
                points=points, assessment_count=counted, total_weight=quantize(weight_sum),
            )
    return totals, subject_weights


def build_student_totals(
    subject_totals: dict[tuple[UUID, UUID], SubjectTotal],
    subject_weights: dict[UUID, Decimal],
    bands: list[GradingBand],
    include_positions: bool,
) -> list[StudentTermTotal]:
    """Aggregate each student's subject totals into a weighted term mean.

    Subjects count proportionally to their configured weight so a heavier subject
    influences the term aggregate accordingly.
    """
    per_student: dict[UUID, list[tuple[Decimal, Decimal]]] = {}
    for (student_id, _subject_id), total in subject_totals.items():
        weight = subject_weights.get(total.subject_id, ZERO)
        if weight <= ZERO:
            weight = Decimal(1)
        per_student.setdefault(student_id, []).append((total.weighted_total, weight))
    results: list[StudentTermTotal] = []
    for student_id, entries in per_student.items():
        weight_total = sum((weight for _, weight in entries), ZERO)
        aggregate = quantize(sum((value * weight for value, weight in entries), ZERO) / weight_total)
        grade, points = grade_for(aggregate, bands)
        results.append(StudentTermTotal(
            student_id=student_id, aggregate_percent=aggregate, grade=grade, points=points, position=None,
        ))
    if include_positions:
        # Standard competition ranking: equal aggregates share the better position.
        ordered = sorted(results, key=lambda row: (-row.aggregate_percent, str(row.student_id)))
        previous_value: Decimal | None = None
        previous_position = 0
        rebuilt: list[StudentTermTotal] = []
        for index, row in enumerate(ordered, start=1):
            position = index if row.aggregate_percent != previous_value else previous_position
            previous_value, previous_position = row.aggregate_percent, position
            rebuilt.append(StudentTermTotal(
                student_id=row.student_id, aggregate_percent=row.aggregate_percent,
                grade=row.grade, points=row.points, position=position,
            ))
        results = rebuilt
    return results


async def replace_computed_results(
    session: AsyncSession,
    school_id: UUID,
    academic_year_id: UUID,
    term_id: UUID,
    class_group_id: UUID,
    subject_totals: dict[tuple[UUID, UUID], SubjectTotal],
    student_totals: list[StudentTermTotal],
) -> None:
    await session.execute(delete(TermSubjectResult).where(
        TermSubjectResult.school_id == school_id,
        TermSubjectResult.term_id == term_id,
        TermSubjectResult.class_group_id == class_group_id,
    ))
    await session.execute(delete(TermResult).where(
        TermResult.school_id == school_id,
        TermResult.term_id == term_id,
        TermResult.class_group_id == class_group_id,
    ))
    now = datetime.now(UTC)
    for (student_id, subject_id), total in subject_totals.items():
        session.add(TermSubjectResult(
            id=uuid4(), school_id=school_id, academic_year_id=academic_year_id,
            term_id=term_id, class_group_id=class_group_id, subject_id=subject_id,
            student_id=student_id, weighted_total=total.weighted_total,
            grade=total.grade, points=total.points, assessment_count=total.assessment_count,
            total_weight=total.total_weight, computed_at=now,
        ))
    for total in student_totals:
        session.add(TermResult(
            id=uuid4(), school_id=school_id, academic_year_id=academic_year_id,
            term_id=term_id, class_group_id=class_group_id, student_id=total.student_id,
            aggregate_percent=total.aggregate_percent, grade=total.grade,
            points=total.points, position=total.position, computed_at=now,
        ))


async def missing_assessment_scores(
    session: AsyncSession,
    school_id: UUID,
    class_group_id: UUID,
    academic_year_id: UUID,
    term_id: UUID,
) -> list[str]:
    """Titles of approved weighted assessments missing at least one roster score."""
    assessments = [a for a in await _approved_assessments(session, school_id, class_group_id, term_id)
                   if a.weight_percent > ZERO]
    if not assessments:
        return []
    roster_ids = {s.id for s in await _roster(session, school_id, class_group_id, academic_year_id)}
    if not roster_ids:
        return []
    scored = await session.execute(select(AssessmentScore.assessment_id, AssessmentScore.student_id,
                                          AssessmentScore.score).where(
        AssessmentScore.school_id == school_id,
        AssessmentScore.assessment_id.in_([a.id for a in assessments]),
    ))
    scored_ids: dict[UUID, set[UUID]] = {}
    for assessment_id, student_id, score in scored.all():
        if score is not None:
            scored_ids.setdefault(assessment_id, set()).add(student_id)
    missing: list[str] = []
    for assessment in assessments:
        if roster_ids - scored_ids.get(assessment.id, set()):
            missing.append(assessment.title)
    return missing


async def require_computable(
    session: AsyncSession, school_id: UUID, term_id: UUID, class_group_id: UUID,
) -> None:
    if await is_published(session, school_id, term_id, class_group_id):
        raise PublicationError(
            "Results for this class and term are published. Withdraw the publication before recomputing.",
        )


async def subject_names(session: AsyncSession, school_id: UUID) -> dict[UUID, tuple[str, str]]:
    result = await session.execute(select(Subject.id, Subject.name, Subject.code).where(
        Subject.school_id == school_id,
    ))
    return {row[0]: (row[1], row[2]) for row in result.all()}
