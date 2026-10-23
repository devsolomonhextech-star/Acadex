import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from app.settings import get_settings

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    return password_hash.verify(password, encoded)


def create_access_token(user_id: UUID, school_id: UUID, role: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    return jwt.encode(
        {"sub": str(user_id), "school_id": str(school_id), "role": role, "iat": now,
         "exp": now + timedelta(minutes=settings.access_token_minutes), "type": "access"},
        settings.secret_key,
        algorithm="HS256",
    )


def decode_access_token(token: str) -> dict[str, str]:
    return jwt.decode(token, get_settings().secret_key, algorithms=["HS256"], options={"require": ["exp", "sub", "school_id", "type"]})


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)
