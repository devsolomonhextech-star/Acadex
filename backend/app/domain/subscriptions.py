"""Subscription rules shared by student enrollment and bulk import."""
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SchoolSubscription, Student


class StudentSubscriptionRequired(Exception):
    def __init__(self, active_students: int, student_limit: int, available_places: int):
        self.active_students = active_students
        self.student_limit = student_limit
        self.available_places = available_places
        super().__init__(
            f"Your school has {active_students} active students and {available_places} paid places left. "
            "Ask your school administrator to add student places in Settings → Billing. "
            "Plans are GH₵3 per student per month."
        )


async def active_student_count(session: AsyncSession, school_id: UUID) -> int:
    result = await session.execute(
        select(func.count()).select_from(Student).where(
            Student.school_id == school_id, Student.status == "active",
        )
    )
    return int(result.scalar_one())


async def require_student_capacity(
    session: AsyncSession, school_id: UUID, additional: int = 1,
) -> None:
    """Lock the tenant subscription and ensure new active student seats are paid."""
    subscription = (await session.execute(
        select(SchoolSubscription)
        .where(SchoolSubscription.school_id == school_id)
        .with_for_update()
    )).scalar_one_or_none()
    current = await active_student_count(session, school_id)
    now = datetime.now(UTC)
    is_active = bool(
        subscription
        and subscription.status == "active"
        and subscription.current_period_end
        and subscription.current_period_end > now
    )
    limit = subscription.student_limit if subscription else 0
    if not is_active or current + additional > limit:
        available = max(limit - current, 0) if is_active else 0
        raise StudentSubscriptionRequired(current, limit, available)
