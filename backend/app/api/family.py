"""Parent-facing access to linked students and published academic reports."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.api.students import StudentResponse

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
