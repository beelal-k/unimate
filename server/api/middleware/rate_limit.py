# api/middleware/rate_limit.py
# Redis-backed per-user rate limiting

import logging
import time

from fastapi import Depends, Request

from api.middleware.auth import get_current_user, get_redis
from core.config import Settings, get_settings
from core.database import count_active_jobs
from core.exceptions import RateLimitExceededError

logger = logging.getLogger(__name__)


async def check_rate_limit(
    request: Request,
    user_id: str = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    General per-user rate limit check.
    Enforces MAX_REQUESTS_PER_MINUTE using a sliding window in Redis.
    Declared as a router-level dependency in main.py.
    """
    try:
        r = await get_redis()
        window = 60  # 1 minute
        key = f"ratelimit:{user_id}:requests:{int(time.time()) // window}"

        current = await r.incr(key)
        if current == 1:
            await r.expire(key, window)

        if current > settings.rate_limit_per_minute:
            retry_after = window - (int(time.time()) % window)
            raise RateLimitExceededError(
                message=f"Rate limit exceeded. Max {settings.rate_limit_per_minute} requests per minute.",
                retry_after=retry_after,
            )
    except RateLimitExceededError:
        raise
    except Exception as e:
        # If Redis is down, allow the request through (fail-open)
        logger.warning("Rate limit check failed (allowing request): %s", e)


async def check_job_rate_limit(
    user_id: str,
    job_type: str,
    settings: Settings | None = None,
):
    """
    Check job-specific rate limits before submitting a new job.
    Called explicitly from job submission endpoints.
    """
    if settings is None:
        settings = get_settings()

    try:
        r = await get_redis()
    except Exception as e:
        logger.warning("Redis unavailable for job rate limit: %s", e)
        return  # Fail-open

    if job_type == "analyze_assignment":
        # Max analyze jobs per hour
        hour_key = f"ratelimit:{user_id}:analyze:{int(time.time()) // 3600}"
        count = await r.incr(hour_key)
        if count == 1:
            await r.expire(hour_key, 3600)
        if count > settings.max_analyze_jobs_per_hour:
            remaining = 3600 - (int(time.time()) % 3600)
            raise RateLimitExceededError(
                message=f"You can submit {settings.max_analyze_jobs_per_hour} analysis jobs per hour. "
                        f"Try again in {remaining // 60} minutes.",
                retry_after=remaining,
            )

    elif job_type == "embed_course":
        # Max embed jobs per day
        day_key = f"ratelimit:{user_id}:embed:{int(time.time()) // 86400}"
        count = await r.incr(day_key)
        if count == 1:
            await r.expire(day_key, 86400)
        if count > settings.max_embed_jobs_per_day:
            remaining = 86400 - (int(time.time()) % 86400)
            raise RateLimitExceededError(
                message=f"You can submit {settings.max_embed_jobs_per_day} embedding jobs per day. "
                        f"Try again in {remaining // 3600} hours.",
                retry_after=remaining,
            )

    # Check concurrent job limit (applies to all job types)
    active = count_active_jobs(user_id)
    if active >= settings.max_concurrent_jobs_per_user:
        raise RateLimitExceededError(
            message=f"You have {active} active jobs. "
                    f"Wait for one to complete before submitting another.",
            retry_after=60,
        )
