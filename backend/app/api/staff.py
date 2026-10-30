"""School-scoped staff invitations with one-time, hashed invitation tokens."""
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, _front_link, _make_action_token, require_roles
from app.db import get_session
from app.email import send_email
from app.models import AuditEvent, ClassSubjectAssignment, MembershipRole, School, SchoolInvitation, SchoolMembership, User
from app.rate_limit import limit_signup
from app.security import hash_password
from app.settings import get_settings

router = APIRouter(prefix="/api/v1/staff", tags=["staff"])


class TeacherInvitationCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=160)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()


class TeacherInvitationResponse(BaseModel):
    id: UUID
    email: str
    role: str
    expires_at: datetime
    email_queued: bool


class InvitationAccept(BaseModel):
    token: str = Field(min_length=32, max_length=128)
    password: str | None = Field(default=None, min_length=12, max_length=128)


class InvitationAccepted(BaseModel):
    email: str
    school_name: str
    school_slug: str
    role: str
    message: str


@router.post("/invitations/teachers", response_model=TeacherInvitationResponse, status_code=status.HTTP_201_CREATED)
async def invite_teacher(
    payload: TeacherInvitationCreate,
    background: BackgroundTasks,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    existing_user = await session.scalar(select(User.id).where(User.email == str(payload.email)))
    if existing_user:
        member = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.user_id == existing_user,
        ))
        if member:
            raise HTTPException(status_code=409, detail="This person already has an account at your school")
    pending = await session.scalar(select(SchoolInvitation.id).where(
        SchoolInvitation.school_id == context.school_id,
        SchoolInvitation.email == str(payload.email),
        SchoolInvitation.status == "pending",
        SchoolInvitation.expires_at > datetime.now(UTC),
    ))
    if pending:
        raise HTTPException(status_code=409, detail="An unexpired invitation already exists for this email")
    raw_token = secrets.token_urlsafe(36)
    expires = datetime.now(UTC) + timedelta(days=7)
    invitation = SchoolInvitation(
        id=uuid4(), school_id=context.school_id, email=str(payload.email), display_name=payload.display_name.strip(),
        role=MembershipRole.TEACHER, token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
        expires_at=expires, created_by_user_id=context.user_id,
    )
    session.add(invitation)
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="staff.teacher_invited", resource_type="school_invitation", resource_id=invitation.id,
                           details={"email": invitation.email, "delivery": "queued"}))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Could not create this invitation") from None
    school = await session.get(School, context.school_id)
    link = f"{get_settings().frontend_url.rstrip('/')}/accept-invitation?token={raw_token}"
    background.add_task(send_email, invitation.email, f"You’re invited to {school.name} on Acadex",
        f"Hello {invitation.display_name},\n\nYou have been invited to join {school.name} as a teacher. Accept your invitation here:\n{link}\n\nThis link expires in seven days.")
    return TeacherInvitationResponse(id=invitation.id, email=invitation.email, role="teacher", expires_at=expires, email_queued=True)


@router.post("/invitations/support-staff", response_model=TeacherInvitationResponse, status_code=status.HTTP_201_CREATED)
async def invite_support_staff(
    payload: TeacherInvitationCreate,
    background: BackgroundTasks,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    existing_user = await session.scalar(select(User.id).where(User.email == str(payload.email)))
    if existing_user:
        member = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id, SchoolMembership.user_id == existing_user,
        ))
        if member:
            raise HTTPException(status_code=409, detail="This person already has an account at your school")
    pending = await session.scalar(select(SchoolInvitation.id).where(
        SchoolInvitation.school_id == context.school_id,
        SchoolInvitation.email == str(payload.email), SchoolInvitation.status == "pending",
        SchoolInvitation.expires_at > datetime.now(UTC),
    ))
    if pending:
        raise HTTPException(status_code=409, detail="An unexpired invitation already exists for this email")
    raw_token = secrets.token_urlsafe(36)
    expires = datetime.now(UTC) + timedelta(days=7)
    invitation = SchoolInvitation(
        id=uuid4(), school_id=context.school_id, email=str(payload.email),
        display_name=payload.display_name.strip(), role=MembershipRole.STAFF,
        token_hash=hashlib.sha256(raw_token.encode()).hexdigest(), expires_at=expires,
        created_by_user_id=context.user_id,
    )
    session.add(invitation)
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="staff.support_staff_invited", resource_type="school_invitation", resource_id=invitation.id,
                           details={"email": invitation.email, "delivery": "queued"}))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Could not create this invitation") from None
    school = await session.get(School, context.school_id)
    link = f"{get_settings().frontend_url.rstrip('/')}/accept-invitation?token={raw_token}"
    background.add_task(send_email, invitation.email, f"You’re invited to {school.name} on Acadex",
        f"Hello {invitation.display_name},\n\nYou have been invited to join {school.name} as support staff. Accept your invitation here:\n{link}\n\nThis link expires in seven days.")
    return TeacherInvitationResponse(id=invitation.id, email=invitation.email, role="staff", expires_at=expires, email_queued=True)


@router.post("/invitations/accept", response_model=InvitationAccepted, dependencies=[Depends(limit_signup)])
async def accept_invitation(payload: InvitationAccept, session: Annotated[AsyncSession, Depends(get_session)]):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    invitation = await session.scalar(select(SchoolInvitation).where(
        SchoolInvitation.token_hash == token_hash,
    ).with_for_update())
    now = datetime.now(UTC)
    if invitation is None or invitation.status != "pending" or invitation.expires_at <= now:
        raise HTTPException(status_code=400, detail="This invitation is invalid, expired, or already used")
    school = await session.scalar(select(School).where(School.id == invitation.school_id, School.status == "active"))
    if school is None:
        raise HTTPException(status_code=400, detail="This invitation is no longer available")
    user = await session.scalar(select(User).where(User.email == invitation.email).with_for_update())
    if user is None:
        if payload.password is None:
            raise HTTPException(status_code=422, detail="Choose a password to finish creating your account")
        user = User(email=invitation.email, display_name=invitation.display_name, password_hash=hash_password(payload.password))
        session.add(user)
        await session.flush()
    user.email_verified_at = user.email_verified_at or now
    member = await session.scalar(select(SchoolMembership.id).where(
        SchoolMembership.school_id == invitation.school_id, SchoolMembership.user_id == user.id,
    ))
    if member:
        invitation.status = "accepted"
        invitation.accepted_at = now
        await session.commit()
        raise HTTPException(status_code=409, detail="This account already belongs to the school")
    membership = SchoolMembership(id=uuid4(), school_id=invitation.school_id, user_id=user.id, role=invitation.role)
    session.add(membership)
    invitation.status = "accepted"
    invitation.accepted_at = now
    joined_action = {
        MembershipRole.STAFF: "staff.support_staff_joined",
        MembershipRole.PARENT: "parent.account_joined",
    }.get(invitation.role, "staff.teacher_joined")
    session.add(AuditEvent(school_id=invitation.school_id, actor_user_id=user.id,
                           action=joined_action, resource_type="school_membership", resource_id=membership.id,
                           details={"invitation_id": str(invitation.id), "role": invitation.role.value}))
    if invitation.role == MembershipRole.PARENT:
        from app.models import Guardian
        guardians = list(await session.scalars(select(Guardian).where(
            Guardian.school_id == invitation.school_id,
            func.lower(Guardian.email) == invitation.email.lower(),
        ).with_for_update()))
        if any(guardian.user_id not in (None, user.id) for guardian in guardians):
            raise HTTPException(status_code=409, detail="A matching guardian is already connected to another parent account")
        for guardian in guardians:
            guardian.user_id = user.id
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="This invitation has already been used") from None
    role_label = {MembershipRole.STAFF: "support staff", MembershipRole.PARENT: "parent"}.get(invitation.role, "teacher")
    return InvitationAccepted(email=user.email, school_name=school.name, school_slug=school.slug,
                              role=invitation.role.value,
                              message=f"Your {role_label} account is ready. Sign in with your email and password.")


class TeacherAdminResponse(BaseModel):
    membership_id: UUID
    user_id: UUID
    display_name: str
    email: str
    status: str
    class_count: int
    subject_count: int
    created_at: datetime


class TeacherCreate(BaseModel):
    display_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()

    @field_validator("display_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Name cannot be empty")
        return value


@router.get("/teachers", response_model=list[TeacherAdminResponse])
async def list_teachers_admin(
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Every active teacher in the school with their current teaching load."""
    rows = (await session.execute(
        select(SchoolMembership, User)
        .join(User, User.id == SchoolMembership.user_id)
        .where(
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.role == MembershipRole.TEACHER,
            SchoolMembership.status == "active",
            User.status == "active",
        ).order_by(User.display_name)
    )).all()
    if not rows:
        return []
    membership_ids = [membership.id for membership, _ in rows]
    load = await session.execute(
        select(
            ClassSubjectAssignment.teacher_membership_id,
            ClassSubjectAssignment.class_group_id,
            ClassSubjectAssignment.subject_id,
        ).where(
            ClassSubjectAssignment.school_id == context.school_id,
            ClassSubjectAssignment.teacher_membership_id.in_(membership_ids),
        )
    )
    classes: dict[UUID, set[UUID]] = {}
    subjects: dict[UUID, set[UUID]] = {}
    for teacher_id, group_id, subject_id in load.all():
        classes.setdefault(teacher_id, set()).add(group_id)
        subjects.setdefault(teacher_id, set()).add(subject_id)
    return [TeacherAdminResponse(
        membership_id=membership.id, user_id=user.id, display_name=user.display_name,
        email=user.email, status=membership.status,
        class_count=len(classes.get(membership.id, ())),
        subject_count=len(subjects.get(membership.id, ())),
        created_at=user.created_at,
    ) for membership, user in rows]


@router.post("/teachers", response_model=TeacherAdminResponse, status_code=status.HTTP_201_CREATED)
async def create_teacher(
    payload: TeacherCreate,
    background: BackgroundTasks,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Create a teacher account directly so the admin can hand over credentials."""
    existing = await session.scalar(select(User.id).where(User.email == str(payload.email)))
    if existing is not None:
        member = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id, SchoolMembership.user_id == existing))
        if member:
            raise HTTPException(status_code=409, detail="This person already has an account at your school")
    user = User(email=str(payload.email), display_name=payload.display_name, password_hash=hash_password(payload.password))
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="An account with that email already exists") from None
    membership = SchoolMembership(id=uuid4(), school_id=context.school_id, user_id=user.id, role=MembershipRole.TEACHER)
    session.add(membership)
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="staff.teacher_created", resource_type="school_membership", resource_id=membership.id))
    verify_token = _make_action_token(session, user, "email_verification", timedelta(hours=24))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Could not create this teacher account") from None
    link = _front_link("/verify-email", verify_token)
    background.add_task(send_email, user.email, "Verify your Acadex account",
        f"Hello {user.display_name},\n\nYour school created an Acadex teacher account for you. Verify your email before signing in:\n{link}\n\nThis link expires in 24 hours.")
    return TeacherAdminResponse(
        membership_id=membership.id, user_id=user.id, display_name=user.display_name,
        email=user.email, status=membership.status, class_count=0, subject_count=0,
        created_at=user.created_at,
    )
