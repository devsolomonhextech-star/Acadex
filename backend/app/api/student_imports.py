"""Bulk student import: template download, preview, confirm, history, error CSV."""
import re
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.api.students import student_roles
from app.db import get_session
from app.domain.student_import import (
    MAX_UPLOAD_BYTES,
    ImportConflict,
    ImportFileError,
    build_template,
    commit_import,
    error_csv,
    flag_existing_duplicates,
    parse_upload,
    summarise,
    validate_rows,
)
from app.models import StudentImportJob

router = APIRouter(prefix="/api/v1/student-imports", tags=["student-imports"])

MEDIA_TYPES = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


class ImportRowResponse(BaseModel):
    row_number: int
    admission_number: str
    first_name: str
    last_name: str
    date_of_birth: str | None
    status: Literal["valid", "error", "duplicate", "created"]
    message: str | None


class ImportJobSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    status: Literal["previewed", "confirmed"]
    total_rows: int
    valid_rows: int
    duplicate_rows: int
    error_rows: int
    created_rows: int
    skipped_rows: int
    created_at: datetime
    confirmed_at: datetime | None


class ImportJobDetail(ImportJobSummary):
    column_map: dict[str, str]
    rows: list[ImportRowResponse] = Field(
        validation_alias=AliasChoices("rows", "preview_rows")
    )


class ImportHistoryPage(BaseModel):
    items: list[ImportJobSummary]
    page: int
    page_size: int
    total: int


def _safe_filename(filename: str) -> str:
    stem = re.sub(r"[^\w.\- ]+", "_", filename or "import")[:200].strip() or "import"
    return stem


async def _load_job(session: AsyncSession, school_id: UUID, job_id: UUID) -> StudentImportJob:
    result = await session.execute(
        select(StudentImportJob).where(
            StudentImportJob.school_id == school_id,
            StudentImportJob.id == job_id,
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Import job not found")
    return job


@router.get("/template")
async def download_template(
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    format: Literal["csv", "xlsx"] = Query(default="csv"),
) -> Response:
    """Download the import template with canonical column headers and samples."""
    content = build_template(format)
    return Response(
        content=content,
        media_type=MEDIA_TYPES[format],
        headers={
            "Content-Disposition": f'attachment; filename="student-import-template.{format}"'
        },
    )


@router.post("/preview", response_model=ImportJobDetail, status_code=status.HTTP_201_CREATED)
async def preview_import(
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: Annotated[UploadFile, File()],
) -> StudentImportJob:
    """Parse and validate an uploaded file without creating any student records."""
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    filename = _safe_filename(file.filename or "")
    try:
        column_map, parsed = parse_upload(filename, content)
    except ImportFileError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    outcomes = validate_rows(parsed)
    await flag_existing_duplicates(session, context.school_id, outcomes)
    job = StudentImportJob(
        school_id=context.school_id,
        created_by_user_id=context.user_id,
        filename=filename,
        column_map=column_map,
        preview_rows=[item.as_dict() for item in outcomes],
        **summarise(outcomes),
    )
    session.add(job)
    await session.commit()
    return job


@router.get("", response_model=ImportHistoryPage)
async def import_history(
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
) -> ImportHistoryPage:
    """List this school's import jobs, newest first."""
    filters = [StudentImportJob.school_id == context.school_id]
    total = (
        await session.execute(
            select(func.count()).select_from(StudentImportJob).where(*filters)
        )
    ).scalar_one()
    jobs = (
        await session.execute(
            select(StudentImportJob)
            .where(*filters)
            .order_by(StudentImportJob.created_at.desc(), StudentImportJob.id.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars()
    return ImportHistoryPage(
        items=[ImportJobSummary.model_validate(job) for job in jobs],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/{job_id}", response_model=ImportJobDetail)
async def import_detail(
    job_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StudentImportJob:
    """Re-open a preview or review a confirmed import with its per-row outcomes."""
    return await _load_job(session, context.school_id, job_id)


@router.post("/{job_id}/confirm", response_model=ImportJobDetail)
async def confirm_import(
    job_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StudentImportJob:
    """Create students for every valid previewed row in one transaction."""
    job = await _load_job(session, context.school_id, job_id)
    try:
        await commit_import(session, context.school_id, context.user_id, job)
    except ImportConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    return job


@router.get("/{job_id}/errors.csv")
async def download_errors(
    job_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*student_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Download the failed and duplicate rows with their problems."""
    job = await _load_job(session, context.school_id, job_id)
    stem = _safe_filename(job.filename).rsplit(".", 1)[0]
    return Response(
        content=error_csv(job.preview_rows),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{stem}-errors.csv"'},
    )
