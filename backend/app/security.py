import hashlib
import base64
import hmac
import secrets
import struct
import time
from urllib.parse import quote
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
import qrcode
from qrcode.image.svg import SvgPathImage
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
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


def new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _totp_key(secret: str) -> bytes:
    return base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)


def totp_counter(secret: str, code: str, now: int | None = None) -> int | None:
    if len(code) != 6 or not code.isdigit():
        return None
    counter = int((now if now is not None else time.time()) // 30)
    key = _totp_key(secret)
    for candidate in (counter - 1, counter, counter + 1):
        digest = hmac.new(key, struct.pack(">Q", candidate), hashlib.sha1).digest()
        offset = digest[-1] & 0x0F
        value = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
        if hmac.compare_digest(f"{value:06d}", code):
            return candidate
    return None


def encrypt_totp_secret(secret: str) -> str:
    key = hashlib.sha256(get_settings().secret_key.encode()).digest()
    nonce = secrets.token_bytes(12)
    ciphertext = AESGCM(key).encrypt(nonce, secret.encode(), b"schoolos-totp-v1")
    return base64.urlsafe_b64encode(nonce + ciphertext).decode()


def decrypt_totp_secret(encrypted: str) -> str:
    raw = base64.urlsafe_b64decode(encrypted.encode())
    key = hashlib.sha256(get_settings().secret_key.encode()).digest()
    return AESGCM(key).decrypt(raw[:12], raw[12:], b"schoolos-totp-v1").decode()


def authenticator_uri(secret: str, email: str, issuer: str) -> str:
    label = quote(f"{issuer}:{email}", safe="")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer, safe='')}&algorithm=SHA1&digits=6&period=30"


def authenticator_qr_svg(uri: str) -> str:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=6, border=3)
    qr.add_data(uri)
    qr.make(fit=True)
    image = qr.make_image(image_factory=SvgPathImage)
    return image.to_string(encoding="unicode")
