import hashlib
import hmac

from fastapi import HTTPException, Request
from redis.exceptions import RedisError

from app.settings import get_settings

_INCREMENT_WINDOW = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {current, redis.call('TTL', KEYS[1])}
"""


async def enforce_ip_limit(request: Request, namespace: str, limit: int, window_seconds: int) -> None:
    client = getattr(request.app.state, "redis", None)
    if client is None:
        raise HTTPException(status_code=503, detail="Rate limiting is temporarily unavailable")
    address = request.client.host if request.client else "unknown"
    secret = get_settings().secret_key.encode()
    digest = hmac.new(secret, address.encode(), hashlib.sha256).hexdigest()
    key = f"schoolos:rate:{namespace}:{digest}"
    try:
        count, ttl = await client.eval(_INCREMENT_WINDOW, 1, key, window_seconds)
    except RedisError:
        raise HTTPException(status_code=503, detail="Rate limiting is temporarily unavailable") from None
    if int(count) > limit:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.", headers={"Retry-After": str(max(1, int(ttl)))})


async def limit_signup(request: Request) -> None:
    await enforce_ip_limit(request, "signup", limit=5, window_seconds=3600)


async def limit_login(request: Request) -> None:
    await enforce_ip_limit(request, "login", limit=10, window_seconds=900)
