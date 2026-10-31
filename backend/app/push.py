"""Best-effort Expo push delivery for parent devices.

Push is a courtesy channel: the in-app ``Notification`` row is the source of
truth, and delivery failures are logged rather than raised so a school reply is
never lost because a handset is offline or a token went stale.
"""
import asyncio
import json
import logging
from collections.abc import Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from sqlalchemy import delete, select

from app.db import session_factory
from app.models import MobilePushDevice, SchoolMembership, User

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
CHUNK_SIZE = 100
TIMEOUT_SECONDS = 8


def _post(payload: list[dict]) -> dict:
    request = Request(
        EXPO_PUSH_URL,
        data=json.dumps(payload).encode(),
        method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read())


async def _deliver(messages: list[dict]) -> set[str]:
    """Send one chunk and return tokens Expo reported as no longer registered."""
    try:
        result = await asyncio.to_thread(_post, messages)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        logger.warning("Push delivery failed: %s", error)
        return set()
    tickets = result.get("data") if isinstance(result, dict) else None
    if not isinstance(tickets, list):
        return set()
    dead: set[str] = set()
    for message, ticket in zip(messages, tickets, strict=False):
        if not isinstance(ticket, dict) or ticket.get("status") != "error":
            continue
        details = ticket.get("details")
        if isinstance(details, dict) and details.get("error") == "DeviceNotRegistered":
            dead.add(message["to"])
    return dead


async def send_expo_push(
    school_id: UUID,
    user_ids: Sequence[UUID],
    title: str,
    body: str,
    data: dict | None = None,
) -> int:
    """Push a message to every registered device for the given users.

    Runs detached from the request that queued it, so every failure mode —
    database, network, Expo — is swallowed and logged rather than surfacing.
    """
    try:
        return await _send(school_id, user_ids, title, body, data)
    except Exception as error:  # noqa: BLE001 - push must never break a request
        logger.warning("Push dispatch failed: %s", error)
        return 0


async def _send(
    school_id: UUID,
    user_ids: Sequence[UUID],
    title: str,
    body: str,
    data: dict | None,
) -> int:
    recipients = list(dict.fromkeys(user_ids))
    if not recipients:
        return 0
    async with session_factory() as session:
        category = (data or {}).get("preference_key")
        token_rows = (await session.execute(
            select(MobilePushDevice.push_token, User.notification_preferences)
            .join(User, User.id == MobilePushDevice.user_id)
            .join(SchoolMembership, SchoolMembership.user_id == User.id)
            .where(
                MobilePushDevice.school_id == school_id,
                MobilePushDevice.user_id.in_(recipients),
                SchoolMembership.school_id == school_id,
                SchoolMembership.status == "active",
            )
        )).all()
        tokens = [
            token for token, preferences in token_rows
            if not (
                category
                and preferences
                and not preferences.get(category, True)
            )
        ]
    if not tokens:
        return 0
    payload = [
        {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": "high",
            "channelId": "school-updates",
            "data": data or {},
        }
        for token in tokens
    ]
    dead: set[str] = set()
    for start in range(0, len(payload), CHUNK_SIZE):
        dead.update(await _deliver(payload[start:start + CHUNK_SIZE]))
    if dead:
        async with session_factory() as session:
            await session.execute(
                delete(MobilePushDevice).where(
                    MobilePushDevice.school_id == school_id,
                    MobilePushDevice.push_token.in_(dead),
                )
            )
            await session.commit()
        logger.info("Removed %d unregistered push token(s)", len(dead))
    return len(payload)
