"""Authenticated WebSocket for live notifications.

Clients authenticate with the same short-lived access token used by the REST
API. The token travels either as ``?token=`` (simple clients and tooling) or,
preferably, as the second WebSocket subprotocol — ``["acadex.v1", token]`` —
which keeps it out of proxy access logs.
"""
from uuid import UUID

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.db import session_factory
from app.models import MembershipRole, School, SchoolMembership, User
from app.realtime import hub
from app.security import decode_access_token

router = APIRouter()
SUBPROTOCOL = "acadex.v1"
CLOSE_UNAUTHORIZED = 4401


async def _authenticate(socket: WebSocket) -> tuple[UUID, UUID, str] | None:
    return await authenticate_token(_candidate_tokens(socket)[0] if _candidate_tokens(socket) else None)


def _candidate_tokens(socket: WebSocket) -> list[str]:
    tokens: list[str] = []
    query_token = socket.query_params.get("token")
    if query_token:
        tokens.append(query_token)
    protocols = socket.scope.get("subprotocols") or []
    if len(protocols) >= 2 and protocols[0] == SUBPROTOCOL:
        tokens.append(protocols[1])
    return tokens


async def authenticate_token(token: str | None) -> tuple[UUID, UUID, str] | None:
    """Validate an access token and its live membership; returns (user, school, role)."""
    if not token:
        return None
    try:
        claims = decode_access_token(token)
        if claims.get("type") != "access":
            return None
        user_id, school_id = UUID(claims["sub"]), UUID(claims["school_id"])
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return None
    async with session_factory() as session:
        membership = await session.scalar(
            select(SchoolMembership)
            .join(School, SchoolMembership.school_id == School.id)
            .join(User, SchoolMembership.user_id == User.id)
            .where(
                SchoolMembership.user_id == user_id,
                SchoolMembership.school_id == school_id,
                SchoolMembership.status == "active",
                School.status == "active",
                User.status == "active",
            )
        )
    if membership is None:
        return None
    return user_id, school_id, membership.role.value


@router.websocket("/api/v1/ws")
async def notifications_socket(websocket: WebSocket) -> None:
    identity = None
    for token in _candidate_tokens(websocket):
        identity = await authenticate_token(token)
        if identity:
            break
    if identity is None:
        await websocket.close(code=CLOSE_UNAUTHORIZED)
        return

    user_id, school_id, role = identity
    requested = websocket.scope.get("subprotocols") or []
    await websocket.accept(subprotocol=SUBPROTOCOL if SUBPROTOCOL in requested else None)
    await hub.add(school_id, websocket, user_id)
    try:
        await websocket.send_json({"type": "connected", "role": role})
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await hub.remove(school_id, websocket)


def _role_is_parent(role: str) -> bool:
    return role == MembershipRole.PARENT.value
