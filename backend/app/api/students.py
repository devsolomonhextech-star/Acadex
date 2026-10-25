from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain.students import (
    DuplicateAdmissionNumber,
    StudentInput,
    StudentNotFound,
    create_student,
    get_student,
    list_students,
)
from app.models import AcademicYear, ClassGroup, Guardian, MembershipRole, Student, StudentEnrollment, StudentGuardian

router = APIRouter(prefix="/api/v1/students", tags=["students"])
student_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR)


class StudentCreate(BaseModel):
    admission_number: str = Field(min_length=1, max_length=40)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    date_of_birth: date | None = None

    @field_validator("admission_number")
    @classmethod
    def normalize_admission_number(cls, value: str) -> str:
        value = value.strip().upper()
        if not value or any(char.isspace() for char in value):
            raise ValueError("Admission number cannot contain spaces")
        return value

    @field_validator("first_name", "last_name")
    @classmethod
    def normalize_person_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Name cannot be empty")
        return value

    @model_validator(mode="after")
    def birth_date_is_not_in_future(self) -> "StudentCreate":
        if self.date_of_birth and self.date_of_birth > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return self


class StudentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    admission_number: str
    first_name: str
    last_name: str
    date_of_birth: date | None
    status: str
    class_name: str | None = None
    guardian_name: str | None = None
    guardian_contact: str | None = None


class StudentPageResponse(BaseModel):
    items: list[StudentResponse]
    page: int
    page_size: int
    total: int


def response_for(student: Student) -> StudentResponse:
    return StudentResponse.model_validate(student)


@router.get("", response_model=StudentPageResponse)
async def students_directory(
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    search: str | None = Query(default=None, min_length=1, max_length=80),
    status_filter: Literal["active", "transferred", "graduated", "withdrawn"] | None = Query(
        default=None, alias="status"
    ),
    academic_year_id: UUID | None = None,
) -> StudentPageResponse:
    result = await list_students(session, context.school_id, page, page_size, search, status_filter)
    year_classes: dict[UUID, str] = {}
    if academic_year_id is not None:
        year_exists = await session.scalar(select(AcademicYear.id).where(
            AcademicYear.id == academic_year_id, AcademicYear.school_id == context.school_id,
        ))
        if year_exists is None:
            raise HTTPException(status_code=404, detail="Academic year not found")
        if result.items:
            class_rows = (await session.execute(
                select(StudentEnrollment.student_id, ClassGroup.name)
                .join(ClassGroup, (ClassGroup.id == StudentEnrollment.class_group_id)
                      & (ClassGroup.school_id == StudentEnrollment.school_id))
                .where(StudentEnrollment.school_id == context.school_id,
                       StudentEnrollment.academic_year_id == academic_year_id,
                       StudentEnrollment.status == "active",
                       StudentEnrollment.student_id.in_([student.id for student in result.items]))
            )).all()
            year_classes = {student_id: class_name for student_id, class_name in class_rows}
    guardians: dict[UUID, tuple[str, str | None]] = {}
    if result.items:
        guardian_rows = (await session.execute(
            select(StudentGuardian.student_id, Guardian.first_name, Guardian.last_name,
                   Guardian.email, Guardian.phone)
            .join(Guardian, (Guardian.id == StudentGuardian.guardian_id)
                  & (Guardian.school_id == StudentGuardian.school_id))
            .where(StudentGuardian.school_id == context.school_id,
                   StudentGuardian.is_primary.is_(True),
                   StudentGuardian.student_id.in_([student.id for student in result.items]))
        )).all()
        guardians = {
            student_id: (f"{first_name} {last_name}", email or phone)
            for student_id, first_name, last_name, email, phone in guardian_rows
        }
    return StudentPageResponse(
        items=[StudentResponse.model_validate(item).model_copy(update={
            "class_name": year_classes.get(item.id),
            "guardian_name": guardians.get(item.id, (None, None))[0],
            "guardian_contact": guardians.get(item.id, (None, None))[1],
        }) for item in result.items],
        page=page,
        page_size=page_size,
        total=result.total,
    )


@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def add_student(
    payload: StudentCreate,
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StudentResponse:
    try:
        student = await create_student(
            session,
            context.school_id,
            context.user_id,
            StudentInput(
                admission_number=payload.admission_number,
                first_name=payload.first_name,
                last_name=payload.last_name,
                date_of_birth=payload.date_of_birth,
            ),
        )
    except DuplicateAdmissionNumber:
        raise HTTPException(
            status_code=409,
            detail="That admission number is already in use at this school",
        ) from None
    return response_for(student)


@router.get("/{student_id}", response_model=StudentResponse)
async def student_detail(
    student_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StudentResponse:
    try:
        student = await get_student(session, context.school_id, student_id)
    except StudentNotFound:
        raise HTTPException(status_code=404, detail="Student not found") from None
    return response_for(student)
