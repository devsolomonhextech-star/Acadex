"""The Acadex platform console: everyone who runs the product across schools.

This is a separate identity plane from the school workspace. A platform admin
logs in with just an email and password, gets a token that carries no school
scope, and can only reach the endpoints below.
"""
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import LoginResponse
from app.db import get_session
from app.models import (
    MembershipRole,
    PlatformAdmin,
    PlatformSession,
    School,
    SchoolMembership,
    SchoolSubscription,
    Student,
    User,
)
from app.rate_limit import limit_login
from app.security import (
    create_platform_access_token,
    decode_platform_access_token,
    hash_password,
    hash_refresh_token,
    new_csrf_token,
    new_refresh_token,
    verify_password,
)
from app.settings import get_settings

router = APIRouter(prefix="/api/v1/platform", tags=["platform console"])
bearer = HTTPBearer(auto_error=False)

REFRESH_COOKIE = "acadex_platform_refresh"
CSRF_COOKIE = "acadex_platform_csrf"


@dataclass(frozen=True)
class PlatformContext:
    admin_id: UUID
    user_id: UUID
    email: str
    display_name: str
    role: str


class PlatformLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()


class PlatformAdminOut(BaseModel):
    id: UUID
    user_id: UUID
    email: str
    display_name: str
    role: str


class PlatformLoginResponse(LoginResponse):
    admin: PlatformAdminOut


class SchoolSummary(BaseModel):
    id: UUID
    name: str
    slug: str
    status: str
    created_at: datetime
    trial_ends_at: datetime | None = None
    student_count: int = 0
    subscription_status: str = "inactive"
    student_limit: int = 0
    admin_name: str | None = None
    admin_email: str | None = None


class SchoolsPage(BaseModel):
    items: list[SchoolSummary]
    total: int
    limit: int
    offset: int


class MonthCount(BaseModel):
    month: str
    count: int


class PlatformOverview(BaseModel):
    schools_total: int
    schools_active: int
    schools_new_30_days: int
    students_total: int
    active_subscriptions: int
    licensed_students: int
    members_by_role: dict[str, int]
    recent_schools: list[SchoolSummary]
    signups: list[MonthCount]


def _set_console_cookies(response: Response, raw_refresh: str, csrf: str, expires: datetime) -> None:
    settings = get_settings()
    common = {"secure": settings.cookie_secure, "samesite": "lax", "expires": expires}
    response.set_cookie(REFRESH_COOKIE, raw_refresh, httponly=True, path="/api/v1/platform/auth", **common)
    response.set_cookie(CSRF_COOKIE, csrf, httponly=False, path="/", **common)


def _clear_console_cookies(response: Response) -> None:
    settings = get_settings()
    common = {"secure": settings.cookie_secure, "samesite": "lax"}
    response.delete_cookie(REFRESH_COOKIE, httponly=True, path="/api/v1/platform/auth", **common)
    response.delete_cookie(CSRF_COOKIE, httponly=False, path="/", **common)


def _admin_out(admin: PlatformAdmin, user: User) -> PlatformAdminOut:
    return PlatformAdminOut(
        id=admin.id, user_id=user.id, email=user.email,
        display_name=user.display_name, role=admin.role,
    )


def _issue_access(admin: PlatformAdmin) -> tuple[str, int]:
    settings = get_settings()
    return (
        create_platform_access_token(admin.user_id, admin.role),
        settings.access_token_minutes * 60,
    )


async def _start_session(session: AsyncSession, admin: PlatformAdmin) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    raw = new_refresh_token()
    session.add(PlatformSession(
        platform_admin_id=admin.id,
        token_hash=hash_refresh_token(raw),
        expires_at=now + timedelta(days=settings.refresh_token_days),
    ))
    admin.last_login_at = now
    await session.commit()
    return raw


async def current_platform_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlatformContext:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Platform sign-in required",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = decode_platform_access_token(credentials.credentials)
        user_id = UUID(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired console session",
                            headers={"WWW-Authenticate": "Bearer"}) from None
    result = await session.execute(
        select(PlatformAdmin, User)
        .join(User, PlatformAdmin.user_id == User.id)
        .where(
            PlatformAdmin.user_id == user_id,
            PlatformAdmin.status == "active",
            User.status == "active",
        )
    )
    record = result.one_or_none()
    if record is None:
        raise HTTPException(status_code=403, detail="Platform access has been revoked")
    admin, user = record
    return PlatformContext(
        admin_id=admin.id, user_id=user.id, email=user.email,
        display_name=user.display_name, role=admin.role,
    )


@router.post("/auth/login", response_model=PlatformLoginResponse,
             dependencies=[Depends(limit_login)])
async def platform_login(
    payload: PlatformLoginRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlatformLoginResponse:
    result = await session.execute(
        select(PlatformAdmin, User)
        .join(User, PlatformAdmin.user_id == User.id)
        .where(func.lower(User.email) == payload.email)
        .with_for_update(of=PlatformAdmin)
    )
    record = result.one_or_none()
    valid = verify_password(payload.password, record[1].password_hash if record else _dummy_hash())
    if record is None or not valid or record[0].status != "active" or record[1].status != "active":
        raise HTTPException(status_code=401, detail="Invalid platform email or password")
    admin, user = record
    raw_refresh = await _start_session(session, admin)
    access_token, expires_in = _issue_access(admin)
    csrf = new_csrf_token()
    _set_console_cookies(
        response, raw_refresh, csrf,
        datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days),
    )
    response.headers["Cache-Control"] = "no-store"
    return PlatformLoginResponse(
        access_token=access_token, expires_in=expires_in, csrf_token=csrf,
        admin=_admin_out(admin, user),
    )


@router.post("/auth/refresh", response_model=PlatformLoginResponse)
async def refresh_platform_session(
    request: Request, response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlatformLoginResponse:
    raw = request.cookies.get(REFRESH_COOKIE)
    csrf_cookie = request.cookies.get(CSRF_COOKIE, "")
    csrf_header = request.headers.get("x-csrf-token", "")
    if not raw or not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    stored = await session.scalar(
        select(PlatformSession)
        .where(PlatformSession.token_hash == hash_refresh_token(raw))
        .with_for_update()
    )
    now = datetime.now(UTC)
    if stored is None or stored.revoked_at is not None or stored.expires_at.replace(tzinfo=UTC) <= now:
        _clear_console_cookies(response)
        raise HTTPException(status_code=401, detail="Console session expired")
    record = await session.execute(
        select(PlatformAdmin, User)
        .join(User, PlatformAdmin.user_id == User.id)
        .where(PlatformAdmin.id == stored.platform_admin_id)
    )
    found = record.one_or_none()
    if found is None or found[0].status != "active" or found[1].status != "active":
        stored.revoked_at = now
        await session.commit()
        _clear_console_cookies(response)
        raise HTTPException(status_code=401, detail="Console session expired")
    admin, user = found
    stored.revoked_at = now
    raw_next = new_refresh_token()
    session.add(PlatformSession(
        platform_admin_id=admin.id,
        token_hash=hash_refresh_token(raw_next),
        expires_at=now + timedelta(days=get_settings().refresh_token_days),
    ))
    await session.commit()
    csrf = new_csrf_token()
    _set_console_cookies(
        response, raw_next, csrf,
        now + timedelta(days=get_settings().refresh_token_days),
    )
    access_token, expires_in = _issue_access(admin)
    response.headers["Cache-Control"] = "no-store"
    return PlatformLoginResponse(
        access_token=access_token, expires_in=expires_in, csrf_token=csrf,
        admin=_admin_out(admin, user),
    )


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_platform_session(
    request: Request, response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        stored = await session.scalar(select(PlatformSession).where(
            PlatformSession.token_hash == hash_refresh_token(raw),
            PlatformSession.revoked_at.is_(None),
        ))
        if stored is not None:
            stored.revoked_at = datetime.now(UTC)
            await session.commit()
    _clear_console_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/auth/me", response_model=PlatformAdminOut)
async def platform_me(
    context: Annotated[PlatformContext, Depends(current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlatformAdminOut:
    admin = await session.get(PlatformAdmin, context.admin_id)
    user = await session.get(User, context.user_id)
    if admin is None or user is None:
        raise HTTPException(status_code=401, detail="Platform access has been revoked")
    return _admin_out(admin, user)


def _month_key(value: datetime) -> str:
    return value.strftime("%Y-%m")


@router.get("/overview", response_model=PlatformOverview)
async def platform_overview(
    _: Annotated[PlatformContext, Depends(current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlatformOverview:
    now = datetime.now(UTC)
    schools_total = await session.scalar(select(func.count(School.id))) or 0
    schools_active = await session.scalar(
        select(func.count(School.id)).where(School.status == "active")
    ) or 0
    schools_new = await session.scalar(
        select(func.count(School.id)).where(School.created_at >= now - timedelta(days=30))
    ) or 0
    students_total = await session.scalar(select(func.count(Student.id))) or 0
    active_subscriptions, licensed_students = (
        await session.execute(select(
            func.count(SchoolSubscription.id),
            func.coalesce(func.sum(SchoolSubscription.student_limit), 0),
        ).where(SchoolSubscription.status == "active"))
    ).one()
    roles = {
        role: count for role, count in (await session.execute(
            select(SchoolMembership.role, func.count(SchoolMembership.id))
            .where(SchoolMembership.status == "active")
            .group_by(SchoolMembership.role)
        )).all()
    }
    members_by_role = {role.value: int(roles.get(role, 0)) for role in MembershipRole}

    recent_rows = (await session.execute(
        select(School).order_by(School.created_at.desc()).limit(5)
    )).scalars().all()
    recent = await _summaries(session, list(recent_rows))

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    months: list[datetime] = []
    cursor = month_start
    for _month in range(6):
        months.append(cursor)
        cursor = (cursor - timedelta(days=1)).replace(day=1)
    months.reverse()
    month = func.date_trunc("month", School.created_at).label("month")
    signup_rows = (await session.execute(
        select(month, func.count(School.id))
        .where(School.created_at >= months[0])
        .group_by("month")
        .order_by("month")
    )).all()
    counts = {_month_key(row[0]): int(row[1]) for row in signup_rows}
    signups = [MonthCount(month=_month_key(month), count=counts.get(_month_key(month), 0)) for month in months]
    return PlatformOverview(
        schools_total=int(schools_total),
        schools_active=int(schools_active),
        schools_new_30_days=int(schools_new),
        students_total=int(students_total),
        active_subscriptions=int(active_subscriptions),
        licensed_students=int(licensed_students),
        members_by_role=members_by_role,
        recent_schools=recent,
        signups=signups,
    )


async def _summaries(session: AsyncSession, schools: list[School]) -> list[SchoolSummary]:
    if not schools:
        return []
    ids = [school.id for school in schools]
    student_counts = dict((await session.execute(
        select(Student.school_id, func.count(Student.id))
        .where(Student.school_id.in_(ids))
        .group_by(Student.school_id)
    )).all())
    subscriptions = {
        row.school_id: row for row in (await session.scalars(
            select(SchoolSubscription).where(SchoolSubscription.school_id.in_(ids))
        )).all()
    }
    admins: dict[UUID, tuple[str, str]] = {}
    for membership, user in (await session.execute(
        select(SchoolMembership, User)
        .join(User, SchoolMembership.user_id == User.id)
        .where(
            SchoolMembership.school_id.in_(ids),
            SchoolMembership.role == MembershipRole.SCHOOL_ADMIN,
            SchoolMembership.status == "active",
        )
        .order_by(SchoolMembership.created_at)
    )).all():
        admins.setdefault(membership.school_id, (user.display_name, user.email))
    summaries = []
    for school in schools:
        subscription = subscriptions.get(school.id)
        admin_name, admin_email = admins.get(school.id, (None, None))
        summaries.append(SchoolSummary(
            id=school.id, name=school.name, slug=school.slug, status=school.status,
            created_at=school.created_at, trial_ends_at=school.trial_ends_at,
            student_count=int(student_counts.get(school.id, 0)),
            subscription_status=subscription.status if subscription else "inactive",
            student_limit=subscription.student_limit if subscription else 0,
            admin_name=admin_name, admin_email=admin_email,
        ))
    return summaries


@router.get("/schools", response_model=SchoolsPage)
async def list_schools(
    _: Annotated[PlatformContext, Depends(current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    search: Annotated[str, Query(max_length=120)] = "",
    status_filter: Annotated[str, Query(alias="status", pattern="^(all|active|inactive)$")] = "all",
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SchoolsPage:
    filters = []
    term = search.strip()
    if term:
        filters.append(func.lower(School.name).contains(term.lower()) | func.lower(School.slug).contains(term.lower()))
    if status_filter != "all":
        filters.append(School.status == status_filter)
    total = await session.scalar(select(func.count(School.id)).where(*filters)) or 0
    schools = (await session.execute(
        select(School).where(*filters).order_by(School.created_at.desc()).limit(limit).offset(offset)
    )).scalars().all()
    return SchoolsPage(
        items=await _summaries(session, list(schools)),
        total=int(total), limit=limit, offset=offset,
    )


_DUMMY_HASH: str | None = None


def _dummy_hash() -> str:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(secrets.token_urlsafe(32))
    return _DUMMY_HASH
