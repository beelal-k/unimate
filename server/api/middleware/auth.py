# api/middleware/auth.py
# Moodle token verification middleware with Redis caching

import logging

import redis.asyncio as redis
from fastapi import Depends, Request
from fastapi.security import APIKeyHeader

from core.config import Settings, get_settings
from core.exceptions import AuthenticationError
from services.moodle import get_site_info

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None

moodle_token_header = APIKeyHeader(name="X-Moodle-Token", auto_error=False)
moodle_domain_header = APIKeyHeader(name="X-Moodle-Domain", auto_error=False)


async def get_redis() -> redis.Redis:
    """Get or create the Redis async client."""
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
        )
    return _redis_client


async def close_redis():
    """Close the Redis connection gracefully."""
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()
        _redis_client = None


async def verify_moodle_token(domain: str, token: str) -> str:
    """
    Verify a Moodle token by calling core_webservice_get_site_info via the shared moodle service.
    Returns the constructed userId on success.
    Raises AuthenticationError on failure.
    """
    try:
        data = await get_site_info(domain, token)
    except Exception as e:
        logger.error("Moodle verification failed for domain=%s: %s", domain, e)
        raise AuthenticationError("Could not reach Moodle server for token verification")

    user_id_num = data.get("userid")
    if not user_id_num:
        raise AuthenticationError("Could not extract user identity from Moodle")

    # Construct globally unique userId matching the app pattern: "{domain}_{userid}"
    return f"{domain}_{user_id_num}"


async def get_current_user(
    request: Request,
    token: str | None = Depends(moodle_token_header),
    domain: str | None = Depends(moodle_domain_header),
    settings: Settings = Depends(get_settings),
) -> str:
    """
    FastAPI dependency that authenticates the request via Moodle token.
    Returns the userId string. Caches verification in Redis for 30 minutes.
    """
    if not token or not domain:
        raise AuthenticationError("Missing X-Moodle-Token or X-Moodle-Domain header")

    # Check Redis cache first
    cache_key = f"auth:{domain}:{token}"
    try:
        r = await get_redis()
        cached = await r.get(cache_key)
        if cached:
            user_id = cached
            request.state.user_id = user_id
            request.state.moodle_token = token
            request.state.moodle_domain = domain
            return user_id
    except Exception as e:
        # Redis unavailable — fall through to direct verification
        logger.warning("Redis cache check failed: %s", e)

    # Cache miss — verify with Moodle
    user_id = await verify_moodle_token(domain, token)

    # Cache the result for 30 minutes
    try:
        r = await get_redis()
        await r.setex(cache_key, 1800, user_id)
    except Exception as e:
        logger.warning("Redis cache set failed: %s", e)

    request.state.user_id = user_id
    request.state.moodle_token = token
    request.state.moodle_domain = domain
    return user_id


async def check_redis_connection() -> bool:
    """Check if Redis is reachable."""
    try:
        r = await get_redis()
        await r.ping()
        return True
    except Exception:
        return False
