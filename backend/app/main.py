from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.academic import router as academic_router
from app.api.assessments import router as assessments_router
from app.api.attendance import router as attendance_router
from app.api.auth import router as identity_router
from app.api.finance import router as finance_router
from app.api.grading import router as grading_router
from app.api.overview import router as overview_router
from app.api.results import router as results_router
from app.api.staff import router as staff_router
from app.api.student_imports import router as student_imports_router
from app.api.students import router as students_router
from app.api.timetable import router as timetable_router
from app.db import engine
from app.settings import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.redis = Redis.from_url(settings.redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        yield
    finally:
        await application.state.redis.aclose()
        await engine.dispose()


app = FastAPI(title="SchoolOS API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)
app.include_router(identity_router)
app.include_router(students_router)
app.include_router(student_imports_router)
app.include_router(finance_router)
app.include_router(academic_router)
app.include_router(staff_router)
app.include_router(attendance_router)
app.include_router(assessments_router)
app.include_router(grading_router)
app.include_router(results_router)
app.include_router(timetable_router)
app.include_router(overview_router)


@app.get("/api/v1/health/live", tags=["operations"])
async def liveness() -> dict[str, str]:
    """Confirm the process is serving requests; dependency readiness is separate."""
    return {"status": "ok"}


@app.get("/api/v1/health/ready", tags=["operations"])
async def readiness(request: Request) -> dict[str, str]:
    """Report ready only when the API's required backing services respond."""
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        await request.app.state.redis.ping()
    except (SQLAlchemyError, RedisError) as error:
        raise HTTPException(status_code=503, detail="Required service is unavailable") from error
    return {"status": "ready"}
