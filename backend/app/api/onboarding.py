"""Live completion progress for the school administrator setup checklist."""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.models import (
    AcademicTerm,
    AcademicYear,
    Assessment,
    ClassGroup,
    ClassSubjectAssignment,
    FeeStructure,
    GradingScale,
    Guardian,
    MembershipRole,
    School,
    SchoolInvitation,
    SchoolMembership,
    Student,
    StudentGuardian,
    Subject,
)

router = APIRouter(prefix="/api/v1/onboarding", tags=["school onboarding"])
ADMIN = (MembershipRole.SCHOOL_ADMIN,)


async def _count(session: AsyncSession, model, *conditions) -> int:
    return int(await session.scalar(select(func.count()).select_from(model).where(*conditions)) or 0)


@router.get("/progress")
async def onboarding_progress(
    context: Annotated[TenantContext, Depends(require_roles(*ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    school = await session.get(School, context.school_id)
    years = await _count(session, AcademicYear, AcademicYear.school_id == context.school_id)
    terms = await _count(session, AcademicTerm, AcademicTerm.school_id == context.school_id)
    classes = await _count(session, ClassGroup, ClassGroup.school_id == context.school_id)
    subjects = await _count(session, Subject, Subject.school_id == context.school_id, Subject.status == "active")
    class_subjects = await _count(session, ClassSubjectAssignment, ClassSubjectAssignment.school_id == context.school_id)
    students = await _count(session, Student, Student.school_id == context.school_id, Student.status == "active")
    teachers = await _count(session, SchoolMembership, SchoolMembership.school_id == context.school_id,
                            SchoolMembership.role == MembershipRole.TEACHER, SchoolMembership.status == "active")
    fee_structures = await _count(session, FeeStructure, FeeStructure.school_id == context.school_id,
                                  FeeStructure.status == "active")
    grading_scales = await _count(session, GradingScale, GradingScale.school_id == context.school_id,
                                  GradingScale.status == "active")
    assessments = await _count(session, Assessment, Assessment.school_id == context.school_id)
    invitations = await _count(session, SchoolInvitation, SchoolInvitation.school_id == context.school_id,
                               SchoolInvitation.status == "pending")
    linked_parents = await session.scalar(
        select(func.count(func.distinct(Guardian.id)))
        .join(StudentGuardian, StudentGuardian.guardian_id == Guardian.id)
        .where(Guardian.school_id == context.school_id, Guardian.user_id.is_not(None))
    ) or 0
    steps: list[dict] = [
        {"id": "profile", "title": "Create your school profile", "description": "Confirm your school name and identity.", "to": "/settings", "count": 1 if school and school.name.strip() else 0, "target": 1},
        {"id": "calendar", "title": "Set academic year and terms", "description": "Add the school year and its teaching terms.", "to": "/classes", "count": min(years, 1) + min(terms, 1), "target": 2},
        {"id": "classes", "title": "Create classes and subjects", "description": "Set up classes, subjects, and class-subject assignments.", "to": "/classes", "count": min(classes, 1) + min(subjects, 1) + min(class_subjects, 1), "target": 3},
        {"id": "records", "title": "Add teachers and students", "description": "Create records or import your existing roster.", "to": "/students", "count": min(teachers, 1) + min(students, 1), "target": 2},
        {"id": "fees", "title": "Configure fee structures", "description": "Set the fees for classes and academic terms.", "to": "/finance", "count": min(fee_structures, 1), "target": 1},
        {"id": "grading", "title": "Set assessment and grading rules", "description": "Create a grading scale and record your first assessment.", "to": "/assessments", "count": min(grading_scales, 1) + min(assessments, 1), "target": 2},
        {"id": "invites", "title": "Invite teachers and parents", "description": "Invite staff and link parent accounts to children.", "to": "/teachers", "count": min(invitations, 1) + min(int(linked_parents), 1), "target": 2},
    ]
    for step in steps:
        step["complete"] = step["count"] >= step["target"]
    completed = sum(1 for step in steps if step["complete"])
    steps.append({
        "id": "review", "title": "Review and activate your school", 
        "description": "Review each setup area and confirm your school is ready to launch.",
        "to": "/settings", "count": 1 if completed == 7 and school and school.status == "active" else 0,
        "target": 1, "complete": completed == 7 and bool(school and school.status == "active"),
    })
    completed_steps = sum(1 for step in steps if step["complete"])
    return {"steps": steps, "completed": completed_steps, "total": len(steps),
            "progress_percent": round(completed_steps * 100 / len(steps)),
            "school_name": school.name if school else "Your school"}
