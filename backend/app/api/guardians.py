from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.schemas import GuardianCreate, GuardianLinkResponse

router = APIRouter(prefix="/api/v1/guardians", tags=["guardians"])


class GuardianUpdate(BaseModel):
    """Editable guardian fields; omitted keys are left untouched."""

    model_config = ConfigDict(str_strip_whitespace=True)

    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    relationship: str | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def name_cannot_be_blank(cls, value: str | None) -> str | None:
        if value is not None and not value:
            raise ValueError("Name cannot be empty")
        return value


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


@router.patch("/{guardian_id}", response_model=GuardianLinkResponse)
async def update_guardian(
    guardian_id: UUID,
    payload: GuardianUpdate,
    context: TenantContext = Depends(require_roles("school_admin", "principal", "registrar")),
    session: AsyncSession = Depends(get_session),
) -> GuardianLinkResponse:
    """Edit one guardian's contact details from the student profile sidebar."""
    guardian = await session.get(models.Guardian, guardian_id)
    if guardian is None or guardian.school_id != context.school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guardian not found")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(guardian, field, value)

    link = await session.scalar(
        select(models.StudentGuardian)
        .where(
            models.StudentGuardian.school_id == context.school_id,
            models.StudentGuardian.guardian_id == guardian.id,
        )
        .order_by(models.StudentGuardian.is_primary.desc())
        .limit(1)
    )
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guardian is not linked to a student")

    await session.commit()
    await session.refresh(guardian)
    await session.refresh(link)
    return GuardianLinkResponse(
        guardian_id=guardian.id,
        student_id=link.student_id,
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
