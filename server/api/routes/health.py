# api/routes/health.py
# Health check endpoint

import logging

from fastapi import APIRouter

from api.middleware.auth import check_redis_connection
from core.database import check_connection as check_db_connection

logger = logging.getLogger(__name__)
router = APIRouter()

VERSION = "1.0.0"


@router.get("/health")
async def health_check():
    """
    Health check endpoint. No authentication required.
    Called by Railway health checks every 30 seconds to keep the server warm.
    """
    redis_ok = await check_redis_connection()
    turso_ok = check_db_connection()

    status = "ok" if (redis_ok and turso_ok) else "degraded"

    return {
        "status": status,
        "version": VERSION,
        "redis": "connected" if redis_ok else "disconnected",
        "turso": "connected" if turso_ok else "disconnected",
    }
