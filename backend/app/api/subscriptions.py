"""Monthly student-seat subscriptions for Acadex schools."""
import asyncio
import calendar
import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request as FastAPIRequest
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import TenantContext, require_roles
from app.db import get_session
from app.domain.subscriptions import (
    StudentSubscriptionRequired,
    active_student_count,
    trial_active,
    trial_days_remaining,
)
from app.models import MembershipRole, School, SchoolSubscription, SubscriptionPayment, User
from app.settings import get_settings

router = APIRouter(prefix="/api/v1/subscription", tags=["subscription"])
ADMIN = require_roles(MembershipRole.SCHOOL_ADMIN)
PRICE_PER_STUDENT_PESWAS = 300  # GH₵3.00 each month
MAX_STUDENT_LIMIT = 100_000


class CheckoutRequest(BaseModel):
    student_limit: int = Field(ge=1, le=MAX_STUDENT_LIMIT)


class VerifyRequest(BaseModel):
    reference: str = Field(min_length=10, max_length=100)


def _next_month(value: datetime) -> datetime:
    month = value.month % 12 + 1
    year = value.year + (1 if value.month == 12 else 0)
    return value.replace(year=year, month=month, day=min(value.day, calendar.monthrange(year, month)[1]))


async def _subscription(session: AsyncSession, school_id: UUID, *, lock: bool = False) -> SchoolSubscription | None:
    statement = select(SchoolSubscription).where(SchoolSubscription.school_id == school_id)
    if lock:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


def _active(subscription: SchoolSubscription | None, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    return bool(
        subscription
        and subscription.status == "active"
        and subscription.current_period_end
        and subscription.current_period_end > now
    )


def subscription_limit_error(error: StudentSubscriptionRequired) -> HTTPException:
    return HTTPException(status_code=402, detail={
        "code": "student_subscription_required",
        "message": str(error),
        "active_students": error.active_students,
        "student_limit": error.student_limit,
        "available_places": error.available_places,
    })


def _paystack_call(method: str, path: str, secret: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = json.dumps(payload).encode() if payload is not None else None
    request = Request(
        f"https://api.paystack.co{path}",
        data=body,
        method=method,
        headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            result = json.loads(response.read())
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        raise RuntimeError("Paystack request failed") from error
    if not isinstance(result, dict) or not result.get("status"):
        raise RuntimeError("Paystack rejected the request")
    return result


async def _activate_payment(session: AsyncSession, payment: SubscriptionPayment) -> bool:
    """Apply a paid seat allocation once; safe for a callback and webhook race."""
    locked = (await session.execute(
        select(SubscriptionPayment).where(SubscriptionPayment.id == payment.id).with_for_update()
    )).scalar_one()
    if locked.status in {"paid", "failed"}:
        return False
    subscription = await _subscription(session, locked.school_id, lock=True)
    now = datetime.now(UTC)
    if subscription is None:
        subscription = SchoolSubscription(school_id=locked.school_id)
        session.add(subscription)
        await session.flush()
    # A same-size renewal purchased before expiry begins at the next renewal
    # date. New or larger seat allocations activate immediately.
    is_renewal = (
        _active(subscription, now)
        and locked.student_limit <= subscription.student_limit
        and subscription.current_period_end is not None
    )
    start = subscription.current_period_end if is_renewal else now
    subscription.student_limit = locked.student_limit
    subscription.status = "active"
    subscription.current_period_start = start
    subscription.current_period_end = _next_month(start)
    subscription.updated_at = now
    locked.status = "paid"
    locked.paid_at = now
    await session.commit()
    return True


@router.get("")
async def get_subscription(
    context: Annotated[TenantContext, Depends(ADMIN)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    subscription = await _subscription(session, context.school_id)
    school = await session.get(School, context.school_id)
    usage = await active_student_count(session, context.school_id)
    payments = (await session.execute(
        select(SubscriptionPayment)
        .where(SubscriptionPayment.school_id == context.school_id)
        .order_by(SubscriptionPayment.created_at.desc())
        .limit(10)
    )).scalars().all()
    active = _active(subscription)
    trial_ends_at = school.trial_ends_at if school else None
    in_trial = trial_active(trial_ends_at)
    if active:
        subscription_status = "active"
    elif in_trial:
        subscription_status = "trial"
    elif subscription and subscription.status == "active":
        subscription_status = "expired"
    else:
        subscription_status = "inactive"
    limit = subscription.student_limit if subscription else 0
    amount = Decimal(limit * PRICE_PER_STUDENT_PESWAS) / 100
    return {
        "status": subscription_status,
        "in_trial": in_trial,
        "trial_ends_at": trial_ends_at,
        "trial_days_remaining": trial_days_remaining(trial_ends_at) if in_trial else 0,
        "active_students": usage,
        "student_limit": limit,
        "available_places": max(limit - usage, 0) if active else 0,
        "price_per_student_ghs": "3.00",
        "monthly_total_ghs": f"{amount:.2f}",
        "current_period_start": subscription.current_period_start if subscription else None,
        "current_period_end": subscription.current_period_end if subscription else None,
        "payment_enabled": bool(get_settings().paystack_secret_key),
        "recent_payments": [
            {
                "reference": payment.reference,
                "student_limit": payment.student_limit,
                "amount_ghs": f"{Decimal(payment.amount_pesewas) / 100:.2f}",
                "status": payment.status,
                "created_at": payment.created_at,
                "paid_at": payment.paid_at,
            }
            for payment in payments
        ],
    }


@router.post("/checkout")
async def create_checkout(
    payload: CheckoutRequest,
    context: Annotated[TenantContext, Depends(ADMIN)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.paystack_secret_key:
        raise HTTPException(status_code=503, detail="Online subscription payments are not configured yet. Contact Acadex support.")
    usage = await active_student_count(session, context.school_id)
    if payload.student_limit < usage:
        raise HTTPException(status_code=422, detail=f"Choose at least {usage} student places to cover your current active students.")
    existing = await _subscription(session, context.school_id, lock=True)
    if _active(existing) and payload.student_limit < (existing.student_limit if existing else 0):
        raise HTTPException(status_code=422, detail="Student places can be reduced after the current subscription period ends.")
    user = await session.get(User, context.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Administrator account not found")
    if existing is None:
        existing = SchoolSubscription(school_id=context.school_id)
        session.add(existing)
        await session.flush()
    reference = f"acadex-{context.school_id.hex[:12]}-{secrets.token_hex(12)}"
    amount = payload.student_limit * PRICE_PER_STUDENT_PESWAS
    payment = SubscriptionPayment(
        school_id=context.school_id,
        created_by_user_id=context.user_id,
        reference=reference,
        student_limit=payload.student_limit,
        amount_pesewas=amount,
    )
    session.add(payment)
    await session.commit()
    callback = f"{settings.frontend_url.rstrip('/')}/settings?tab=billing"
    checkout_payload = {
        "email": user.email,
        "amount": str(amount),
        "currency": "GHS",
        "reference": reference,
        "callback_url": callback,
        "metadata": {
            "school_id": str(context.school_id),
            "student_limit": payload.student_limit,
            "service": "Acadex monthly student subscription",
        },
    }
    try:
        response = await asyncio.to_thread(
            _paystack_call, "POST", "/transaction/initialize", settings.paystack_secret_key, checkout_payload,
        )
        checkout = response.get("data", {})
        checkout_url = checkout.get("authorization_url")
        if not isinstance(checkout_url, str) or not checkout_url.startswith("https://checkout.paystack.com/"):
            raise RuntimeError("Invalid checkout URL")
    except RuntimeError:
        payment.status = "failed"
        await session.commit()
        raise HTTPException(status_code=502, detail="We could not start secure checkout. Please try again.") from None
    payment.checkout_url = checkout_url
    await session.commit()
    return {
        "checkout_url": checkout_url,
        "reference": reference,
        "amount_ghs": f"{Decimal(amount) / 100:.2f}",
        "student_limit": payload.student_limit,
    }


@router.post("/verify")
async def verify_checkout(
    payload: VerifyRequest,
    context: Annotated[TenantContext, Depends(ADMIN)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    payment = (await session.execute(select(SubscriptionPayment).where(
        SubscriptionPayment.school_id == context.school_id,
        SubscriptionPayment.reference == payload.reference,
    ))).scalar_one_or_none()
    if payment is None:
        raise HTTPException(status_code=404, detail="Subscription payment not found")
    if payment.status == "paid":
        return {"status": "paid", "student_limit": payment.student_limit}
    secret = get_settings().paystack_secret_key
    if not secret:
        raise HTTPException(status_code=503, detail="Online subscription payments are not configured yet.")
    try:
        response = await asyncio.to_thread(
            _paystack_call, "GET", f"/transaction/verify/{quote(payload.reference, safe='')}", secret,
        )
    except RuntimeError:
        raise HTTPException(status_code=502, detail="We could not verify the payment. Please retry shortly.") from None
    data = response.get("data", {})
    if (
        data.get("reference") != payment.reference
        or data.get("status") != "success"
        or data.get("currency") != "GHS"
        or data.get("amount") != payment.amount_pesewas
    ):
        return {"status": "pending", "student_limit": payment.student_limit}
    await _activate_payment(session, payment)
    return {"status": "paid", "student_limit": payment.student_limit}


@router.post("/webhook")
async def paystack_webhook(
    request: FastAPIRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    signature: Annotated[str | None, Header(alias="x-paystack-signature")] = None,
) -> dict[str, str]:
    secret = get_settings().paystack_secret_key
    if not secret or not signature:
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    raw = await request.body()
    expected = hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from None
    if event.get("event") != "charge.success":
        return {"status": "ignored"}
    data = event.get("data") or {}
    payment = (await session.execute(select(SubscriptionPayment).where(
        SubscriptionPayment.reference == data.get("reference"),
    ))).scalar_one_or_none()
    if (
        payment
        and data.get("status") == "success"
        and data.get("currency") == "GHS"
        and data.get("amount") == payment.amount_pesewas
    ):
        await _activate_payment(session, payment)
    return {"status": "accepted"}
