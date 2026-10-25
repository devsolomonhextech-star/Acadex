

from app.api.communications import router as communications_router
from app.api.family import router as family_router
from app.api.guardians import router as guardians_router

__all__ = [
    "academic_router",
    "assessments_router",
    "attendance_router",
    "communications_router",
    "family_router",
    "finance_router",
    "grading_router",
    "guardians_router",
    "identity_router",
    "overview_router",
    "results_router",
    "staff_router",
    "student_imports_router",
    "students_router",
    "timetable_router",
]
