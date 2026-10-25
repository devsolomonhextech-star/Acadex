from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.api.students import StudentResponse

router = APIRouter(prefix="/api/v1/family", tags=["family"])


@router.get("/children", response_model=list[StudentResponse])
async def list_my_children(
    context: TenantContext = Depends(require_roles("parent")),
    session: AsyncSession = Depends(get_session),
) -> list[StudentResponse]:
    result = await session.execute(
        select(models.Guardian).where(
            models.Guardian.school_id == context.school_id,
            models.Guardian.user_id == context.user_id,
        )
    )
    guardian = result.scalar_one_or_none()
    if not guardian:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guardian profile not found")

    result = await session.execute(
        select(models.Student)
        .join(models.StudentGuardian, models.StudentGuardian.student_id == models.Student.id)
        .where(
            models.StudentGuardian.guardian_id == guardian.id,
            models.Student.school_id == context.school_id,
        )
    )
    children = result.scalars().all()
    return [
        StudentResponse(
            id=c.id,
            admission_number=c.admission_number,
            first_name=c.first_name,
            last_name=c.last_name,
            date_of_birth=c.date_of_birth,
            status=c.status,
        )
        for c in children
    ]


@router.get("/results/{student_id}")
async def view_child_results(
    student_id: UUID,
    context: TenantContext = Depends(require_roles("parent")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    # verify linkage
    result = await session.execute(
        select(models.Guardian).where(
            models.Guardian.school_id == context.school_id,
            models.Guardian.user_id == context.user_id,
        )
    )
    guardian = result.scalar_one_or_none()
    if not guardian:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guardian profile not found")

    link = await session.execute(
        select(models.StudentGuardian).where(
            models.StudentGuardian.guardian_id == guardian.id,
            models.StudentGuardian.student_id == student_id,
        )
    )
    if not link.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this student")

    # get published results for the student's enrollment
    from app.domain import results as results_domain

    enrollment = await session.execute(
        select(models.StudentEnrollment)
        .where(
            models.StudentEnrollment.student_id == student_id,
            models.StudentEnrollment.school_id == context.school_id,
            models.StudentEnrollment.status == "active",
        )
        .order_by(models.StudentEnrollment.enrolled_on.desc())
    )
    enr = enrollment.scalars().first()
    if not enr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active enrollment")

    publication = await session.execute(
        select(models.ClassTermPublication).where(
            models.ClassTermPublication.school_id == context.school_id,
            models.ClassTermPublication.class_group_id == enr.class_group_id,
            models.ClassTermPublication.term_id == enr.academic_year_id,  # need term; let's find proper term
        )
    )
    # simpler - try to find by class/group
    # just get published term results for this student
    pub_result = await session.execute(
        select(models.ClassTermPublication)
        .join(models.AcademicTerm, models.AcademicTerm.id == models.ClassTermPublication.term_id)
        .where(
            models.ClassTermPublication.school_id == context.school_id,
            models.ClassTermPublication.class_group_id == enr.class_group_id,
            models.ClassTermPublication.published_at.is_not(None),
        )
        .order_by(models.AcademicTerm.ordinal.desc())
    )
    pub = pub_result.scalars().first()
    if not pub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No published results")

    report = await results_domain.generate_report_card(session=session, school_id=context.school_id, student_id=student_id, publication_id=pub.id)
    return report
