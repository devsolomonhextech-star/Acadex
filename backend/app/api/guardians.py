from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.schemas import GuardianCreate, GuardianLinkResponse

router = APIRouter(prefix="/api/v1/guardians", tags=["guardians"])


@router.post("", response_model=GuardianLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_guardian(
    payload: GuardianCreate,
    context: TenantContext = Depends(require_roles("school_admin", "principal", "registrar")),
    session: AsyncSession = Depends(get_session),
) -> GuardianLinkResponse:
    # verify student belongs to school
    student = await session.get(models.Student, payload.student_id)
    if not student or student.school_id != context.school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    guardian = models.Guardian(
        school_id=context.school_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=str(payload.email) if payload.email else None,
        phone=payload.phone,
        relationship=payload.relationship,
        address=payload.address,
    )
    session.add(guardian)
    await session.flush()

    link = models.StudentGuardian(
        school_id=context.school_id,
        student_id=student.id,
        guardian_id=guardian.id,
        is_primary=payload.is_primary,
    )
    session.add(link)
    await session.commit()
    await session.refresh(guardian)

    return GuardianLinkResponse(
        guardian_id=guardian.id,
        student_id=student.id,
        first_name=guardian.first_name,
        last_name=guardian.last_name,
        email=guardian.email,
        phone=guardian.phone,
        relationship=guardian.relationship,
        is_primary=link.is_primary,
    )


@router.get("/student/{student_id}", response_model=list[GuardianLinkResponse])
async def list_guardians_for_student(
    student_id: UUID,
    context: TenantContext = Depends(require_roles("school_admin", "principal", "registrar", "teacher")),
    session: AsyncSession = Depends(get_session),
) -> list[GuardianLinkResponse]:
    student = await session.get(models.Student, student_id)
    if not student or student.school_id != context.school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    result = await session.execute(
        select(models.StudentGuardian, models.Guardian)
        .join(models.Guardian, models.Guardian.id == models.StudentGuardian.guardian_id)
        .where(
            models.StudentGuardian.school_id == context.school_id,
            models.StudentGuardian.student_id == student_id,
        )
    )
    rows = []
    for link, guardian in result.all():
        rows.append(
            GuardianLinkResponse(
                guardian_id=guardian.id,
                student_id=student_id,
                first_name=guardian.first_name,
                last_name=guardian.last_name,
                email=guardian.email,
                phone=guardian.phone,
                relationship=guardian.relationship,
                is_primary=link.is_primary,
            )
        )
    return rows
