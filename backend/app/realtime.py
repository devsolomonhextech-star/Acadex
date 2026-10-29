"""Live notification stream shared by the school dashboard and family devices.

The hub is process-local: the API runs as a single uvicorn worker, so an
in-memory registry is enough. A multi-worker deployment would replace the
delivery loop with Redis pub/sub behind the same interface.
"""
import asyncio
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import WebSocket

from app.models import Notification


class RealtimeHub:
    """Tracks open sockets per school and delivers events to named users."""

    def __init__(self) -> None:
        self._rooms: dict[UUID, dict[WebSocket, UUID]] = {}
        self._lock = asyncio.Lock()

    async def add(self, school_id: UUID, socket: WebSocket, user_id: UUID) -> None:
        async with self._lock:
            self._rooms.setdefault(school_id, {})[socket] = user_id

    async def remove(self, school_id: UUID, socket: WebSocket) -> None:
        async with self._lock:
            room = self._rooms.get(school_id)
            if not room:
                return
            room.pop(socket, None)
            if not room:
                self._rooms.pop(school_id, None)

    async def connection_count(self, school_id: UUID | None = None) -> int:
        async with self._lock:
            if school_id is None:
                return sum(len(room) for room in self._rooms.values())
            return len(self._rooms.get(school_id, {}))

    async def publish(
        self, school_id: UUID, user_ids: Iterable[UUID], event: dict[str, Any]
    ) -> int:
        """Send one event to every open socket belonging to those users."""
        recipients = set(user_ids)
        if not recipients:
            return 0
        async with self._lock:
            targets = [
                socket
                for socket, user_id in self._rooms.get(school_id, {}).items()
                if user_id in recipients
            ]
        delivered = 0
        for socket in targets:
            try:
                await socket.send_json(event)
                delivered += 1
            except Exception:  # noqa: BLE001 - a dead socket must not break the request
                await self.remove(school_id, socket)
        return delivered


hub = RealtimeHub()


def notification_event(notification: Notification) -> dict[str, Any]:
    created_at = notification.created_at or datetime.now(UTC)
    return {
        "type": "notification",
        "notification": {
            "id": str(notification.id),
            "title": notification.title,
            "body": notification.body,
            "kind": notification.type,
            "link": notification.link,
            "created_at": created_at.isoformat(),
        },
    }


async def publish_notifications(
    school_id: UUID, notifications: Sequence[Notification]
) -> int:
    """Fan a batch of saved notifications out to their live sockets."""
    delivered = 0
    for notification in notifications:
        delivered += await hub.publish(
            school_id, [notification.user_id], notification_event(notification)
        )
    return delivered
