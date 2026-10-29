"""Parent-facing access to linked students and published academic reports."""
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.auth import TenantContext, require_roles
from app.api.students import StudentResponse
from app.db import get_session

router = APIRouter(prefix="/api/v1/family", tags=["family"])


async def _guardian_for_child(session: AsyncSession, context: TenantContext, student_id: UUID) -> models.Guardian:
    guardian = await session.scalar(select(models.Guardian).where(
        models.Guardian.school_id == context.school_id,
        models.Guardian.user_id == context.user_id,
    ))
    if guardian is None:
        raise HTTPException(status_code=404, detail="Guardian profile not found")
    linked = await session.scalar(select(models.StudentGuardian.id).where(
        models.StudentGuardian.school_id == context.school_id,
        models.StudentGuardian.guardian_id == guardian.id,
        models.StudentGuardian.student_id == student_id,
    ))
    if linked is None:
        raise HTTPException(status_code=403, detail="Not authorized for this student")
    return guardian


@router.get("/children", response_model=list[StudentResponse])
async def list_my_children(
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[StudentResponse]:
    guardian = await session.scalar(select(models.Guardian).where(
        models.Guardian.school_id == context.school_id, models.Guardian.user_id == context.user_id,
    ))
    if guardian is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guardian profile not found")
    children = (await session.scalars(
        select(models.Student).join(models.StudentGuardian,
            (models.StudentGuardian.student_id == models.Student.id)
            & (models.StudentGuardian.school_id == models.Student.school_id))
        .where(models.StudentGuardian.guardian_id == guardian.id,
               models.Student.school_id == context.school_id)
        .order_by(models.Student.last_name, models.Student.first_name)
    )).all()
    return [StudentResponse(
        id=child.id, admission_number=child.admission_number, first_name=child.first_name,
        last_name=child.last_name, date_of_birth=child.date_of_birth, status=child.status,
    ) for child in children]


@router.get("/report-cards/{student_id}")
async def child_report_cards(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    await _guardian_for_child(session, context, student_id)
    rows = (await session.execute(
        select(models.AcademicTerm.id, models.AcademicTerm.name, models.AcademicYear.name,
               models.ResultPublication.published_at, models.TermResult.aggregate_percent,
               models.TermResult.grade, models.TermResult.position)
        .join(models.AcademicYear, (models.AcademicYear.id == models.AcademicTerm.academic_year_id)
              & (models.AcademicYear.school_id == models.AcademicTerm.school_id))
        .join(models.ResultPublication, (models.ResultPublication.term_id == models.AcademicTerm.id)
              & (models.ResultPublication.school_id == models.AcademicTerm.school_id))
        .join(models.StudentEnrollment, (models.StudentEnrollment.school_id == models.ResultPublication.school_id)
              & (models.StudentEnrollment.academic_year_id == models.AcademicTerm.academic_year_id)
              & (models.StudentEnrollment.class_group_id == models.ResultPublication.class_group_id))
        .outerjoin(models.TermResult, (models.TermResult.school_id == models.StudentEnrollment.school_id)
                   & (models.TermResult.term_id == models.AcademicTerm.id)
                   & (models.TermResult.class_group_id == models.StudentEnrollment.class_group_id)
                   & (models.TermResult.student_id == student_id))
        .where(models.AcademicTerm.school_id == context.school_id,
               models.StudentEnrollment.student_id == student_id,
               models.StudentEnrollment.status == "active",
               models.ResultPublication.status == "published",
               models.ResultPublication.published_at.is_not(None))
        .order_by(models.AcademicTerm.starts_on.desc())
    )).all()
    return [{
        "term_id": term_id, "term_name": term_name, "academic_year_name": year_name,
        "published_at": published_at, "aggregate_percent": average, "grade": grade,
        "position": position,
    } for term_id, term_name, year_name, published_at, average, grade, position in rows]


@router.get("/report-cards/{student_id}/{term_id}")
async def child_report_card(
    student_id: UUID,
    term_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    await _guardian_for_child(session, context, student_id)
    # Share the exact published, tenant-scoped card shape used by the school UI.
    from app.api.results import get_report_card
    return await get_report_card(student_id, term_id, context, session)


@router.get("/results/{student_id}")
async def view_child_results(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Keep the original parent results link pointed at the latest published card."""
    await _guardian_for_child(session, context, student_id)
    term_id = await session.scalar(
        select(models.AcademicTerm.id)
        .join(models.ResultPublication, (models.ResultPublication.term_id == models.AcademicTerm.id)
              & (models.ResultPublication.school_id == models.AcademicTerm.school_id))
        .join(models.StudentEnrollment, (models.StudentEnrollment.school_id == models.ResultPublication.school_id)
              & (models.StudentEnrollment.academic_year_id == models.AcademicTerm.academic_year_id)
              & (models.StudentEnrollment.class_group_id == models.ResultPublication.class_group_id))
        .where(models.AcademicTerm.school_id == context.school_id,
               models.StudentEnrollment.student_id == student_id,
               models.StudentEnrollment.status == "active",
               models.ResultPublication.status == "published",
               models.ResultPublication.published_at.is_not(None))
        .order_by(models.AcademicTerm.starts_on.desc()).limit(1)
    )
    if term_id is None:
        raise HTTPException(status_code=404, detail="No published reports are available")
    from app.api.results import get_report_card
    card = await get_report_card(student_id, term_id, context, session)
    return card.model_dump(mode="json")


@router.get("/attendance/{student_id}")
async def child_attendance(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Return only attendance rows for a student linked to this guardian."""
    await _guardian_for_child(session, context, student_id)
    rows = (await session.execute(
        select(models.AttendanceRecord, models.AttendanceSession.attendance_date)
        .join(models.AttendanceSession,
              (models.AttendanceSession.id == models.AttendanceRecord.session_id)
              & (models.AttendanceSession.school_id == models.AttendanceRecord.school_id))
        .where(models.AttendanceRecord.school_id == context.school_id,
               models.AttendanceRecord.student_id == student_id)
        .order_by(models.AttendanceSession.attendance_date.desc())
        .limit(180)
    )).all()
    records = [{"date": attendance_date, "status": record.status, "note": record.note}
               for record, attendance_date in rows]
    counts = {key: sum(1 for record in records if record["status"] == key)
              for key in ("present", "absent", "late", "excused")}
    return {"records": records, "counts": counts, "total_recorded": len(records)}


@router.get("/weekly-summary/{student_id}")
async def child_weekly_summary(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Summarize this week's attendance and newly released assessment results."""
    await _guardian_for_child(session, context, student_id)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    monday = datetime.combine(week_start, time.min, tzinfo=UTC)
    tomorrow = datetime.combine(today + timedelta(days=1), time.min, tzinfo=UTC)
    attendance_rows = (await session.execute(
        select(models.AttendanceRecord.status, func.count())
        .join(models.AttendanceSession,
              (models.AttendanceSession.id == models.AttendanceRecord.session_id)
              & (models.AttendanceSession.school_id == models.AttendanceRecord.school_id))
        .where(models.AttendanceRecord.school_id == context.school_id,
               models.AttendanceRecord.student_id == student_id,
               models.AttendanceSession.attendance_date >= week_start,
               models.AttendanceSession.attendance_date <= today)
        .group_by(models.AttendanceRecord.status)
    )).all()
    attendance = {status: int(count) for status, count in attendance_rows}
    result_rows = (await session.execute(
        select(models.Assessment.title, models.Subject.name, models.AssessmentScore.score,
               models.Assessment.max_score, models.AssessmentScore.updated_at)
        .join(models.Assessment,
              (models.Assessment.id == models.AssessmentScore.assessment_id)
              & (models.Assessment.school_id == models.AssessmentScore.school_id))
        .join(models.Subject,
              (models.Subject.id == models.Assessment.subject_id)
              & (models.Subject.school_id == models.Assessment.school_id))
        .where(models.AssessmentScore.school_id == context.school_id,
               models.AssessmentScore.student_id == student_id,
               models.AssessmentScore.score.is_not(None),
               models.Assessment.status.in_(("returned", "approved")),
               models.AssessmentScore.updated_at >= monday,
               models.AssessmentScore.updated_at < tomorrow)
        .order_by(models.AssessmentScore.updated_at.desc())
        .limit(8)
    )).all()
    results = [{
        "title": title,
        "subject": subject,
        "score_percent": round(float(score / max_score * 100), 1) if max_score else None,
        "updated_at": updated_at,
    } for title, subject, score, max_score, updated_at in result_rows]
    average = round(sum(item["score_percent"] for item in results if item["score_percent"] is not None)
                    / max(sum(1 for item in results if item["score_percent"] is not None), 1), 1) if results else None
    return {
        "week_start": week_start,
        "week_end": today,
        "days_recorded": sum(attendance.values()),
        "attendance": {key: attendance.get(key, 0) for key in ("present", "late", "absent", "excused")},
        "results": results,
        "average_score_percent": average,
    }


@router.get("/fees/{student_id}")
async def child_fees(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Return the linked student's issued invoices and recorded payments."""
    await _guardian_for_child(session, context, student_id)
    invoices = (await session.execute(
        select(models.StudentInvoice, models.AcademicTerm.name, models.AcademicYear.name)
        .join(models.AcademicTerm,
              (models.AcademicTerm.id == models.StudentInvoice.term_id)
              & (models.AcademicTerm.school_id == models.StudentInvoice.school_id))
        .join(models.AcademicYear,
              (models.AcademicYear.id == models.StudentInvoice.academic_year_id)
              & (models.AcademicYear.school_id == models.StudentInvoice.school_id))
        .where(models.StudentInvoice.school_id == context.school_id,
               models.StudentInvoice.student_id == student_id,
               models.StudentInvoice.status != "void")
        .order_by(models.StudentInvoice.issued_on.desc())
    )).all()
    payments = (await session.scalars(
        select(models.Payment)
        .where(models.Payment.school_id == context.school_id,
               models.Payment.student_id == student_id,
               models.Payment.status == "recorded")
        .order_by(models.Payment.payment_date.desc(), models.Payment.created_at.desc())
    )).all()
    invoice_rows = [{
        "id": invoice.id, "invoice_number": invoice.invoice_number,
        "term_name": term_name, "academic_year_name": year_name,
        "issued_on": invoice.issued_on, "status": invoice.status,
        "total_amount": invoice.total_amount, "paid_amount": invoice.paid_amount,
        "balance": max(invoice.total_amount - invoice.paid_amount, 0),
    } for invoice, term_name, year_name in invoices]
    payment_rows = [{
        "id": payment.id, "receipt_number": payment.receipt_number,
        "amount": payment.amount, "method": payment.method,
        "reference": payment.reference, "payment_date": payment.payment_date,
        "status": payment.status,
    } for payment in payments]
    return {
        "currency": None,
        "invoices": invoice_rows,
        "payments": payment_rows,
        "invoiced_total": sum((row["total_amount"] for row in invoice_rows), 0),
        "paid_total": sum((row["paid_amount"] for row in invoice_rows), 0),
        "outstanding_total": sum((row["balance"] for row in invoice_rows), 0),
    }


@router.get("/timetable/{student_id}")
async def child_timetable(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    """Return the schedule for the student's current active enrollment."""
    await _guardian_for_child(session, context, student_id)
    enrollment = await session.scalar(
        select(models.StudentEnrollment)
        .join(models.AcademicYear,
              (models.AcademicYear.id == models.StudentEnrollment.academic_year_id)
              & (models.AcademicYear.school_id == models.StudentEnrollment.school_id))
        .where(models.StudentEnrollment.school_id == context.school_id,
               models.StudentEnrollment.student_id == student_id,
               models.StudentEnrollment.status == "active")
        .order_by(models.AcademicYear.starts_on.desc())
    )
    if enrollment is None:
        return []
    rows = (await session.execute(
        select(models.TimetableSlot, models.Subject, models.SchoolMembership, models.User)
        .join(models.Subject,
              (models.Subject.id == models.TimetableSlot.subject_id)
              & (models.Subject.school_id == models.TimetableSlot.school_id))
        .join(models.SchoolMembership,
              (models.SchoolMembership.id == models.TimetableSlot.teacher_membership_id)
              & (models.SchoolMembership.school_id == models.TimetableSlot.school_id))
        .join(models.User, models.User.id == models.SchoolMembership.user_id)
        .where(models.TimetableSlot.school_id == context.school_id,
               models.TimetableSlot.academic_year_id == enrollment.academic_year_id,
               models.TimetableSlot.class_group_id == enrollment.class_group_id)
        .order_by(models.TimetableSlot.day_of_week, models.TimetableSlot.starts_at)
    )).all()
    day_names = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
    return [{
        "id": slot.id, "day_of_week": slot.day_of_week,
        "day_name": day_names[slot.day_of_week], "subject_name": subject.name,
        "teacher_name": teacher.display_name,
        "starts_at": slot.starts_at.strftime("%H:%M"),
        "ends_at": slot.ends_at.strftime("%H:%M"), "room": slot.room,
    } for slot, subject, _membership, teacher in rows]


@router.get("/activities/{student_id}")
async def child_activities(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    """Daily school activities (tests, exercises, quizzes) for a linked child.

    Returns every assessment attached to the child's active class with that
    student's own score when one has been recorded, ordered by due date so the
    client can group them into overdue / today / upcoming / completed buckets.
    """
    await _guardian_for_child(session, context, student_id)
    rows = (await session.execute(
        select(models.Assessment, models.Subject.name, models.Subject.code,
               models.AssessmentScore.score, models.AssessmentScore.submission_status)
        .join(models.Subject, (models.Subject.id == models.Assessment.subject_id)
              & (models.Subject.school_id == models.Assessment.school_id))
        .join(models.StudentEnrollment,
              (models.StudentEnrollment.school_id == models.Assessment.school_id)
              & (models.StudentEnrollment.class_group_id == models.Assessment.class_group_id)
              & (models.StudentEnrollment.academic_year_id == models.Assessment.academic_year_id)
              & (models.StudentEnrollment.student_id == student_id)
              & (models.StudentEnrollment.status == "active"))
        .outerjoin(models.AssessmentScore,
                   (models.AssessmentScore.school_id == models.Assessment.school_id)
                   & (models.AssessmentScore.assessment_id == models.Assessment.id)
                   & (models.AssessmentScore.student_id == student_id))
        .where(models.Assessment.school_id == context.school_id)
        .order_by(models.Assessment.due_on.asc().nulls_last(), models.Assessment.created_at.desc())
        .limit(60)
    )).all()
    today = date.today()
    items: list[dict] = []
    for assessment, subject_name, subject_code, score, submission_status in rows:
        due_on = assessment.due_on
        if score is not None or submission_status in ("submitted", "excused"):
            state = "completed"
        elif due_on is None:
            state = "upcoming"
        elif due_on < today:
            state = "overdue"
        elif due_on == today:
            state = "due_today"
        elif (due_on - today).days <= 7:
            state = "due_soon"
        else:
            state = "upcoming"
        percent = None
        if score is not None and assessment.max_score > 0:
            percent = float(round(score / assessment.max_score * 100, 1))
        items.append({
            "id": assessment.id,
            "title": assessment.title,
            "category": assessment.category,
            "subject_name": subject_name,
            "subject_code": subject_code,
            "due_on": due_on,
            "status": assessment.status,
            "state": state,
            "max_score": assessment.max_score,
            "weight_percent": assessment.weight_percent,
            "score": score,
            "score_percent": percent,
            "submission_status": submission_status,
        })
    return items


@router.get("/events/{student_id}")
async def child_events(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(models.MembershipRole.PARENT))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    """Return future school-wide and current-class events for a linked child."""
    await _guardian_for_child(session, context, student_id)
    class_ids = select(models.StudentEnrollment.class_group_id).where(
        models.StudentEnrollment.school_id == context.school_id,
        models.StudentEnrollment.student_id == student_id,
        models.StudentEnrollment.status == "active",
    )
    events = (await session.scalars(
        select(models.AcademicCalendarEvent)
        .where(models.AcademicCalendarEvent.school_id == context.school_id,
               models.AcademicCalendarEvent.ends_on >= date.today(),
               or_(models.AcademicCalendarEvent.audience.in_(("all", "students", "parents")),
                   (models.AcademicCalendarEvent.audience == "class")
                   & models.AcademicCalendarEvent.class_group_id.in_(class_ids)))
        .order_by(models.AcademicCalendarEvent.starts_on)
        .limit(30)
    )).all()
    return [{"id": event.id, "title": event.title, "category": event.category,
             "starts_on": event.starts_on, "ends_on": event.ends_on,
             "description": event.description} for event in events]
