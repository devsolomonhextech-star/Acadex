"""School-owned tasks: admins assign to teachers, teachers mark complete."""
from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain.tasks import (
    TaskInput,
    TaskNotFound,
    TaskNotOwned,
    create_task,
    delete_task,
    get_task,
    list_tasks,
    update_task_status,
)
from app.models import MembershipRole, SchoolMembership, Task, User

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])

read_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR, MembershipRole.TEACHER)
write_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL)
TaskStatus = Literal["open", "in_progress", "completed", "cancelled"]
TaskPriority = Literal["low", "medium", "high"]


class TaskResponse(BaseModel):
    id: UUID
    title: str
    description: str | None
    status: str
    priority: str
    due_on: date | None
    assigned_to_membership_id: UUID
    assigned_to_name: str
    assigned_to_email: str
    assigned_by_membership_id: UUID
    completed_at: datetime | None
    completed_by_membership_id: UUID | None
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    priority: TaskPriority = "medium"
    due_on: date | None = None
    assigned_to_membership_id: UUID

    @property
    def status(self) -> str:
        return "open"


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


async def _membership_id(session: AsyncSession, context: TenantContext) -> UUID:
    membership_id = await session.scalar(select(SchoolMembership.id).where(
        SchoolMembership.school_id == context.school_id,
        SchoolMembership.user_id == context.user_id,
        SchoolMembership.status == "active",
    ))
    if membership_id is None:
        raise HTTPException(status_code=403, detail="Active school membership required")
    return membership_id


async def _task_summary(session: AsyncSession, task: Task) -> TaskResponse:
    assignee = await session.scalar(
        select(User.display_name, User.email)
        .join(SchoolMembership, SchoolMembership.user_id == User.id)
        .where(SchoolMembership.id == task.assigned_to_membership_id)
    )
    assigner = await session.scalar(
        select(User.display_name, User.email)
        .join(SchoolMembership, SchoolMembership.user_id == User.id)
        .where(SchoolMembership.id == task.assigned_by_membership_id)
    )
    if assignee is None or assigner is None:
        raise HTTPException(status_code=404, detail="Task membership reference not found")
    return TaskResponse(
        id=task.id, title=task.title, description=task.description, status=task.status,
        priority=task.priority, due_on=task.due_on,
        assigned_to_membership_id=task.assigned_to_membership_id,
        assigned_to_name=assignee[0], assigned_to_email=assignee[1],
        assigned_by_membership_id=task.assigned_by_membership_id,
        completed_at=task.completed_at,
        completed_by_membership_id=task.completed_by_membership_id,
        created_at=task.created_at, updated_at=task.updated_at,
    )


@router.get("", response_model=list[TaskResponse])
async def list_tasks_route(
    context: Annotated[TenantContext, Depends(require_roles(*read_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    status_filter: TaskStatus | None = None,
    assigned_to: UUID | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
):
    page = max(page, 1)
    if page_size < 1 or page_size > 200:
        page_size = 50
    member_id = await _membership_id(session, context)
    page_result = await list_tasks(
        session, context.school_id, page, page_size, search, status_filter, assigned_to,
        context.role, member_id,
    )
    return [await _task_summary(session, task) for task in page_result.items]


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task_route(
    payload: TaskCreate,
    context: Annotated[TenantContext, Depends(require_roles(*write_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    member_id = await _membership_id(session, context)
    # Only admins/principals may assign; the assignee must be a teacher or staff member.
    assignee = await session.scalar(select(SchoolMembership.role).where(
        SchoolMembership.id == payload.assigned_to_membership_id,
        SchoolMembership.school_id == context.school_id,
        SchoolMembership.status == "active",
    ))
    if assignee not in (MembershipRole.TEACHER, MembershipRole.STAFF):
        raise HTTPException(status_code=422, detail="Tasks can only be assigned to a teacher or staff member")
    try:
        task = await create_task(
            session, context.school_id, context.user_id, member_id,
            TaskInput(
                title=payload.title,
                description=payload.description,
                status="open",
                priority=payload.priority,
                due_on=payload.due_on,
                assigned_to_membership_id=payload.assigned_to_membership_id,
            ),
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    return await _task_summary(session, task)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task_route(
    task_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*read_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        task = await get_task(session, context.school_id, task_id)
    except TaskNotFound:
        raise HTTPException(status_code=404, detail="Task not found")
    if context.role == MembershipRole.TEACHER:
        member_id = await _membership_id(session, context)
        if task.assigned_to_membership_id != member_id:
            raise HTTPException(status_code=403, detail="You can only view tasks assigned to you")
    return await _task_summary(session, task)


@router.patch("/{task_id}/status", response_model=TaskResponse)
async def update_task_status_route(
    task_id: UUID,
    payload: TaskStatusUpdate,
    context: Annotated[TenantContext, Depends(require_roles(*read_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    member_id = await _membership_id(session, context)
    try:
        task = await update_task_status(
            session, context.school_id, task_id, payload.status,
            context.user_id, member_id, context.role,
        )
    except TaskNotFound:
        raise HTTPException(status_code=404, detail="Task not found")
    except TaskNotOwned:
        raise HTTPException(status_code=403, detail="You can only change the status of tasks assigned to you")
    return await _task_summary(session, task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_route(
    task_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(MembershipRole.SCHOOL_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        await delete_task(session, context.school_id, task_id, context.user_id)
    except TaskNotFound:
        raise HTTPException(status_code=404, detail="Task not found")
