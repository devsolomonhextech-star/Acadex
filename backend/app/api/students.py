from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
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
from app.models import MembershipRole, Student

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
) -> StudentPageResponse:
    result = await list_students(session, context.school_id, page, page_size, search, status_filter)
    return StudentPageResponse(
        items=[response_for(item) for item in result.items],
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
