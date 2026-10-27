from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import UUID, uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEvent, MembershipRole, SchoolMembership, Task


class TaskNotFound(Exception):
    pass


class TaskNotOwned(Exception):
    pass


@dataclass(frozen=True)
class TaskInput:
    title: str
    description: str | None
    status: str
    priority: str
    due_on: date | None
    assigned_to_membership_id: UUID


@dataclass(frozen=True)
class TaskPage:
    items: list[Task]
    total: int


async def list_tasks(
    session: AsyncSession,
    school_id: UUID,
    page: int,
    page_size: int,
    search: str | None,
    status: str | None,
    assigned_to: UUID | None,
    viewer_role: MembershipRole,
    viewer_membership_id: UUID,
) -> TaskPage:
    filters = [Task.school_id == school_id]
    if status:
        filters.append(Task.status == status)
    if assigned_to:
        filters.append(Task.assigned_to_membership_id == assigned_to)
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Task.title.ilike(pattern),
                Task.description.ilike(pattern),
            )
        )
    # Teachers only see tasks assigned to them; everyone else sees all school tasks.
    if viewer_role == MembershipRole.TEACHER:
        filters.append(Task.assigned_to_membership_id == viewer_membership_id)
    count_result = await session.execute(select(func.count()).select_from(Task).where(*filters))
    total = count_result.scalar_one()
    task_result = await session.execute(
        select(Task)
        .where(*filters)
        .order_by(Task.due_on.is_(None), Task.due_on.asc(), Task.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return TaskPage(items=list(task_result.scalars()), total=total)


async def get_task(session: AsyncSession, school_id: UUID, task_id: UUID) -> Task:
    result = await session.execute(
        select(Task).where(Task.school_id == school_id, Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise TaskNotFound
    return task


async def create_task(
    session: AsyncSession,
    school_id: UUID,
    actor_id: UUID,
    actor_membership_id: UUID,
    data: TaskInput,
) -> Task:
    assignee = await session.scalar(select(SchoolMembership.id).where(
        SchoolMembership.id == data.assigned_to_membership_id,
        SchoolMembership.school_id == school_id,
        SchoolMembership.status == "active",
    ))
    if assignee is None:
        raise ValueError("Assignee is not an active member of this school")
    task = Task(
        id=uuid4(),
        school_id=school_id,
        title=data.title.strip(),
        description=data.description.strip() if data.description else None,
        status=data.status,
        priority=data.priority,
        due_on=data.due_on,
        assigned_to_membership_id=data.assigned_to_membership_id,
        assigned_by_membership_id=actor_membership_id,
    )
    session.add(task)
    session.add(
        AuditEvent(
            school_id=school_id,
            actor_user_id=actor_id,
            action="task.created",
            resource_type="task",
            resource_id=task.id,
        )
    )
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return task


async def update_task_status(
    session: AsyncSession,
    school_id: UUID,
    task_id: UUID,
    new_status: str,
    actor_id: UUID,
    actor_membership_id: UUID,
    viewer_role: MembershipRole,
) -> Task:
    task = await get_task(session, school_id, task_id)
    if viewer_role == MembershipRole.TEACHER and task.assigned_to_membership_id != actor_membership_id:
        raise TaskNotOwned("You can only change the status of tasks assigned to you")
    task.status = new_status
    if new_status == "completed":
        task.completed_at = datetime.now(UTC)
        task.completed_by_membership_id = actor_membership_id
    else:
        task.completed_at = None
        task.completed_by_membership_id = None
    session.add(
        AuditEvent(
            school_id=school_id,
            actor_user_id=actor_id,
            action=f"task.status_changed_to_{new_status}",
            resource_type="task",
            resource_id=task.id,
        )
    )
    await session.commit()
    return task


async def delete_task(session: AsyncSession, school_id: UUID, task_id: UUID, actor_id: UUID) -> None:
    task = await get_task(session, school_id, task_id)
    await session.delete(task)
    session.add(
        AuditEvent(
            school_id=school_id,
            actor_user_id=actor_id,
            action="task.deleted",
            resource_type="task",
            resource_id=task.id,
        )
    )
    await session.commit()
