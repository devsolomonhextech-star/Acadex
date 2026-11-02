"""Evidence-backed insights for parents ("Acadex Parent Intelligence").

Every insight is a deterministic summary of rows the school actually recorded:
attendance registers, graded assessments, open assignments and issued invoices.
Nothing is inferred from missing data — a day with no attendance record is
never counted as an absence, and a subject with fewer than two graded pieces of
work is never given a trend. Each insight carries the evidence behind it so a
parent can see *why* Acadex is saying it.
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models

CURRENCY = "GHS"
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

# A trend needs this many recorded days/scores on each side of the comparison.
MIN_MONTH_RECORDS = 3
MIN_SUBJECT_SCORES = 2
# Percentage-point change before a trend is worth telling a parent about.
TREND_POINTS = 10
TREND_WINDOW_DAYS = 42  # six weeks
DUE_WINDOW_DAYS = 2  # today and the next two days
MIN_FULL_ATTENDANCE_DAYS = 5
MAX_INSIGHTS = 6


@dataclass(frozen=True)
class Insight:
    kind: str
    tone: str  # "attention" | "positive" | "neutral"
    title: str
    detail: str
    evidence: str
    source: str
    link: str
    priority: int


def _rate(rows: list[tuple[date, str]]) -> tuple[float, int, int]:
    """Attended (present or late) share of recorded days, as a fraction."""
    recorded = len(rows)
    if not recorded:
        return 0.0, 0, 0
    attended = sum(1 for _day, status in rows if status in ("present", "late"))
    return attended / recorded, attended, recorded


def _month_name(day: date) -> str:
    return MONTHS[day.month - 1]


def _friendly_date(day: date) -> str:
    return f"{WEEKDAYS[day.weekday()][:3]} {day.day} {_month_name(day)[:3]}"


def _join_words(parts: list[str]) -> str:
    if len(parts) <= 1:
        return "".join(parts)
    return f"{', '.join(parts[:-1])} and {parts[-1]}"


async def _attendance_insights(
    session: AsyncSession,
    *,
    school_id: UUID,
    student: models.Student,
    today: date,
) -> list[Insight]:
    month_start = today.replace(day=1)
    previous_start = (month_start - timedelta(days=1)).replace(day=1)
    rows = (await session.execute(
        select(models.AttendanceSession.attendance_date, models.AttendanceRecord.status)
        .join(models.AttendanceSession,
              (models.AttendanceSession.id == models.AttendanceRecord.session_id)
              & (models.AttendanceSession.school_id == models.AttendanceRecord.school_id))
        .where(models.AttendanceRecord.school_id == school_id,
               models.AttendanceRecord.student_id == student.id,
               models.AttendanceSession.attendance_date >= previous_start,
               models.AttendanceSession.attendance_date <= today)
        .order_by(models.AttendanceSession.attendance_date)
    )).all()
    if not rows:
        return []

    current = [(day, status) for day, status in rows if day >= month_start]
    previous = [(day, status) for day, status in rows if day < month_start]
    month = _month_name(today)
    link = f"/attendance?student_id={student.id}"
    insights: list[Insight] = []

    # 1. A repeated weekday absence is more actionable than a raw absence count.
    absences_by_weekday: dict[int, list[date]] = defaultdict(list)
    for day, status in current:
        if status == "absent":
            absences_by_weekday[day.weekday()].append(day)
    if absences_by_weekday:
        weekday, dates = max(absences_by_weekday.items(), key=lambda item: (len(item[1]), -item[0]))
        if len(dates) >= 2:
            label = WEEKDAYS[weekday]
            insights.append(Insight(
                kind="attendance_weekday_pattern",
                tone="attention",
                title=f"Missed {len(dates)} {label}s this month",
                detail=(
                    f"{student.first_name} was recorded absent on "
                    f"{_join_words([_friendly_date(day) for day in dates])}."
                ),
                evidence=f"{len(current)} attendance records in {month}.",
                source="Attendance register",
                link=link,
                priority=10,
            ))

    # 2. Month-over-month direction, only when both months were actually marked.
    if len(current) >= MIN_MONTH_RECORDS and len(previous) >= MIN_MONTH_RECORDS:
        current_rate, attended, recorded = _rate(current)
        previous_rate, previous_attended, previous_recorded = _rate(previous)
        delta = round((current_rate - previous_rate) * 100)
        evidence = f"{recorded + previous_recorded} attendance records across {month} and {_month_name(previous_start)}."
        if delta <= -TREND_POINTS:
            insights.append(Insight(
                kind="attendance_declined",
                tone="attention",
                title=f"Attendance is down {abs(delta)} points on last month",
                detail=(
                    f"Attended {attended} of {recorded} recorded days in {month}, compared with "
                    f"{previous_attended} of {previous_recorded} in {_month_name(previous_start)}."
                ),
                evidence=evidence,
                source="Attendance register",
                link=link,
                priority=15,
            ))
        elif delta >= TREND_POINTS:
            insights.append(Insight(
                kind="attendance_improved",
                tone="positive",
                title=f"Attendance is up {delta} points on last month",
                detail=(
                    f"Attended {attended} of {recorded} recorded days in {month}, compared with "
                    f"{previous_attended} of {previous_recorded} in {_month_name(previous_start)}."
                ),
                evidence=evidence,
                source="Attendance register",
                link=link,
                priority=65,
            ))

    # 3. Full attendance is worth acknowledging, not just problems.
    current_rate, attended, recorded = _rate(current)
    if recorded >= MIN_FULL_ATTENDANCE_DAYS and attended == recorded:
        insights.append(Insight(
            kind="attendance_full",
            tone="positive",
            title=f"Full attendance in {month} so far",
            detail=f"Present or on time for all {recorded} recorded days this month.",
            evidence=f"{recorded} attendance records in {month}.",
            source="Attendance register",
            link=link,
            priority=60,
        ))

    return insights


async def _assignment_insights(
    session: AsyncSession,
    *,
    school_id: UUID,
    student: models.Student,
    today: date,
) -> list[Insight]:
    rows = (await session.execute(
        select(models.Assessment.title, models.Subject.name, models.Assessment.due_on,
               models.AssessmentScore.score, models.AssessmentScore.submission_status)
        .join(models.Subject,
              (models.Subject.id == models.Assessment.subject_id)
              & (models.Subject.school_id == models.Assessment.school_id))
        .join(models.StudentEnrollment,
              (models.StudentEnrollment.school_id == models.Assessment.school_id)
              & (models.StudentEnrollment.class_group_id == models.Assessment.class_group_id)
              & (models.StudentEnrollment.academic_year_id == models.Assessment.academic_year_id)
              & (models.StudentEnrollment.student_id == student.id)
              & (models.StudentEnrollment.status == "active"))
        .outerjoin(models.AssessmentScore,
                   (models.AssessmentScore.school_id == models.Assessment.school_id)
                   & (models.AssessmentScore.assessment_id == models.Assessment.id)
                   & (models.AssessmentScore.student_id == student.id))
        .where(models.Assessment.school_id == school_id,
               models.Assessment.status.in_(("open", "submitted")),
               models.Assessment.due_on.is_not(None),
               models.Assessment.due_on >= today,
               models.Assessment.due_on <= today + timedelta(days=DUE_WINDOW_DAYS))
        .order_by(models.Assessment.due_on)
    )).all()

    pending = [
        (title, subject, due_on)
        for title, subject, due_on, score, submission_status in rows
        if score is None and (submission_status or "not_recorded") not in ("submitted", "excused")
    ]
    if not pending:
        return []

    def timing(day: date) -> str:
        if day == today:
            return "today"
        if day == today + timedelta(days=1):
            return "tomorrow"
        return f"in {(day - today).days} days"

    buckets = {timing(day) for _title, _subject, day in pending}
    count = len(pending)
    noun = "assignment" if count == 1 else "assignments"
    if len(buckets) == 1:
        title = f"{count} {noun} due {buckets.pop()}"
    else:
        title = f"{count} {noun} due in the next {DUE_WINDOW_DAYS + 1} days"
    listed = [
        f"{title_text} ({subject}) due {timing(day)}"
        for title_text, subject, day in pending[:3]
    ]
    if count > len(listed):
        listed.append(f"{count - len(listed)} more")
    return [Insight(
        kind="assignments_due",
        tone="attention",
        title=title,
        detail=f"{_join_words(listed)}.",
        evidence=(
            f"{count} open assessments the school dated between "
            f"{_friendly_date(today)} and {_friendly_date(today + timedelta(days=DUE_WINDOW_DAYS))}."
        ),
        source="Class assessment list",
        link="/academics",
        priority=20,
    )]


async def _subject_insights(
    session: AsyncSession,
    *,
    school_id: UUID,
    student: models.Student,
    today: date,
) -> list[Insight]:
    rows = (await session.execute(
        select(models.Subject.name, models.AssessmentScore.score, models.Assessment.max_score,
               models.Assessment.due_on, models.Assessment.created_at)
        .join(models.Assessment,
              (models.Assessment.id == models.AssessmentScore.assessment_id)
              & (models.Assessment.school_id == models.AssessmentScore.school_id))
        .join(models.Subject,
              (models.Subject.id == models.Assessment.subject_id)
              & (models.Subject.school_id == models.Assessment.school_id))
        .where(models.AssessmentScore.school_id == school_id,
               models.AssessmentScore.student_id == student.id,
               models.AssessmentScore.score.is_not(None),
               models.Assessment.status.in_(("returned", "approved")))
        .order_by(models.AssessmentScore.updated_at.desc())
        .limit(160)
    )).all()
    if not rows:
        return []

    recent_start = today - timedelta(days=TREND_WINDOW_DAYS)
    previous_start = recent_start - timedelta(days=TREND_WINDOW_DAYS)
    recent: dict[str, list[float]] = defaultdict(list)
    earlier: dict[str, list[float]] = defaultdict(list)
    for subject, score, max_score, due_on, created_at in rows:
        if score is None or not max_score:
            continue
        percent = float(score) / float(max_score) * 100
        recorded_on = due_on or created_at.date()
        if recorded_on >= recent_start:
            recent[subject].append(percent)
        elif recorded_on >= previous_start:
            earlier[subject].append(percent)

    links = "/academics"
    subjects = set(recent) & set(earlier)
    movements: list[tuple[int, str, float, float, int, int]] = []
    for subject in subjects:
        if len(recent[subject]) < MIN_SUBJECT_SCORES or len(earlier[subject]) < MIN_SUBJECT_SCORES:
            continue
        recent_avg = sum(recent[subject]) / len(recent[subject])
        earlier_avg = sum(earlier[subject]) / len(earlier[subject])
        delta = round(recent_avg - earlier_avg)
        if abs(delta) < TREND_POINTS:
            continue
        movements.append((delta, subject, recent_avg, earlier_avg,
                          len(recent[subject]), len(earlier[subject])))

    insights: list[Insight] = []
    weeks = TREND_WINDOW_DAYS // 7
    for delta, subject, recent_avg, earlier_avg, recent_count, earlier_count in sorted(
        movements, key=lambda row: abs(row[0]), reverse=True
    )[:2]:
        improved = delta > 0
        insights.append(Insight(
            kind="subject_improved" if improved else "subject_declined",
            tone="positive" if improved else "attention",
            title=(
                f"{subject} performance has improved by {delta} points"
                if improved
                else f"{subject} performance has dropped {abs(delta)} points"
            ),
            detail=(
                f"Average {round(recent_avg)}% across {recent_count} graded assessments in the last "
                f"{weeks} weeks, compared with {round(earlier_avg)}% in the {weeks} weeks before."
            ),
            evidence=(
                f"{recent_count + earlier_count} graded assessments from the school's gradebook, "
                f"{_friendly_date(previous_start)} to {_friendly_date(today)}."
            ),
            source="Gradebook",
            link=links,
            priority=25 if not improved else 70,
        ))
    return insights


async def _fee_insights(
    session: AsyncSession,
    *,
    school_id: UUID,
    student: models.Student,
) -> list[Insight]:
    rows = (await session.execute(
        select(models.StudentInvoice.total_amount, models.StudentInvoice.paid_amount,
               models.AcademicTerm.name)
        .join(models.AcademicTerm,
              (models.AcademicTerm.id == models.StudentInvoice.term_id)
              & (models.AcademicTerm.school_id == models.StudentInvoice.school_id))
        .where(models.StudentInvoice.school_id == school_id,
               models.StudentInvoice.student_id == student.id,
               models.StudentInvoice.status != "void")
    )).all()
    if not rows:
        return []
    balances = [(max(total - paid, Decimal(0)), term) for total, paid, term in rows]
    outstanding = sum((balance for balance, _term in balances), Decimal(0))
    if outstanding <= 0:
        return []
    unpaid = [(balance, term) for balance, term in balances if balance > 0]
    terms = _join_words([term for _balance, term in unpaid])
    return [Insight(
        kind="fees_outstanding",
        tone="attention",
        title="School fees balance outstanding",
        detail=(
            f"{CURRENCY} {outstanding:,.2f} remains unpaid on {len(unpaid)} invoice"
            f"{'' if len(unpaid) == 1 else 's'} ({terms})."
        ),
        evidence=f"{len(rows)} issued invoice{'' if len(rows) == 1 else 's'} on the school's fee ledger.",
        source="Fee ledger",
        link=f"/fees?student_id={student.id}",
        priority=30,
    )]


async def insights_for_student(
    session: AsyncSession,
    *,
    school_id: UUID,
    student: models.Student,
    today: date | None = None,
) -> list[Insight]:
    """All verified insights for one student, most urgent first."""
    today = today or date.today()
    collected: list[Insight] = []
    collected.extend(await _attendance_insights(
        session, school_id=school_id, student=student, today=today,
    ))
    collected.extend(await _assignment_insights(
        session, school_id=school_id, student=student, today=today,
    ))
    collected.extend(await _subject_insights(
        session, school_id=school_id, student=student, today=today,
    ))
    collected.extend(await _fee_insights(session, school_id=school_id, student=student))
    collected.sort(key=lambda insight: (insight.priority, insight.title))
    return collected[:MAX_INSIGHTS]
