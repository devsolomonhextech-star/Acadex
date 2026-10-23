"""Daily class attendance with school and teacher-assignment authorization."""
from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import (
    AcademicYear,
    AttendanceRecord,
    AttendanceSession,
    AuditEvent,
    ClassGroup,
    ClassSubjectAssignment,
    MembershipRole,
    SchoolMembership,
    Student,
    StudentEnrollment,
)

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])
attendance_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR, MembershipRole.TEACHER)
AttendanceStatus = Literal["present", "absent", "late", "excused"]


class AttendanceStudent(BaseModel):
    student_id: UUID
    admission_number: str
    first_name: str
    last_name: str
    status: AttendanceStatus | Literal["unmarked"]
    note: str | None


class AttendanceSheet(BaseModel):
    class_group_id: UUID
    class_name: str
    academic_year_id: UUID
    attendance_date: date
    session_id: UUID | None
    updated_at: datetime | None = None
    students: list[AttendanceStudent]


class AttendanceMark(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: UUID
    status: AttendanceStatus
    note: str | None = Field(default=None, max_length=240)


class AttendanceSave(BaseModel):
    class_group_id: UUID
    attendance_date: date
    marks: list[AttendanceMark] = Field(min_length=1, max_length=500)


async def _class_access(session: AsyncSession, context: TenantContext, class_group_id: UUID) -> ClassGroup:
    group = await session.scalar(select(ClassGroup).where(
        ClassGroup.id == class_group_id, ClassGroup.school_id == context.school_id,
    ))
    if group is None:
        raise HTTPException(status_code=404, detail="Class group not found")
    if context.role == MembershipRole.TEACHER:
        membership_id = await session.scalar(select(SchoolMembership.id).where(
            SchoolMembership.school_id == context.school_id, SchoolMembership.user_id == context.user_id,
            SchoolMembership.status == "active", SchoolMembership.role == MembershipRole.TEACHER,
        ))
        assigned = await session.scalar(select(ClassSubjectAssignment.id).where(
            ClassSubjectAssignment.school_id == context.school_id,
            ClassSubjectAssignment.class_group_id == class_group_id,
            ClassSubjectAssignment.teacher_membership_id == membership_id,
        ).limit(1))
        if not assigned:
            raise HTTPException(status_code=403, detail="Attendance is available only for your assigned classes")
    return group


async def _check_date(session: AsyncSession, context: TenantContext, group: ClassGroup, attendance_date: date) -> None:
    year = await session.scalar(select(AcademicYear).where(
        AcademicYear.id == group.academic_year_id, AcademicYear.school_id == context.school_id,
    ))
    if year is None or not year.starts_on <= attendance_date <= year.ends_on:
        raise HTTPException(status_code=422, detail="Attendance date must fall within the class academic year")


@router.get("/sheet", response_model=AttendanceSheet)
async def get_sheet(
    class_group_id: UUID,
    attendance_date: date,
    context: Annotated[TenantContext, Depends(require_roles(*attendance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    group = await _class_access(session, context, class_group_id)
    await _check_date(session, context, group, attendance_date)
    attendance = await session.scalar(select(AttendanceSession).where(
        AttendanceSession.school_id == context.school_id,
        AttendanceSession.class_group_id == group.id,
        AttendanceSession.attendance_date == attendance_date,
    ))
    roster_query = (
        select(Student, AttendanceRecord)
        .join(StudentEnrollment, (StudentEnrollment.student_id == Student.id) & (StudentEnrollment.school_id == Student.school_id))
        .outerjoin(AttendanceRecord, (AttendanceRecord.student_id == Student.id) & (AttendanceRecord.school_id == Student.school_id) & (AttendanceRecord.session_id == attendance.id if attendance else AttendanceRecord.session_id.is_(None)))
        .where(StudentEnrollment.school_id == context.school_id, StudentEnrollment.class_group_id == group.id,
               StudentEnrollment.status == "active", Student.status == "active")
        .order_by(Student.last_name, Student.first_name, Student.admission_number)
    )
    rows = (await session.execute(roster_query)).all()
    return AttendanceSheet(
        class_group_id=group.id, class_name=group.name, academic_year_id=group.academic_year_id,
        attendance_date=attendance_date, session_id=attendance.id if attendance else None,
        updated_at=attendance.updated_at if attendance else None,
        students=[AttendanceStudent(
            student_id=student.id, admission_number=student.admission_number, first_name=student.first_name,
            last_name=student.last_name, status=record.status if record else "unmarked", note=record.note if record else None,
        ) for student, record in rows],
    )


@router.put("/sheet", response_model=AttendanceSheet)
async def save_sheet(
    payload: AttendanceSave,
    context: Annotated[TenantContext, Depends(require_roles(*attendance_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    group = await _class_access(session, context, payload.class_group_id)
    await _check_date(session, context, group, payload.attendance_date)
    submitted = [mark.student_id for mark in payload.marks]
    if len(set(submitted)) != len(submitted):
        raise HTTPException(status_code=422, detail="Each student can appear only once")
    enrolled = set((await session.scalars(select(StudentEnrollment.student_id).where(
        StudentEnrollment.school_id == context.school_id, StudentEnrollment.class_group_id == group.id,
        StudentEnrollment.status == "active",
    ))).all())
    if set(submitted) != enrolled:
        raise HTTPException(status_code=422, detail="Attendance must include every currently enrolled student exactly once")

    membership_id = await session.scalar(select(SchoolMembership.id).where(
        SchoolMembership.school_id == context.school_id, SchoolMembership.user_id == context.user_id,
        SchoolMembership.status == "active",
    ))
    attendance = await session.scalar(select(AttendanceSession).where(
        AttendanceSession.school_id == context.school_id, AttendanceSession.class_group_id == group.id,
        AttendanceSession.attendance_date == payload.attendance_date,
    ).with_for_update())
    created = attendance is None
    if attendance is None:
        attendance = AttendanceSession(id=uuid4(), school_id=context.school_id, class_group_id=group.id,
                                       attendance_date=payload.attendance_date, recorded_by_membership_id=membership_id)
        session.add(attendance)
        await session.flush()

    existing_records = await session.scalars(select(AttendanceRecord).where(
        AttendanceRecord.school_id == context.school_id, AttendanceRecord.session_id == attendance.id,
    ).with_for_update())
    record_by_student = {record.student_id: record for record in existing_records}
    changed = created
    for mark in payload.marks:
        record = record_by_student.get(mark.student_id)
        note = mark.note.strip() if mark.note and mark.note.strip() else None
        if record is None:
            session.add(AttendanceRecord(school_id=context.school_id, session_id=attendance.id,
                                         student_id=mark.student_id, status=mark.status, note=note))
            changed = True
        elif record.status != mark.status or record.note != note:
            record.status = mark.status
            record.note = note
            changed = True
    if changed:
        attendance.recorded_by_membership_id = membership_id
        session.add(AuditEvent(
            school_id=context.school_id, actor_user_id=context.user_id,
            action="attendance.recorded" if created else "attendance.corrected",
            resource_type="attendance_session", resource_id=attendance.id,
        ))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Attendance was updated at the same time. Reload and try again") from None
    return await get_sheet(payload.class_group_id, payload.attendance_date, context, session)
