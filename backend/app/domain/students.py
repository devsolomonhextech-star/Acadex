import re
from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.subscriptions import require_student_capacity
from app.models import (
    AuditEvent,
    ClassGroup,
    Guardian,
    Student,
    StudentEnrollment,
    StudentGuardian,
)

ADMISSION_NUMBER_PREFIX = "ADM"
GHANA_CARD_ERROR = "Enter a Ghana Card number like GHA-123456789-0"

# Ghana Card numbers are the GHA prefix, nine digits and a check digit.
_GHANA_CARD_DIGITS = re.compile(r"^\d{10}$")


@dataclass(frozen=True)
class GuardianInput:
    first_name: str
    last_name: str
    relationship: str | None
    phone: str | None
    email: str | None
    address: str | None = None
    ghana_card_number: str | None = None


@dataclass(frozen=True)
class StudentInput:
    admission_number: str | None
    first_name: str
    last_name: str
    date_of_birth: date | None
    gender: str | None = None
    ghana_card_number: str | None = None
    guardian: GuardianInput | None = None
    academic_year_id: UUID | None = None
    class_group_id: UUID | None = None


@dataclass(frozen=True)
class StudentPage:
    items: list[Student]
    total: int


class DuplicateAdmissionNumber(Exception):
    pass


class DuplicateGhanaCard(Exception):
    pass


class ClassGroupNotFound(Exception):
    pass


class StudentNotFound(Exception):
    pass


def normalize_ghana_card(value: str | None) -> str | None:
    """Return ``GHA-123456789-0`` for any reasonable spelling of a card number."""
    if value is None:
        return None
    compact = "".join(char for char in value.upper() if char.isalnum())
    if not compact:
        return None
    digits = compact.removeprefix("GHA")
    if not _GHANA_CARD_DIGITS.match(digits):
        raise ValueError(GHANA_CARD_ERROR)
    return f"GHA-{digits[:9]}-{digits[9]}"


async def next_admission_number(session: AsyncSession, school_id: UUID) -> str:
    """The next ``ADM-<year>-<sequence>`` number for this school.

    Admissions staff never type this: the school's existing numbers for the
    current year are scanned for the highest sequence and one is added.
    """
    prefix = f"{ADMISSION_NUMBER_PREFIX}-{date.today().year}-"
    numbers = (await session.execute(
        select(Student.admission_number).where(
            Student.school_id == school_id,
            Student.admission_number.like(f"{prefix}%"),
        )
    )).scalars()
    highest = 0
    for number in numbers:
        suffix = number[len(prefix):]
        if suffix.isdigit():
            highest = max(highest, int(suffix))
    return f"{prefix}{highest + 1:04d}"


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


async def _resolve_class_group(
    session: AsyncSession, school_id: UUID, academic_year_id: UUID, class_group_id: UUID,
) -> ClassGroup:
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.school_id == school_id,
        ClassGroup.id == class_group_id,
        ClassGroup.academic_year_id == academic_year_id,
    ))
    if group is None:
        raise ClassGroupNotFound
    return group


async def _link_guardian(
    session: AsyncSession, school_id: UUID, student: Student, data: GuardianInput,
) -> bool:
    """Attach the guardian, reusing an existing record for the same email."""
    guardian = None
    if data.email:
        guardian = await session.scalar(select(Guardian).where(
            Guardian.school_id == school_id,
            func.lower(Guardian.email) == data.email.casefold(),
        ).order_by(Guardian.created_at.asc()).limit(1))
    if guardian is None:
        guardian = Guardian(
            school_id=school_id,
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            phone=data.phone,
            relationship=data.relationship,
            address=data.address,
            ghana_card_number=data.ghana_card_number,
        )
        session.add(guardian)
        await session.flush()
    else:
        # Fill gaps on a guardian the school already knows about.
        if not guardian.phone and data.phone:
            guardian.phone = data.phone
        if not guardian.address and data.address:
            guardian.address = data.address
        if not guardian.ghana_card_number and data.ghana_card_number:
            guardian.ghana_card_number = data.ghana_card_number
    existing_link = await session.scalar(select(StudentGuardian.id).where(
        StudentGuardian.school_id == school_id,
        StudentGuardian.student_id == student.id,
        StudentGuardian.guardian_id == guardian.id,
    ))
    if existing_link is None:
        session.add(StudentGuardian(
            school_id=school_id,
            student_id=student.id,
            guardian_id=guardian.id,
            is_primary=True,
        ))
    return True


async def create_student(session: AsyncSession, school_id: UUID, actor_id: UUID, data: StudentInput) -> Student:
    # Paid seats are checked per added student; the free trial bypasses this.
    await require_student_capacity(session, school_id, 1)
    if data.ghana_card_number:
        duplicate_card = await session.scalar(select(Student.id).where(
            Student.school_id == school_id,
            Student.ghana_card_number == data.ghana_card_number,
        ))
        if duplicate_card is not None:
            raise DuplicateGhanaCard
    class_group: ClassGroup | None = None
    if data.class_group_id is not None:
        if data.academic_year_id is None:
            raise ClassGroupNotFound
        class_group = await _resolve_class_group(
            session, school_id, data.academic_year_id, data.class_group_id,
        )

    # A generated number can collide when two admins save at the same moment,
    # so the insert is retried with the next sequence.
    for attempt in range(5):
        admission_number = data.admission_number or await next_admission_number(session, school_id)
        if data.admission_number:
            duplicate = await session.scalar(select(Student.id).where(
                Student.school_id == school_id,
                Student.admission_number == admission_number,
            ))
            if duplicate is not None:
                raise DuplicateAdmissionNumber
        student = Student(
            school_id=school_id,
            admission_number=admission_number,
            first_name=data.first_name,
            last_name=data.last_name,
            date_of_birth=data.date_of_birth,
            gender=data.gender,
            ghana_card_number=data.ghana_card_number,
        )
        session.add(student)
        try:
            await session.flush()
            if data.guardian is not None:
                await _link_guardian(session, school_id, student, data.guardian)
            if class_group is not None:
                session.add(StudentEnrollment(
                    school_id=school_id,
                    student_id=student.id,
                    academic_year_id=class_group.academic_year_id,
                    class_group_id=class_group.id,
                    enrolled_on=date.today(),
                ))
            session.add(
                AuditEvent(
                    school_id=school_id,
                    actor_user_id=actor_id,
                    action="student.created",
                    resource_type="student",
                    resource_id=student.id,
                    details={
                        "admission_number": student.admission_number,
                        "guardian_linked": data.guardian is not None,
                        "class_group_id": str(class_group.id) if class_group else None,
                        "generated_admission_number": data.admission_number is None,
                    },
                )
            )
            await session.commit()
            return student
        except IntegrityError as error:
            await session.rollback()
            if data.admission_number:
                raise DuplicateAdmissionNumber from None
            if "uq_students_school_ghana_card" in str(error.orig):
                raise DuplicateGhanaCard from None
            if attempt == 4:
                raise DuplicateAdmissionNumber from None
    raise DuplicateAdmissionNumber


async def get_student(session: AsyncSession, school_id: UUID, student_id: UUID) -> Student:
    result = await session.execute(
        select(Student).where(Student.school_id == school_id, Student.id == student_id)
    )
    student = result.scalar_one_or_none()
    if student is None:
        raise StudentNotFound
    return student
