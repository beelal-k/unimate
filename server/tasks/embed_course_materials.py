# tasks/embed_course_materials.py
# Celery task: embed all course content for a given course

import asyncio
import logging

from celery_app import celery
from core import database as db
from services.embedding_pipeline import embed_course_files

logger = logging.getLogger(__name__)


@celery.task(bind=True, max_retries=2)
def embed_course_materials(
    self,
    job_id: str,
    user_id: str,
    moodle_token: str,
    moodle_domain: str,
    course_id: str,
    force: bool = False,
):
    """
    Fetch all uploaded files from a Moodle course,
    extract text, chunk it, embed each chunk, and store in Turso.
    Delegates to the shared embedding pipeline in services/embedding_pipeline.py.
    """
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(
                _run_embedding(job_id, user_id, moodle_token, moodle_domain, course_id, force)
            )
        finally:
            loop.close()
    except Exception as exc:
        db.update_job(job_id, status="failed", error=str(exc))
        logger.error("embed_course_materials failed for job %s: %s", job_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=30)


async def _run_embedding(
    job_id: str,
    user_id: str,
    moodle_token: str,
    moodle_domain: str,
    course_id: str,
    force: bool,
):
    db.update_job(job_id, status="processing", progress=5, message="Fetching course file list...")

    summary = await embed_course_files(
        user_id=user_id,
        moodle_token=moodle_token,
        moodle_domain=moodle_domain,
        course_id=course_id,
        force=force,
    )

    if summary["totalFiles"] == 0:
        db.update_job(job_id, status="done", progress=100, message="No supported files found in course")
        return

    embedded = summary["embedded"]
    skipped = summary["skipped"]

    db.update_job(
        job_id,
        status="done",
        progress=100,
        message=f"Embedded {embedded} files, skipped {skipped}",
        result=summary,
    )
    logger.info(
        "embed_course_materials completed for job %s: %d embedded, %d skipped",
        job_id, embedded, skipped,
    )
