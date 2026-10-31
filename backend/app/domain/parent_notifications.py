"""Persist and dispatch parent-facing notification events."""
from collections.abc import Sequence
from uuid import UUID

from fastapi import BackgroundTasks, Request

from app.push import send_expo_push
from app.realtime import publish_user_event


async def dispatch_parent_notifications(
    request: Request,
    background: BackgroundTasks,
    *,
    school_id: UUID,
    recipients: Sequence[UUID],
    title: str,
    push_body: str,
    link: str,
    preference_key: str,
) -> None:
    """Notify active sessions immediately and queue best-effort Expo push delivery."""
    unique_recipients = list(dict.fromkeys(recipients))
    for user_id in unique_recipients:
        await publish_user_event(request, school_id, user_id)
    if unique_recipients:
        background.add_task(
            send_expo_push,
            school_id,
            unique_recipients,
            title[:160],
            " ".join(push_body.split())[:140],
            {"link": link, "preference_key": preference_key},
        )
