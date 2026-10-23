import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID, uuid4

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import AuditEvent, MembershipRole, RefreshSession, School, SchoolMembership, User
from app.rate_limit import limit_login, limit_signup
from app.schemas import LoginRequest, SchoolRegistration, TokenResponse, UserContextResponse
from app.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    new_csrf_token,
    new_refresh_token,
    verify_password,
)
from app.settings import get_settings

router = APIRouter(prefix="/api/v1", tags=["identity"])
bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class TenantContext:
    user_id: UUID
    school_id: UUID
    role: MembershipRole


def set_refresh_cookies(response: Response, raw_token: str, csrf: str, expires: datetime) -> None:
    settings = get_settings()
    common = {"secure": settings.cookie_secure, "samesite": "lax", "expires": expires}
    response.set_cookie("schoolos_refresh", raw_token, httponly=True, path="/api/v1/auth", **common)
    response.set_cookie("schoolos_csrf", csrf, httponly=False, path="/", **common)


def clear_refresh_cookies(response: Response) -> None:
    settings = get_settings()
    common = {"secure": settings.cookie_secure, "samesite": "lax"}
    response.delete_cookie("schoolos_refresh", httponly=True, path="/api/v1/auth", **common)
    response.delete_cookie("schoolos_csrf", httponly=False, path="/", **common)


async def current_tenant(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TenantContext:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = decode_access_token(credentials.credentials)
        user_id, school_id = UUID(claims["sub"]), UUID(claims["school_id"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired session", headers={"WWW-Authenticate": "Bearer"}) from None
    result = await session.execute(
        select(SchoolMembership)
        .join(School, SchoolMembership.school_id == School.id)
        .join(User, SchoolMembership.user_id == User.id)
        .where(
            SchoolMembership.user_id == user_id,
            SchoolMembership.school_id == school_id,
            SchoolMembership.status == "active",
            School.status == "active",
            User.status == "active",
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=403, detail="Active school membership required")
    return TenantContext(user_id=user_id, school_id=school_id, role=membership.role)


def require_roles(*roles: MembershipRole):
    async def dependency(context: Annotated[TenantContext, Depends(current_tenant)]) -> TenantContext:
        if context.role not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission to perform this action")
        return context
    return dependency


@router.post("/onboarding/schools", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limit_signup)])
async def register_school(payload: SchoolRegistration, session: Annotated[AsyncSession, Depends(get_session)]) -> dict[str, str]:
    """Create a school and its initial administrator as one transaction."""
    email = str(payload.email)
    existing = await session.execute(select(User.id).where(User.email == email))
    slug_exists = await session.execute(select(School.id).where(School.slug == payload.school_slug))
    if existing.scalar_one_or_none() or slug_exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="That email address or school address is already registered")
    school = School(name=payload.school_name.strip(), slug=payload.school_slug)
    user = User(email=email, display_name=payload.administrator_name.strip(), password_hash=hash_password(payload.password))
    session.add_all([school, user])
    await session.flush()
    session.add(SchoolMembership(school_id=school.id, user_id=user.id, role=MembershipRole.SCHOOL_ADMIN))
    session.add(AuditEvent(school_id=school.id, actor_user_id=user.id, action="school.registered", resource_type="school", resource_id=school.id))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="That email address or school address is already registered") from None
    return {"school_id": str(school.id), "school_slug": school.slug, "status": "active", "message": "School created. Sign in with your administrator account."}


@router.post("/auth/login", response_model=TokenResponse, dependencies=[Depends(limit_login)])
async def login(payload: LoginRequest, response: Response, session: Annotated[AsyncSession, Depends(get_session)]) -> TokenResponse:
    school_result = await session.execute(select(School).where(School.slug == payload.school_slug))
    school = school_result.scalar_one_or_none()
    user_result = await session.execute(select(User).where(User.email == str(payload.email)))
    user = user_result.scalar_one_or_none()
    # Verify a fixed-cost dummy hash on unknown users to reduce account enumeration timing.
    valid_password = verify_password(payload.password, user.password_hash if user else _dummy_password_hash())
    if not valid_password or user is None or school is None or user.status != "active" or school.status != "active":
        raise HTTPException(status_code=401, detail="Invalid school, email, or password")
    membership_result = await session.execute(select(SchoolMembership).where(
        SchoolMembership.user_id == user.id, SchoolMembership.school_id == school.id, SchoolMembership.status == "active",
    ))
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=401, detail="Invalid school, email, or password")
    settings = get_settings()
    now = datetime.now(UTC)
    expires = now + timedelta(days=settings.refresh_token_days)
    raw_refresh = new_refresh_token()
    csrf = new_csrf_token()
    session.add(RefreshSession(user_id=user.id, school_id=school.id, family_id=uuid4(), token_hash=hash_refresh_token(raw_refresh), expires_at=expires))
    session.add(AuditEvent(school_id=school.id, actor_user_id=user.id, action="auth.login", resource_type="user", resource_id=user.id))
    await session.commit()
    response.headers["Cache-Control"] = "no-store"
    set_refresh_cookies(response, raw_refresh, csrf, expires)
    return TokenResponse(access_token=create_access_token(user.id, school.id, membership.role.value), expires_in=settings.access_token_minutes * 60, csrf_token=csrf)


_DUMMY_HASH: str | None = None


def _dummy_password_hash() -> str:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(secrets.token_urlsafe(32))
    return _DUMMY_HASH


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, session: Annotated[AsyncSession, Depends(get_session)]) -> TokenResponse:
    raw_token = request.cookies.get("schoolos_refresh")
    csrf_cookie = request.cookies.get("schoolos_csrf", "")
    csrf_header = request.headers.get("x-csrf-token", "")
    if not raw_token or not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    result = await session.execute(select(RefreshSession).where(RefreshSession.token_hash == hash_refresh_token(raw_token)).with_for_update())
    old = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if old is None:
        clear_refresh_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh session expired or revoked")
    if old.revoked_at is not None:
        # A previously rotated token was replayed. Revoke the complete token family.
        await session.execute(update(RefreshSession).where(RefreshSession.family_id == old.family_id, RefreshSession.revoked_at.is_(None)).values(revoked_at=now))
        await session.commit()
        clear_refresh_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh session expired or revoked")
    expires_at = old.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= now:
        old.revoked_at = now
        await session.commit()
        clear_refresh_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh session expired or revoked")
    member_result = await session.execute(
        select(SchoolMembership, User, School)
        .join(User, SchoolMembership.user_id == User.id)
        .join(School, SchoolMembership.school_id == School.id)
        .where(
            SchoolMembership.user_id == old.user_id,
            SchoolMembership.school_id == old.school_id,
            SchoolMembership.status == "active",
            User.status == "active",
            School.status == "active",
        )
    )
    record = member_result.one_or_none()
    if record is None:
        old.revoked_at = now
        await session.commit()
        clear_refresh_cookies(response)
        raise HTTPException(status_code=401, detail="Active school membership required")
    membership, user, school = record
    old.revoked_at = now
    settings = get_settings()
    new_raw = new_refresh_token()
    new_expiry = now + timedelta(days=settings.refresh_token_days)
    session.add(RefreshSession(user_id=user.id, school_id=school.id, family_id=old.family_id, token_hash=hash_refresh_token(new_raw), expires_at=new_expiry))
    await session.commit()
    response.headers["Cache-Control"] = "no-store"
    csrf = new_csrf_token()
    set_refresh_cookies(response, new_raw, csrf, new_expiry)
    return TokenResponse(access_token=create_access_token(user.id, school.id, membership.role.value), expires_in=settings.access_token_minutes * 60, csrf_token=csrf)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, session: Annotated[AsyncSession, Depends(get_session)]) -> Response:
    csrf_cookie = request.cookies.get("schoolos_csrf", "")
    csrf_header = request.headers.get("x-csrf-token", "")
    if csrf_cookie and csrf_header and secrets.compare_digest(csrf_cookie, csrf_header):
        token = request.cookies.get("schoolos_refresh")
        if token:
            result = await session.execute(select(RefreshSession).where(RefreshSession.token_hash == hash_refresh_token(token)).with_for_update())
            stored = result.scalar_one_or_none()
            if stored and stored.revoked_at is None:
                stored.revoked_at = datetime.now(UTC)
                await session.commit()
    clear_refresh_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/auth/me", response_model=UserContextResponse)
async def me(context: Annotated[TenantContext, Depends(current_tenant)], session: Annotated[AsyncSession, Depends(get_session)]) -> UserContextResponse:
    result = await session.execute(
        select(User, School, SchoolMembership)
        .join(SchoolMembership, SchoolMembership.user_id == User.id)
        .join(School, SchoolMembership.school_id == School.id)
        .where(User.id == context.user_id, School.id == context.school_id)
    )
    user, school, membership = result.one()
    return UserContextResponse(user_id=str(user.id), school_id=str(school.id), school_name=school.name,
        school_slug=school.slug, display_name=user.display_name, email=user.email, role=membership.role.value)
