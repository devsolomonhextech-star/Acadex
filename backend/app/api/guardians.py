import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.email import send_email
from app.schemas import GuardianCreate, GuardianLinkResponse
from app.settings import get_settings

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


@router.post("/{guardian_id}/invite", status_code=status.HTTP_202_ACCEPTED)
async def invite_guardian(
    guardian_id: UUID,
    background: BackgroundTasks,
    context: TenantContext = Depends(require_roles("school_admin", "principal", "registrar")),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    guardian = await session.scalar(select(models.Guardian).where(
        models.Guardian.id == guardian_id, models.Guardian.school_id == context.school_id,
    ))
    if guardian is None:
        raise HTTPException(status_code=404, detail="Guardian not found")
    if not guardian.email:
        raise HTTPException(status_code=422, detail="Add an email address to this guardian before inviting them")
    if guardian.user_id is not None:
        raise HTTPException(status_code=409, detail="This guardian already has a parent account")
    matching_linked_guardian = await session.scalar(select(models.Guardian.id).where(
        models.Guardian.school_id == context.school_id,
        func.lower(models.Guardian.email) == guardian.email.casefold(),
        models.Guardian.user_id.is_not(None),
    ))
    if matching_linked_guardian:
        raise HTTPException(status_code=409, detail="This email is already linked to a parent account at the school")
    existing_user = await session.scalar(select(models.User).where(
        func.lower(models.User.email) == guardian.email.casefold(),
    ))
    if existing_user and await session.scalar(select(models.SchoolMembership.id).where(
        models.SchoolMembership.school_id == context.school_id,
        models.SchoolMembership.user_id == existing_user.id,
    )):
        raise HTTPException(status_code=409, detail="This email already has an account at the school")
    active_invite = await session.scalar(select(models.SchoolInvitation.id).where(
        models.SchoolInvitation.school_id == context.school_id,
        models.SchoolInvitation.email == guardian.email.casefold(),
        models.SchoolInvitation.role == models.MembershipRole.PARENT,
        models.SchoolInvitation.status == "pending",
        models.SchoolInvitation.expires_at > datetime.now(UTC),
    ))
    if active_invite:
        raise HTTPException(status_code=409, detail="An active parent invitation already exists for this email")
    school = await session.get(models.School, context.school_id)
    token = secrets.token_urlsafe(36)
    invite = models.SchoolInvitation(
        id=uuid4(), school_id=context.school_id, email=guardian.email.casefold(),
        display_name=f"{guardian.first_name} {guardian.last_name}".strip(),
        role=models.MembershipRole.PARENT, token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=datetime.now(UTC) + timedelta(days=7), created_by_user_id=context.user_id,
    )
    session.add(invite)
    session.add(models.AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
        action="parent.invitation_sent", resource_type="guardian", resource_id=guardian.id,
        details={"email": guardian.email, "delivery": "queued"}))
    await session.commit()
    link = f"{get_settings().frontend_url.rstrip('/')}/accept-invitation?token={token}"
    background.add_task(send_email, guardian.email, f"Connect with {school.name} on Acadex",
        f"Hello {guardian.first_name},\n\n{school.name} has invited you to Acadex Connect to follow your child’s school updates. Accept your invitation and create your parent account here:\n{link}\n\nThis link expires in seven days.")
    return {"message": "Parent invitation email queued", "email": guardian.email}


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
