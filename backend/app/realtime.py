"""Short-lived WebSocket tickets and per-user Redis event delivery."""
import hashlib
import json
import secrets
import asyncio
from collections.abc import Iterable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, WebSocket
from pydantic import BaseModel
from redis.exceptions import RedisError

from app.api.auth import TenantContext, current_tenant

router = APIRouter(prefix="/api/v1/realtime", tags=["realtime"])


class RealtimeHub:
    """Compatibility hub for the legacy authenticated socket module."""

    def __init__(self) -> None:
        self._rooms: dict[UUID, dict[WebSocket, UUID]] = {}
        self._lock = asyncio.Lock()

    async def add(self, school_id: UUID, socket: WebSocket, user_id: UUID) -> None:
        async with self._lock:
            self._rooms.setdefault(school_id, {})[socket] = user_id

    async def remove(self, school_id: UUID, socket: WebSocket) -> None:
        async with self._lock:
            room = self._rooms.get(school_id, {})
            room.pop(socket, None)
            if not room:
                self._rooms.pop(school_id, None)

    async def publish(self, school_id: UUID, user_ids: Iterable[UUID], event: dict) -> int:
        targets = set(user_ids)
        async with self._lock:
            sockets = [socket for socket, user_id in self._rooms.get(school_id, {}).items() if user_id in targets]
        delivered = 0
        for socket in sockets:
            try:
                await socket.send_json(event)
                delivered += 1
            except Exception:  # noqa: BLE001 - dead sockets must not break delivery
                await self.remove(school_id, socket)
        return delivered


hub = RealtimeHub()


class TicketResponse(BaseModel):
    ticket: str
    expires_in: int = 30


@router.post("/ticket", response_model=TicketResponse)
async def create_ticket(
    request: Request,
    context: Annotated[TenantContext, Depends(current_tenant)],
) -> TicketResponse:
    ticket = secrets.token_urlsafe(32)
    key = "acadex:ws-ticket:" + hashlib.sha256(ticket.encode()).hexdigest()
    await request.app.state.redis.set(
        key, json.dumps({"school_id": str(context.school_id), "user_id": str(context.user_id)}), ex=30, nx=True
    )
    return TicketResponse(ticket=ticket)


async def publish_user_event(request: Request, school_id: UUID, user_id: UUID, event: str = "notifications.updated") -> None:
    """Publish a cache-invalidation event; notification rows remain the source of truth."""
    try:
        await request.app.state.redis.publish(
            f"acadex:school:{school_id}:user:{user_id}", json.dumps({"type": event})
        )
    except (AttributeError, RedisError):
        # Real-time delivery is best effort; REST and Expo push remain available.
        pass


@router.websocket("/ws")
async def websocket_events(websocket: WebSocket, ticket: str = "") -> None:
    redis = websocket.app.state.redis
    key = "acadex:ws-ticket:" + hashlib.sha256(ticket.encode()).hexdigest()
    try:
        raw = await redis.getdel(key)
    except (RedisError, AttributeError):
        raw = None
    if not raw:
        await websocket.close(code=4401)
        return
    identity = json.loads(raw)
    channel = f"acadex:school:{identity['school_id']}:user:{identity['user_id']}"
    await websocket.accept()
    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(channel)
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message.get("type") == "message":
                data = message["data"]
                await websocket.send_text(data.decode() if isinstance(data, bytes) else data)
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
