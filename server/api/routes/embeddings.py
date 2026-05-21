# api/routes/embeddings.py
# Embedding management endpoints

import logging

from fastapi import APIRouter, Depends

from api.middleware.auth import get_current_user
from core import database as db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/embeddings", tags=["embeddings"])


@router.get("/status/{course_id}")
async def get_embedding_status(
    course_id: str,
    user_id: str = Depends(get_current_user),
):
    """Check if a course has been indexed (has embeddings)."""
    count = db.count_embeddings(user_id, course_id)

    return {
        "courseId": course_id,
        "indexed": count > 0,
        "chunkCount": count,
    }


@router.delete("/{course_id}")
async def delete_course_embeddings(
    course_id: str,
    user_id: str = Depends(get_current_user),
):
    """Clear all embeddings for a course."""
    logger.info("User %s deleting embeddings for course %s", user_id, course_id)
    deleted = db.delete_course_embeddings(user_id, course_id)

    return {
        "message": f"Deleted {deleted} embedding chunks for course {course_id}",
        "deletedCount": deleted,
    }
