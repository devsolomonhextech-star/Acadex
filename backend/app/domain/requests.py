"""Parent request threads: creation, replies, resolution, and inbox queries.

A parent request is a two-party conversation between one guardian and the
school office. The domain rules here keep the thread's derived state
(``status``, ``last_message_by``, read markers) consistent so the school inbox
and the parent app can both answer "whose turn is it?" without scanning
messages.
"""
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Guardian,
    MembershipRole,
    ParentRequest,
    ParentRequestMessage,
    School,
    SchoolMembership,
    Student,
    StudentGuardian,
    User,
)

OPEN = "open"
AWAITING_PARENT = "awaiting_parent"
RESOLVED = "resolved"
STATUSES = (OPEN, AWAITING_PARENT, RESOLVED)
TOPICS = ("absence", "documents", "meeting", "fees", "details", "other")
PREVIEW_LENGTH = 180


class ParentRequestNotFound(Exception):
    """The request does not exist inside the caller's tenant scope."""


class ParentRequestDenied(Exception):
    """The caller may not act on this resource."""


class ParentRequestInvalid(Exception):
    """The payload breaks a domain rule even though it is structurally valid."""


@dataclass(frozen=True)
class RequestSummary:
    request: ParentRequest
    guardian: Guardian
    student: Student | None
    message_count: int
    unread: bool


@dataclass(frozen=True)
class RequestPage:
    items: list[RequestSummary]
    total: int
    counts: dict[str, int]


def preview_of(body: str) -> str:
    """Collapse whitespace so one long paragraph cannot break the inbox row."""
    collapsed = " ".join(body.split())
    return collapsed if len(collapsed) <= PREVIEW_LENGTH else f"{collapsed[:PREVIEW_LENGTH - 1]}…"


def new_reference() -> str:
    return f"PR-{uuid4().hex[:6].upper()}"


def _as_aware(value: datetime | None) -> datetime | None:
    # PostgreSQL returns timezone-aware values; SQLite-backed test drivers may not.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def is_unread(request: ParentRequest, viewer: str) -> bool:
    """True when the other party sent the last message and this side has not read it."""
    if request.last_message_by == viewer:
        return False
    marker = request.school_last_read_at if viewer == "school" else request.parent_last_read_at
    marker = _as_aware(marker)
    return marker is None or marker < _as_aware(request.last_message_at)


async def guardian_for_user(session: AsyncSession, school_id: UUID, user_id: UUID) -> Guardian | None:
    return await session.scalar(
        select(Guardian).where(Guardian.school_id == school_id, Guardian.user_id == user_id)
    )


async def require_guardian(session: AsyncSession, school_id: UUID, user_id: UUID) -> Guardian:
    guardian = await guardian_for_user(session, school_id, user_id)
    if guardian is None:
        raise ParentRequestDenied("Guardian profile not found")
    return guardian


async def require_linked_student(
    session: AsyncSession, school_id: UUID, guardian_id: UUID, student_id: UUID
) -> Student:
    """Only a student linked to this guardian may be named on a request."""
    student = await session.scalar(
        select(Student)
        .join(
            StudentGuardian,
            (StudentGuardian.school_id == Student.school_id)
            & (StudentGuardian.student_id == Student.id),
        )
        .where(
            Student.school_id == school_id,
            Student.id == student_id,
            StudentGuardian.guardian_id == guardian_id,
        )
    )
    if student is None:
        raise ParentRequestDenied("This student is not linked to your parent account")
    return student


async def create_request(
    session: AsyncSession,
    *,
    school_id: UUID,
    guardian: Guardian,
    user_id: UUID,
    topic: str,
    subject: str,
    body: str,
    student: Student | None,
) -> ParentRequest:
    if topic not in TOPICS:
        raise ParentRequestInvalid("Choose a valid request topic")
    clean_subject = " ".join(subject.split())
    clean_body = body.strip()
    if len(clean_subject) < 3:
        raise ParentRequestInvalid("Add a short subject for your request")
    if len(clean_body) < 10:
        raise ParentRequestInvalid("Tell the school a little more about what you need")
    now = datetime.now(UTC)
    request = ParentRequest(
        school_id=school_id,
        reference=new_reference(),
        student_id=student.id if student else None,
        guardian_id=guardian.id,
        created_by_user_id=user_id,
        topic=topic,
        subject=clean_subject[:160],
        status=OPEN,
        last_message_by="parent",
        last_message_at=now,
        last_message_preview=preview_of(clean_body),
        # The author has by definition read their own message.
        parent_last_read_at=now,
    )
    session.add(request)
    await session.flush()
    session.add(
        ParentRequestMessage(
            school_id=school_id,
            request_id=request.id,
            author_user_id=user_id,
            author_role="parent",
            body=clean_body,
        )
    )
    return request


def _touch(request: ParentRequest, *, author_role: str, body: str, now: datetime) -> None:
    request.last_message_by = author_role
    request.last_message_at = now
    request.last_message_preview = preview_of(body)
    request.updated_at = now
    if author_role == "school":
        request.school_last_read_at = now
        request.status = AWAITING_PARENT
        if request.first_school_reply_at is None:
            request.first_school_reply_at = now
    else:
        request.parent_last_read_at = now
        # A parent reply always returns the thread to the school's court, and
        # reopens a resolved thread rather than replying into a closed one.
        request.status = OPEN
        request.resolved_at = None
        request.resolved_by_user_id = None


async def add_message(
    session: AsyncSession,
    request: ParentRequest,
    *,
    author_user_id: UUID,
    author_role: str,
    body: str,
) -> ParentRequestMessage:
    if author_role not in ("parent", "school"):
        raise ParentRequestInvalid("Unknown message author")
    clean = body.strip()
    if len(clean) < 2:
        raise ParentRequestInvalid("Write a message before sending")
    now = datetime.now(UTC)
    message = ParentRequestMessage(
        school_id=request.school_id,
        request_id=request.id,
        author_user_id=author_user_id,
        author_role=author_role,
        body=clean,
    )
    session.add(message)
    _touch(request, author_role=author_role, body=clean, now=now)
    await session.flush()
    return message


async def set_resolved(
    session: AsyncSession, request: ParentRequest, *, user_id: UUID, resolved: bool
) -> None:
    now = datetime.now(UTC)
    request.status = RESOLVED if resolved else OPEN
    request.resolved_at = now if resolved else None
    request.resolved_by_user_id = user_id if resolved else None
    request.updated_at = now
    await session.flush()


def _school_base(school_id: UUID):
    return (
        select(
            ParentRequest,
            Guardian,
            Student,
            select(func.count(ParentRequestMessage.id))
            .where(
                ParentRequestMessage.school_id == ParentRequest.school_id,
                ParentRequestMessage.request_id == ParentRequest.id,
            )
            .correlate(ParentRequest)
            .scalar_subquery()
            .label("message_count"),
        )
        .join(
            Guardian,
            (Guardian.school_id == ParentRequest.school_id) & (Guardian.id == ParentRequest.guardian_id),
        )
        .outerjoin(
            Student,
            (Student.school_id == ParentRequest.school_id) & (Student.id == ParentRequest.student_id),
        )
        .where(ParentRequest.school_id == school_id)
    )


def _search_filter(search: str):
    pattern = f"%{search.strip()}%"
    return or_(
        ParentRequest.subject.ilike(pattern),
        ParentRequest.reference.ilike(pattern),
        ParentRequest.last_message_preview.ilike(pattern),
        Guardian.first_name.ilike(pattern),
        Guardian.last_name.ilike(pattern),
        Student.first_name.ilike(pattern),
        Student.last_name.ilike(pattern),
    )


async def school_counts(session: AsyncSession, school_id: UUID) -> dict[str, int]:
    unread_condition = (
        (ParentRequest.last_message_by == "parent")
        & or_(
            ParentRequest.school_last_read_at.is_(None),
            ParentRequest.school_last_read_at < ParentRequest.last_message_at,
        )
    )
    rows = await session.execute(
        select(
            func.count().filter(ParentRequest.status == OPEN),
            func.count().filter(ParentRequest.status == AWAITING_PARENT),
            func.count().filter(ParentRequest.status == RESOLVED),
            func.count().filter(unread_condition),
        )
        .select_from(ParentRequest)
        .where(ParentRequest.school_id == school_id)
    )
    open_count, awaiting_count, resolved_count, unread_count = rows.one()
    return {
        OPEN: int(open_count),
        AWAITING_PARENT: int(awaiting_count),
        RESOLVED: int(resolved_count),
        "unread": int(unread_count),
        "total": int(open_count) + int(awaiting_count) + int(resolved_count),
    }


async def list_school_requests(
    session: AsyncSession,
    school_id: UUID,
    *,
    status: str | None,
    search: str | None,
    page: int,
    page_size: int,
) -> RequestPage:
    statement = _school_base(school_id)
    if status and status != "all":
        if status not in STATUSES:
            raise ParentRequestInvalid("Unknown request status")
        statement = statement.where(ParentRequest.status == status)
    if search and search.strip():
        statement = statement.where(_search_filter(search))
    total = int(
        (await session.execute(select(func.count()).select_from(statement.subquery()))).scalar_one()
    )
    rows = (
        await session.execute(
            statement.order_by(ParentRequest.last_message_at.desc(), ParentRequest.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        RequestSummary(request=request, guardian=guardian, student=student, message_count=int(count),
                       unread=is_unread(request, "school"))
        for request, guardian, student, count in rows
    ]
    return RequestPage(items=items, total=total, counts=await school_counts(session, school_id))


async def get_school_request(session: AsyncSession, school_id: UUID, request_id: UUID) -> RequestSummary:
    row = (
        await session.execute(_school_base(school_id).where(ParentRequest.id == request_id))
    ).first()
    if row is None:
        raise ParentRequestNotFound("Request not found")
    request, guardian, student, count = row
    return RequestSummary(request=request, guardian=guardian, student=student, message_count=int(count),
                          unread=is_unread(request, "school"))


async def parent_counts(session: AsyncSession, school_id: UUID, guardian_id: UUID) -> dict[str, int]:
    unread_condition = (
        (ParentRequest.last_message_by == "school")
        & or_(
            ParentRequest.parent_last_read_at.is_(None),
            ParentRequest.parent_last_read_at < ParentRequest.last_message_at,
        )
    )
    rows = await session.execute(
        select(
            func.count().filter(ParentRequest.status != RESOLVED),
            func.count().filter(ParentRequest.status == RESOLVED),
            func.count().filter(unread_condition),
        )
        .select_from(ParentRequest)
        .where(ParentRequest.school_id == school_id, ParentRequest.guardian_id == guardian_id)
    )
    open_count, resolved_count, unread_count = rows.one()
    return {"open": int(open_count), RESOLVED: int(resolved_count), "unread": int(unread_count)}


async def list_parent_requests(
    session: AsyncSession, school_id: UUID, guardian_id: UUID
) -> list[RequestSummary]:
    rows = (
        await session.execute(
            _school_base(school_id)
            .where(ParentRequest.guardian_id == guardian_id)
            .order_by(ParentRequest.last_message_at.desc(), ParentRequest.id.desc())
        )
    ).all()
    return [
        RequestSummary(request=request, guardian=guardian, student=student, message_count=int(count),
                       unread=is_unread(request, "parent"))
        for request, guardian, student, count in rows
    ]


async def get_parent_request(
    session: AsyncSession, school_id: UUID, guardian_id: UUID, request_id: UUID
) -> RequestSummary:
    summary = await get_school_request(session, school_id, request_id)
    if summary.request.guardian_id != guardian_id:
        # Never reveal that another family's request exists.
        raise ParentRequestNotFound("Request not found")
    return summary


async def thread_messages(
    session: AsyncSession, school_id: UUID, request_id: UUID
) -> list[ParentRequestMessage]:
    return list(
        (
            await session.scalars(
                select(ParentRequestMessage)
                .where(
                    ParentRequestMessage.school_id == school_id,
                    ParentRequestMessage.request_id == request_id,
                )
                .order_by(ParentRequestMessage.created_at, ParentRequestMessage.id)
            )
        ).all()
    )


async def author_names(
    session: AsyncSession, messages: list[ParentRequestMessage]
) -> dict[UUID, str]:
    user_ids = {message.author_user_id for message in messages}
    if not user_ids:
        return {}
    rows = (await session.execute(select(User.id, User.display_name).where(User.id.in_(user_ids)))).all()
    return {user_id: name for user_id, name in rows}


async def mark_read(session: AsyncSession, request: ParentRequest, viewer: str) -> None:
    now = datetime.now(UTC)
    if viewer == "school":
        request.school_last_read_at = now
    else:
        request.parent_last_read_at = now


async def school_admin_user_ids(session: AsyncSession, school_id: UUID) -> list[UUID]:
    """Every administrator or principal who should hear about a new enquiry."""
    rows = (
        await session.execute(
            select(SchoolMembership.user_id)
            .where(
                SchoolMembership.school_id == school_id,
                SchoolMembership.status == "active",
                SchoolMembership.role.in_((MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL)),
            )
            .order_by(SchoolMembership.created_at, SchoolMembership.id)
        )
    ).scalars().all()
    return list(rows)


async def school_name(session: AsyncSession, school_id: UUID) -> str:
    return (await session.scalar(select(School.name).where(School.id == school_id))) or "your school"
