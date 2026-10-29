from datetime import date
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import (
    AcademicTerm,
    AcademicYear,
    AuditEvent,
    ClassGroup,
    ClassSubjectAssignment,
    MembershipRole,
    SchoolMembership,
    Student,
    StudentEnrollment,
    Subject,
    User,
)

router = APIRouter(prefix="/api/v1/academic", tags=["academic setup"])
roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR)
writers = (MembershipRole.SCHOOL_ADMIN, MembershipRole.REGISTRAR)


class DateRange(BaseModel):
    starts_on: date
    ends_on: date

    @model_validator(mode="after")
    def valid_dates(self):
        if self.starts_on > self.ends_on:
            raise ValueError("Start date must be on or before end date")
        return self


class YearCreate(DateRange):
    name: str = Field(min_length=2, max_length=80)


class TermCreate(DateRange):
    academic_year_id: UUID
    name: str = Field(min_length=1, max_length=80)
    ordinal: int = Field(ge=1, le=20)


class ClassCreate(BaseModel):
    academic_year_id: UUID
    name: str = Field(min_length=1, max_length=80)
    grade_level: str = Field(min_length=1, max_length=40)
    stream: str = Field(default="", max_length=40)


class EnrollmentCreate(BaseModel):
    student_id: UUID
    academic_year_id: UUID
    class_group_id: UUID
    enrolled_on: date


class YearResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    starts_on: date
    ends_on: date
    status: str


class TermResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    academic_year_id: UUID
    name: str
    ordinal: int
    starts_on: date
    ends_on: date


class ClassResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    academic_year_id: UUID
    name: str
    grade_level: str
    stream: str
    class_teacher_membership_id: UUID | None = None
    class_teacher_name: str | None = None
    student_count: int = 0


class EnrollmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    student_id: UUID
    academic_year_id: UUID
    class_group_id: UUID
    enrolled_on: date
    status: str


class ClassRosterStudent(BaseModel):
    id: UUID
    admission_number: str
    first_name: str
    last_name: str
    gender: str | None
    status: str
    enrolled_on: date


class SubjectCreate(BaseModel):
    code: str = Field(min_length=2, max_length=24)
    name: str = Field(min_length=2, max_length=100)

    @model_validator(mode="after")
    def normalize(self):
        self.code = self.code.strip().upper()
        self.name = self.name.strip()
        return self


class SubjectResponse(BaseModel):
    id: UUID
    code: str
    name: str
    status: str


class AssignmentCreate(BaseModel):
    class_group_id: UUID
    subject_id: UUID
    teacher_membership_id: UUID


class AssignmentResponse(BaseModel):
    id: UUID
    class_group_id: UUID
    class_name: str
    academic_year_id: UUID
    subject_id: UUID
    subject_name: str
    subject_code: str
    teacher_membership_id: UUID
    teacher_name: str
    teacher_email: str


class TeacherResponse(BaseModel):
    membership_id: UUID
    user_id: UUID
    display_name: str
    email: str
    class_teacher_of: str | None = None
    classes_taught: int = 0
    subjects_taught: int = 0


class ClassTeacherRequest(BaseModel):
    """Assign a class teacher, or clear the role with ``null``."""

    teacher_membership_id: UUID | None = None


async def _audit(session: AsyncSession, context: TenantContext, action: str, kind: str, resource_id: UUID) -> None:
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action=action, resource_type=kind, resource_id=resource_id))


async def _commit_or_conflict(session: AsyncSession, message: str) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail=message) from None


async def _class_responses(
    session: AsyncSession, school_id: UUID, groups: list[ClassGroup],
) -> list[ClassResponse]:
    """Build class payloads enriched with the class teacher's display name."""
    if not groups:
        return []
    teacher_names = dict((await session.execute(
        select(ClassGroup.id, User.display_name)
        .join(SchoolMembership, SchoolMembership.id == ClassGroup.class_teacher_membership_id)
        .join(User, User.id == SchoolMembership.user_id)
        .where(ClassGroup.school_id == school_id,
               ClassGroup.id.in_([group.id for group in groups]))
    )).all())
    student_counts = dict((await session.execute(
        select(StudentEnrollment.class_group_id, func.count())
        .where(
            StudentEnrollment.school_id == school_id,
            StudentEnrollment.class_group_id.in_([group.id for group in groups]),
            StudentEnrollment.status == "active",
        )
        .group_by(StudentEnrollment.class_group_id)
    )).all())
    return [ClassResponse(
        id=group.id, academic_year_id=group.academic_year_id, name=group.name,
        grade_level=group.grade_level, stream=group.stream,
        class_teacher_membership_id=group.class_teacher_membership_id,
        class_teacher_name=teacher_names.get(group.id),
        student_count=int(student_counts.get(group.id, 0)),
    ) for group in groups]


@router.get("/years", response_model=list[YearResponse])
async def list_years(context: Annotated[TenantContext, Depends(require_roles(*roles, MembershipRole.TEACHER))], session: Annotated[AsyncSession, Depends(get_session)]):
    result = await session.scalars(select(AcademicYear).where(AcademicYear.school_id == context.school_id).order_by(AcademicYear.starts_on.desc()))
    return list(result)


@router.post("/years", response_model=YearResponse, status_code=status.HTTP_201_CREATED)
async def create_year(payload: YearCreate, context: Annotated[TenantContext, Depends(require_roles(*writers))], session: Annotated[AsyncSession, Depends(get_session)]):
    row = AcademicYear(id=uuid4(), school_id=context.school_id, **payload.model_dump())
    session.add(row)
    await _audit(session, context, "academic_year.created", "academic_year", row.id)
    await _commit_or_conflict(session, "An academic year with that name already exists")
    return row


@router.get("/terms", response_model=list[TermResponse])
async def list_terms(context: Annotated[TenantContext, Depends(require_roles(*roles, MembershipRole.TEACHER))], session: Annotated[AsyncSession, Depends(get_session)], academic_year_id: UUID | None = None):
    query = select(AcademicTerm).where(AcademicTerm.school_id == context.school_id)
    if academic_year_id:
        query = query.where(AcademicTerm.academic_year_id == academic_year_id)
    return list((await session.scalars(query.order_by(AcademicTerm.ordinal))).all())


@router.post("/terms", response_model=TermResponse, status_code=status.HTTP_201_CREATED)
async def create_term(payload: TermCreate, context: Annotated[TenantContext, Depends(require_roles(*writers))], session: Annotated[AsyncSession, Depends(get_session)]):
    year = await session.scalar(select(AcademicYear).where(AcademicYear.id == payload.academic_year_id, AcademicYear.school_id == context.school_id))
    if year is None:
        raise HTTPException(status_code=404, detail="Academic year not found")
    if payload.starts_on < year.starts_on or payload.ends_on > year.ends_on:
        raise HTTPException(status_code=422, detail="Term dates must fall within its academic year")
    row = AcademicTerm(id=uuid4(), school_id=context.school_id, **payload.model_dump())
    session.add(row)
    await _audit(session, context, "academic_term.created", "academic_term", row.id)
    await _commit_or_conflict(session, "A term with that name or order already exists for this year")
    return row


@router.get("/classes", response_model=list[ClassResponse])
async def list_classes(context: Annotated[TenantContext, Depends(require_roles(*roles, MembershipRole.TEACHER))], session: Annotated[AsyncSession, Depends(get_session)], academic_year_id: UUID | None = None, class_teacher_only: bool = False):
    query = select(ClassGroup).where(ClassGroup.school_id == context.school_id)
    if context.role == MembershipRole.TEACHER:
        membership_id = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.user_id == context.user_id,
            SchoolMembership.status == "active",
            SchoolMembership.role == MembershipRole.TEACHER,
        ))
        if membership_id is None:
            raise HTTPException(status_code=403, detail="Active teacher membership required")
        # Teachers see classes where they teach a subject or own the class.
        teaches_subject = select(ClassSubjectAssignment.class_group_id).where(
            (ClassSubjectAssignment.school_id == ClassGroup.school_id)
            & (ClassSubjectAssignment.class_group_id == ClassGroup.id)
            & (ClassSubjectAssignment.teacher_membership_id == membership_id)
        )
        query = query.where(or_(
            teaches_subject.exists(),
            ClassGroup.class_teacher_membership_id == membership_id,
        ))
        if class_teacher_only:
            query = query.where(ClassGroup.class_teacher_membership_id == membership_id)
    if academic_year_id:
        query = query.where(ClassGroup.academic_year_id == academic_year_id)
    groups = list((await session.scalars(query.order_by(ClassGroup.grade_level, ClassGroup.name, ClassGroup.stream))).all())
    return await _class_responses(session, context.school_id, groups)


@router.post("/classes", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
async def create_class(payload: ClassCreate, context: Annotated[TenantContext, Depends(require_roles(*writers))], session: Annotated[AsyncSession, Depends(get_session)]):
    year = await session.scalar(select(AcademicYear.id).where(AcademicYear.id == payload.academic_year_id, AcademicYear.school_id == context.school_id))
    if year is None:
        raise HTTPException(status_code=404, detail="Academic year not found")
    data = payload.model_dump()
    data["name"] = data["name"].strip()
    data["grade_level"] = data["grade_level"].strip()
    data["stream"] = data["stream"].strip()
    row = ClassGroup(id=uuid4(), school_id=context.school_id, **data)
    session.add(row)
    await _audit(session, context, "class_group.created", "class_group", row.id)
    await _commit_or_conflict(session, "That class group already exists for this year")
    return row


@router.get("/classes/{class_group_id}/enrollments", response_model=list[EnrollmentResponse])
async def list_enrollments(class_group_id: UUID, context: Annotated[TenantContext, Depends(require_roles(*roles))], session: Annotated[AsyncSession, Depends(get_session)]):
    group = await session.scalar(select(ClassGroup.id).where(ClassGroup.id == class_group_id, ClassGroup.school_id == context.school_id))
    if group is None:
        raise HTTPException(status_code=404, detail="Class group not found")
    query = select(StudentEnrollment).where(StudentEnrollment.school_id == context.school_id, StudentEnrollment.class_group_id == class_group_id).order_by(StudentEnrollment.enrolled_on)
    return list((await session.scalars(query)).all())


@router.get("/classes/{class_group_id}/roster", response_model=list[ClassRosterStudent])
async def class_roster(
    class_group_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*roles, MembershipRole.TEACHER))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == class_group_id, ClassGroup.school_id == context.school_id,
    ))
    if group is None:
        raise HTTPException(status_code=404, detail="Class group not found")
    if context.role == MembershipRole.TEACHER:
        membership_id = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.user_id == context.user_id,
            SchoolMembership.role == MembershipRole.TEACHER,
            SchoolMembership.status == "active",
        ))
        assigned = membership_id is not None and (
            group.class_teacher_membership_id == membership_id or bool(await session.scalar(
                select(ClassSubjectAssignment.id).where(
                    ClassSubjectAssignment.school_id == context.school_id,
                    ClassSubjectAssignment.class_group_id == group.id,
                    ClassSubjectAssignment.teacher_membership_id == membership_id,
                ).limit(1)
            ))
        )
        if not assigned:
            raise HTTPException(status_code=403, detail="You are not assigned to this class")
    rows = (await session.execute(
        select(Student, StudentEnrollment)
        .join(StudentEnrollment, (StudentEnrollment.student_id == Student.id)
              & (StudentEnrollment.school_id == Student.school_id))
        .where(
            Student.school_id == context.school_id,
            StudentEnrollment.class_group_id == group.id,
            StudentEnrollment.academic_year_id == group.academic_year_id,
            StudentEnrollment.status == "active",
            Student.status == "active",
        )
        .order_by(Student.first_name, Student.last_name)
    )).all()
    return [ClassRosterStudent(
        id=student.id, admission_number=student.admission_number,
        first_name=student.first_name, last_name=student.last_name,
        gender=student.gender, status=student.status, enrolled_on=enrollment.enrolled_on,
    ) for student, enrollment in rows]


@router.post("/enrollments", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def create_enrollment(payload: EnrollmentCreate, context: Annotated[TenantContext, Depends(require_roles(*writers))], session: Annotated[AsyncSession, Depends(get_session)]):
    student = await session.scalar(select(Student.id).where(Student.id == payload.student_id, Student.school_id == context.school_id))
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == payload.class_group_id, ClassGroup.school_id == context.school_id,
        ClassGroup.academic_year_id == payload.academic_year_id,
    ))
    if group is None:
        raise HTTPException(status_code=404, detail="Class group not found for this academic year")
    year = await session.scalar(select(AcademicYear).where(AcademicYear.id == payload.academic_year_id, AcademicYear.school_id == context.school_id))
    if year is None:
        raise HTTPException(status_code=404, detail="Academic year not found")
    if not year.starts_on <= payload.enrolled_on <= year.ends_on:
        raise HTTPException(status_code=422, detail="Enrollment date must fall within the academic year")
    row = StudentEnrollment(id=uuid4(), school_id=context.school_id, **payload.model_dump())
    session.add(row)
    await _audit(session, context, "student.enrolled", "student_enrollment", row.id)
    await _commit_or_conflict(session, "Student already has an enrollment for this academic year")
    return row


class UnassignedStudent(BaseModel):
    id: UUID
    admission_number: str
    first_name: str
    last_name: str
    status: str


class BulkEnrollRequest(BaseModel):
    student_ids: list[UUID] = Field(min_length=1, max_length=300)
    enrolled_on: date | None = None


class BulkEnrollResult(BaseModel):
    class_group_id: UUID
    enrolled: int
    skipped: int


@router.get("/years/{year_id}/unassigned-students", response_model=list[UnassignedStudent])
async def list_unassigned_students(
    year_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    search: str = "",
):
    """Active students with no enrollment in this academic year yet."""
    year = await session.scalar(select(AcademicYear.id).where(
        AcademicYear.id == year_id, AcademicYear.school_id == context.school_id,
    ))
    if year is None:
        raise HTTPException(status_code=404, detail="Academic year not found")
    enrolled = select(StudentEnrollment.student_id).where(
        StudentEnrollment.school_id == context.school_id,
        StudentEnrollment.academic_year_id == year_id,
    )
    query = select(Student).where(
        Student.school_id == context.school_id,
        Student.status == "active",
        Student.id.not_in(enrolled),
    )
    if search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(or_(
            Student.first_name.ilike(pattern),
            Student.last_name.ilike(pattern),
            Student.admission_number.ilike(pattern),
        ))
    students = (await session.scalars(
        query.order_by(Student.last_name, Student.first_name).limit(300)
    )).all()
    return [
        UnassignedStudent(
            id=student.id, admission_number=student.admission_number,
            first_name=student.first_name, last_name=student.last_name, status=student.status,
        )
        for student in students
    ]


@router.post(
    "/classes/{class_group_id}/enrollments/bulk",
    response_model=BulkEnrollResult,
    status_code=status.HTTP_201_CREATED,
)
async def bulk_enroll_students(
    class_group_id: UUID,
    payload: BulkEnrollRequest,
    context: Annotated[TenantContext, Depends(require_roles(*writers))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Place several students into one class in a single, audited step.

    A student can hold one enrollment per academic year, so anyone already
    enrolled this year is counted as skipped rather than failing the batch.
    """
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == class_group_id, ClassGroup.school_id == context.school_id,
    ))
    if group is None:
        raise HTTPException(status_code=404, detail="Class group not found")
    year = await session.scalar(select(AcademicYear).where(
        AcademicYear.id == group.academic_year_id, AcademicYear.school_id == context.school_id,
    ))
    if year is None:
        raise HTTPException(status_code=404, detail="Academic year not found")
    enrolled_on = payload.enrolled_on or year.starts_on
    if not year.starts_on <= enrolled_on <= year.ends_on:
        raise HTTPException(status_code=422, detail="Enrollment date must fall within the academic year")

    existing = set((await session.scalars(select(StudentEnrollment.student_id).where(
        StudentEnrollment.school_id == context.school_id,
        StudentEnrollment.academic_year_id == year.id,
    ))).all())
    valid = set((await session.scalars(select(Student.id).where(
        Student.school_id == context.school_id,
        Student.status == "active",
        Student.id.in_(payload.student_ids),
    ))).all())

    created = 0
    skipped = 0
    for student_id in dict.fromkeys(payload.student_ids):
        if student_id in existing or student_id not in valid:
            skipped += 1
            continue
        session.add(StudentEnrollment(
            id=uuid4(), school_id=context.school_id, student_id=student_id,
            academic_year_id=year.id, class_group_id=group.id,
            enrolled_on=enrolled_on, status="active",
        ))
        created += 1
    await _audit(session, context, "students.enrolled_bulk", "class_group", group.id)
    await _commit_or_conflict(session, "Some students were already enrolled. Refresh and try again.")
    return BulkEnrollResult(class_group_id=group.id, enrolled=created, skipped=skipped)


@router.get("/subjects", response_model=list[SubjectResponse])
async def list_subjects(context: Annotated[TenantContext, Depends(require_roles(*roles, MembershipRole.TEACHER))], session: Annotated[AsyncSession, Depends(get_session)]):
    result = await session.scalars(select(Subject).where(Subject.school_id == context.school_id, Subject.status == "active").order_by(Subject.name))
    return list(result)


@router.post("/subjects", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(payload: SubjectCreate, context: Annotated[TenantContext, Depends(require_roles(*writers))], session: Annotated[AsyncSession, Depends(get_session)]):
    row = Subject(id=uuid4(), school_id=context.school_id, code=payload.code, name=payload.name)
    session.add(row)
    await _audit(session, context, "subject.created", "subject", row.id)
    await _commit_or_conflict(session, "A subject with that code already exists")
    return row


@router.get("/teachers", response_model=list[TeacherResponse])
async def list_teachers(context: Annotated[TenantContext, Depends(require_roles(*roles))], session: Annotated[AsyncSession, Depends(get_session)]):
    loads = {
        membership_id: (classes_count, subjects_count)
        for membership_id, classes_count, subjects_count in (await session.execute(
            select(
                ClassSubjectAssignment.teacher_membership_id,
                func.count(func.distinct(ClassSubjectAssignment.class_group_id)),
                func.count(func.distinct(ClassSubjectAssignment.subject_id)),
            )
            .where(ClassSubjectAssignment.school_id == context.school_id)
            .group_by(ClassSubjectAssignment.teacher_membership_id)
        )).all()
    }
    owned_classes = dict((await session.execute(
        select(ClassGroup.class_teacher_membership_id, ClassGroup.name)
        .where(ClassGroup.school_id == context.school_id,
               ClassGroup.class_teacher_membership_id.is_not(None))
    )).all())
    result = await session.execute(
        select(SchoolMembership.id, User.id, User.display_name, User.email)
        .join(User, SchoolMembership.user_id == User.id)
        .where(SchoolMembership.school_id == context.school_id, SchoolMembership.role == MembershipRole.TEACHER,
               SchoolMembership.status == "active", User.status == "active")
        .order_by(User.display_name)
    )
    return [TeacherResponse(
        membership_id=row[0], user_id=row[1], display_name=row[2], email=row[3],
        class_teacher_of=owned_classes.get(row[0]),
        classes_taught=loads.get(row[0], (0, 0))[0],
        subjects_taught=loads.get(row[0], (0, 0))[1],
    ) for row in result.all()]


@router.get("/teaching-assignments", response_model=list[AssignmentResponse])
async def list_teaching_assignments(
    context: Annotated[TenantContext, Depends(require_roles(*roles, MembershipRole.TEACHER))],
    session: Annotated[AsyncSession, Depends(get_session)],
    academic_year_id: UUID | None = None,
):
    query = (
        select(ClassSubjectAssignment, ClassGroup, Subject, User)
        .join(ClassGroup, (ClassGroup.id == ClassSubjectAssignment.class_group_id) & (ClassGroup.school_id == ClassSubjectAssignment.school_id))
        .join(Subject, (Subject.id == ClassSubjectAssignment.subject_id) & (Subject.school_id == ClassSubjectAssignment.school_id))
        .join(SchoolMembership, (SchoolMembership.id == ClassSubjectAssignment.teacher_membership_id) & (SchoolMembership.school_id == ClassSubjectAssignment.school_id))
        .join(User, SchoolMembership.user_id == User.id)
        .where(ClassSubjectAssignment.school_id == context.school_id, SchoolMembership.status == "active", User.status == "active")
    )
    if context.role == MembershipRole.TEACHER:
        membership = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id, SchoolMembership.user_id == context.user_id,
            SchoolMembership.status == "active", SchoolMembership.role == MembershipRole.TEACHER,
        ))
        query = query.where(ClassSubjectAssignment.teacher_membership_id == membership)
    if academic_year_id:
        query = query.where(ClassGroup.academic_year_id == academic_year_id)
    result = await session.execute(query.order_by(ClassGroup.name, Subject.name, User.display_name))
    return [AssignmentResponse(
        id=assignment.id, class_group_id=group.id, class_name=group.name, academic_year_id=group.academic_year_id,
        subject_id=subject.id, subject_name=subject.name, subject_code=subject.code,
        teacher_membership_id=assignment.teacher_membership_id, teacher_name=user.display_name, teacher_email=user.email,
    ) for assignment, group, subject, user in result.all()]


@router.post("/teaching-assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_teaching_assignment(
    payload: AssignmentCreate,
    context: Annotated[TenantContext, Depends(require_roles(*writers))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == payload.class_group_id, ClassGroup.school_id == context.school_id,
    ))
    subject = await session.scalar(select(Subject).where(
        Subject.id == payload.subject_id, Subject.school_id == context.school_id, Subject.status == "active",
    ))
    teacher = await session.execute(
        select(SchoolMembership, User).join(User, SchoolMembership.user_id == User.id).where(
            SchoolMembership.id == payload.teacher_membership_id, SchoolMembership.school_id == context.school_id,
            SchoolMembership.role == MembershipRole.TEACHER, SchoolMembership.status == "active", User.status == "active",
        )
    )
    teacher_row = teacher.one_or_none()
    if group is None or subject is None or teacher_row is None:
        raise HTTPException(status_code=404, detail="Class, subject, or active teacher not found")
    assignment = ClassSubjectAssignment(id=uuid4(), school_id=context.school_id, **payload.model_dump())
    session.add(assignment)
    await _audit(session, context, "teacher.assigned_to_subject", "class_subject_assignment", assignment.id)
    await _commit_or_conflict(session, "This teacher is already assigned to that subject and class")
    membership, user = teacher_row
    return AssignmentResponse(
        id=assignment.id, class_group_id=group.id, class_name=group.name, academic_year_id=group.academic_year_id,
        subject_id=subject.id, subject_name=subject.name, subject_code=subject.code,
        teacher_membership_id=membership.id, teacher_name=user.display_name, teacher_email=user.email,
    )


@router.put("/classes/{class_group_id}/class-teacher", response_model=ClassResponse)
async def set_class_teacher(
    class_group_id: UUID,
    payload: ClassTeacherRequest,
    context: Annotated[TenantContext, Depends(require_roles(*writers))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Assign, change, or clear a class's class teacher.

    A teacher may only be the class teacher of one class at a time; subject
    assignments stay independent, so a teacher can teach many classes.
    """
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == class_group_id, ClassGroup.school_id == context.school_id,
    ))
    if group is None:
        raise HTTPException(status_code=404, detail="Class group not found")
    if payload.teacher_membership_id is None:
        group.class_teacher_membership_id = None
        await _audit(session, context, "teacher.cleared_as_class_teacher", "class_group", group.id)
        await _commit_or_conflict(session, "Could not clear the class teacher. Reload and try again")
        return (await _class_responses(session, context.school_id, [group]))[0]
    teacher = (await session.execute(
        select(SchoolMembership, User).join(User, SchoolMembership.user_id == User.id).where(
            SchoolMembership.id == payload.teacher_membership_id,
            SchoolMembership.school_id == context.school_id,
            SchoolMembership.role == MembershipRole.TEACHER,
            SchoolMembership.status == "active", User.status == "active",
        )
    )).one_or_none()
    if teacher is None:
        raise HTTPException(status_code=404, detail="Active teacher not found")
    other = await session.scalar(select(ClassGroup).where(
        ClassGroup.school_id == context.school_id,
        ClassGroup.class_teacher_membership_id == payload.teacher_membership_id,
        ClassGroup.id != group.id,
    ))
    if other is not None:
        raise HTTPException(
            status_code=409,
            detail=f"That teacher is already the class teacher of {other.name}. Clear that class first.",
        )
    group.class_teacher_membership_id = payload.teacher_membership_id
    await _audit(session, context, "teacher.assigned_as_class_teacher", "class_group", group.id)
    await _commit_or_conflict(session, "That teacher was assigned to another class at the same moment")
    return (await _class_responses(session, context.school_id, [group]))[0]
