"""School grading scale configuration used by term result computation."""
from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain.results import BandInput, GradingScaleError, validate_bands
from app.models import AuditEvent, GradingBand, GradingScale, MembershipRole

router = APIRouter(prefix="/api/v1/grading/scales", tags=["grading"])
read_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL, MembershipRole.REGISTRAR, MembershipRole.TEACHER)
manage_roles = (MembershipRole.SCHOOL_ADMIN, MembershipRole.PRINCIPAL)


class BandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min_percent: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)
    max_percent: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)
    grade: str = Field(min_length=1, max_length=12)
    points: Decimal | None = Field(default=None, ge=0, le=100, max_digits=4, decimal_places=2)
    description: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def normalize(self):
        self.grade = self.grade.strip()
        self.description = self.description.strip() if self.description else None
        if not self.grade:
            raise ValueError("A grade label is required")
        return self


class ScalePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=80)
    is_default: bool = False
    include_positions: bool = True
    bands: list[BandPayload] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def normalize_name(self):
        self.name = self.name.strip()
        if len(self.name) < 2:
            raise ValueError("Scale name must contain at least two characters")
        return self


class BandResponse(BaseModel):
    min_percent: Decimal
    max_percent: Decimal
    grade: str
    points: Decimal | None
    description: str | None


class ScaleResponse(BaseModel):
    id: UUID
    name: str
    is_default: bool
    include_positions: bool
    status: str
    bands: list[BandResponse]
    created_at: datetime
    updated_at: datetime


async def _validate_and_store_bands(session: AsyncSession, school_id: UUID, scale_id: UUID,
                                    bands: list[BandPayload]) -> list[BandInput]:
    try:
        ordered = validate_bands([BandInput(
            min_percent=band.min_percent, max_percent=band.max_percent, grade=band.grade,
            points=band.points, description=band.description,
        ) for band in bands])
    except GradingScaleError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    # Bands are replaced wholesale; results already store their grade labels.
    await session.execute(delete(GradingBand).where(
        GradingBand.scale_id == scale_id, GradingBand.school_id == school_id,
    ))
    for band in ordered:
        session.add(GradingBand(
            id=uuid4(), school_id=school_id, scale_id=scale_id,
            min_percent=band.min_percent, max_percent=band.max_percent, grade=band.grade,
            points=band.points, description=band.description,
        ))
    return ordered


async def _response(session: AsyncSession, scale: GradingScale) -> ScaleResponse:
    bands = await session.execute(select(GradingBand).where(
        GradingBand.school_id == scale.school_id, GradingBand.scale_id == scale.id,
    ).order_by(GradingBand.min_percent))
    return ScaleResponse(
        id=scale.id, name=scale.name, is_default=scale.is_default,
        include_positions=scale.include_positions, status=scale.status,
        bands=[BandResponse(min_percent=band.min_percent, max_percent=band.max_percent,
                            grade=band.grade, points=band.points, description=band.description)
               for band in bands.scalars()],
        created_at=scale.created_at, updated_at=scale.updated_at,
    )


@router.get("", response_model=list[ScaleResponse])
async def list_scales(
    context: Annotated[TenantContext, Depends(require_roles(*read_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    scales = await session.execute(select(GradingScale).where(
        GradingScale.school_id == context.school_id, GradingScale.status == "active",
    ).order_by(GradingScale.is_default.desc(), GradingScale.name))
    return [await _response(session, scale) for scale in scales.scalars()]


@router.post("", response_model=ScaleResponse, status_code=status.HTTP_201_CREATED)
async def create_scale(
    payload: ScalePayload,
    context: Annotated[TenantContext, Depends(require_roles(*manage_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    scale = GradingScale(
        id=uuid4(), school_id=context.school_id, name=payload.name,
        is_default=payload.is_default, include_positions=payload.include_positions,
    )
    session.add(scale)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="A grading scale with this name already exists") from None
    await _validate_and_store_bands(session, context.school_id, scale.id, payload.bands)
    if payload.is_default:
        await session.execute(update(GradingScale).where(
            GradingScale.school_id == context.school_id, GradingScale.id != scale.id,
        ).values(is_default=False).execution_options(synchronize_session=False))
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="grading_scale.created", resource_type="grading_scale", resource_id=scale.id))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="A grading scale with this name already exists") from None
    return await _response(session, scale)


@router.put("/{scale_id}", response_model=ScaleResponse)
async def update_scale(
    scale_id: UUID,
    payload: ScalePayload,
    context: Annotated[TenantContext, Depends(require_roles(*manage_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(select(GradingScale).where(
        GradingScale.id == scale_id, GradingScale.school_id == context.school_id,
    ).with_for_update())
    scale = result.scalar_one_or_none()
    if scale is None:
        raise HTTPException(status_code=404, detail="Grading scale not found")
    scale.name = payload.name
    scale.is_default = payload.is_default
    scale.include_positions = payload.include_positions
    await _validate_and_store_bands(session, context.school_id, scale.id, payload.bands)
    if payload.is_default:
        await session.execute(update(GradingScale).where(
            GradingScale.school_id == context.school_id, GradingScale.id != scale.id,
        ).values(is_default=False).execution_options(synchronize_session=False))
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="grading_scale.updated", resource_type="grading_scale", resource_id=scale.id))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="A grading scale with this name already exists") from None
    return await _response(session, scale)


@router.delete("/{scale_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_scale(
    scale_id: UUID,
    context: Annotated[TenantContext, Depends(require_roles(*manage_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(select(GradingScale).where(
        GradingScale.id == scale_id, GradingScale.school_id == context.school_id,
    ).with_for_update())
    scale = result.scalar_one_or_none()
    if scale is None:
        raise HTTPException(status_code=404, detail="Grading scale not found")
    if scale.is_default:
        raise HTTPException(status_code=409, detail="Set another scale as default before archiving this one")
    scale.status = "archived"
    session.add(AuditEvent(school_id=context.school_id, actor_user_id=context.user_id,
                           action="grading_scale.archived", resource_type="grading_scale", resource_id=scale.id))
    await session.commit()
