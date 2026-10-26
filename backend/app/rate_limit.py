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

_RECORD_LOGIN_FAILURE = """
local failures = redis.call('INCR', KEYS[1])
if failures == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if failures >= tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
  redis.call('DEL', KEYS[1])
end
return failures
"""

LOGIN_FAILURE_LIMIT = 4
LOGIN_LOCKOUT_SECONDS = 8 * 60 * 60


def _login_keys(request: Request) -> tuple[object, str, str]:
    client = getattr(request.app.state, "redis", None)
    if client is None:
        raise HTTPException(status_code=503, detail="Rate limiting is temporarily unavailable")
    address = request.client.host if request.client else "unknown"
    secret = get_settings().secret_key.encode()
    digest = hmac.new(secret, address.encode(), hashlib.sha256).hexdigest()
    prefix = f"schoolos:login:{digest}"
    return client, f"{prefix}:failures", f"{prefix}:locked"


async def check_login_lockout(request: Request) -> None:
    client, _, lock_key = _login_keys(request)
    try:
        ttl = int(await client.ttl(lock_key))
    except RedisError:
        raise HTTPException(status_code=503, detail="Rate limiting is temporarily unavailable") from None
    if ttl > 0:
        raise _login_locked(ttl)


async def record_login_failure(request: Request) -> None:
    client, failures_key, locked_key = _login_keys(request)
    try:
        failures = int(await client.eval(
            _RECORD_LOGIN_FAILURE, 2, failures_key, locked_key,
            LOGIN_LOCKOUT_SECONDS, LOGIN_FAILURE_LIMIT, LOGIN_LOCKOUT_SECONDS,
        ))
    except RedisError:
        raise HTTPException(status_code=503, detail="Rate limiting is temporarily unavailable") from None
    if failures >= LOGIN_FAILURE_LIMIT:
        raise _login_locked(LOGIN_LOCKOUT_SECONDS)


def _login_locked(retry_after: int) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail={"code": "login_locked", "message": "Too many failed sign-in attempts from this network. Sign-in is paused for eight hours."},
        headers={"Retry-After": str(retry_after)},
    )


async def clear_login_failures(request: Request) -> None:
    client, failures_key, _ = _login_keys(request)
    try:
        await client.delete(failures_key)
    except RedisError:
        raise HTTPException(status_code=503, detail="Rate limiting is temporarily unavailable") from None


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
