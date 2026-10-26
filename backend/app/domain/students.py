from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEvent, Student
from app.domain.subscriptions import require_student_capacity


@dataclass(frozen=True)
class StudentInput:
    admission_number: str
    first_name: str
    last_name: str
    date_of_birth: date | None


@dataclass(frozen=True)
class StudentPage:
    items: list[Student]
    total: int


class DuplicateAdmissionNumber(Exception):
    pass


class StudentNotFound(Exception):
    pass


async def list_students(
    session: AsyncSession,
    school_id: UUID,
    page: int,
    page_size: int,
    search: str | None,
    status: str | None,
) -> StudentPage:
    filters = [Student.school_id == school_id]
    if status:
        filters.append(Student.status == status)
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Student.admission_number.ilike(pattern),
                Student.first_name.ilike(pattern),
                Student.last_name.ilike(pattern),
            )
        )
    count_result = await session.execute(select(func.count()).select_from(Student).where(*filters))
    total = count_result.scalar_one()
    student_result = await session.execute(
        select(Student)
        .where(*filters)
        .order_by(Student.last_name.asc(), Student.first_name.asc(), Student.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return StudentPage(items=list(student_result.scalars()), total=total)


async def create_student(session: AsyncSession, school_id: UUID, actor_id: UUID, data: StudentInput) -> Student:
    duplicate = await session.execute(
        select(Student.id).where(
            Student.school_id == school_id,
            Student.admission_number == data.admission_number,
        )
    )
    if duplicate.scalar_one_or_none():
        raise DuplicateAdmissionNumber
    # Paid seats are checked per added student; the free trial bypasses this.
    await require_student_capacity(session, school_id, 1)
    student = Student(
        school_id=school_id,
        admission_number=data.admission_number,
        first_name=data.first_name,
        last_name=data.last_name,
        date_of_birth=data.date_of_birth,
    )
    session.add(student)
    try:
        await session.flush()
        session.add(
            AuditEvent(
                school_id=school_id,
                actor_user_id=actor_id,
                action="student.created",
                resource_type="student",
                resource_id=student.id,
            )
        )
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise DuplicateAdmissionNumber from None
    return student


async def get_student(session: AsyncSession, school_id: UUID, student_id: UUID) -> Student:
    result = await session.execute(
        select(Student).where(Student.school_id == school_id, Student.id == student_id)
    )
    student = result.scalar_one_or_none()
    if student is None:
        raise StudentNotFound
    return student
