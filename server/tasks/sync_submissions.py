# tasks/sync_submissions.py
# Celery task: fetch and store past submissions from Moodle

import asyncio
import logging
import uuid

from celery_app import celery
from core import database as db

logger = logging.getLogger(__name__)


@celery.task(bind=True, max_retries=2)
def sync_submissions(
    self,
    job_id: str,
    user_id: str,
    moodle_token: str,
    moodle_domain: str,
    course_id: str | None = None,
):
    """
    Fetch all assignments the user has submitted to,
    extract submission text, and store in Turso.
    """
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(
                _run_sync(job_id, user_id, moodle_token, moodle_domain, course_id)
            )
        finally:
            loop.close()
    except Exception as exc:
        db.update_job(job_id, status="failed", error=str(exc))
        logger.error("sync_submissions failed for job %s: %s", job_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=30)


async def _run_sync(
    job_id: str,
    user_id: str,
    moodle_token: str,
    moodle_domain: str,
    course_id: str | None,
):
    from services import moodle as moodle_service
    from services import file_processor

    db.update_job(job_id, status="processing", progress=5, message="Fetching assignments...")

    # Fetch all assignments
    assignments = await moodle_service.get_user_assignments(
        moodle_domain, moodle_token, course_id,
    )

    if not assignments:
        db.update_job(job_id, status="done", progress=100, message="No assignments found")
        return

    total = len(assignments)
    synced_count = 0

    for i, assignment in enumerate(assignments):
        progress = 10 + int((i / total) * 85)
        assignment_name = assignment.get("name", "Unknown")
        db.update_job(
            job_id,
            progress=progress,
            message=f"Checking {assignment_name} ({i + 1}/{total})...",
        )

        try:
            # Get submission status
            submission = await moodle_service.get_submission_status(
                moodle_domain, moodle_token, str(assignment["id"]),
            )

            if submission.get("status") != "submitted":
                continue

            # Extract text from submission
            text = await _extract_submission_text(
                moodle_domain, moodle_token, submission, file_processor,
            )
            if not text:
                continue

            # Save to database
            db.save_past_submission(
                submission_id=str(uuid.uuid4()),
                user_id=user_id,
                course_id=str(assignment.get("course", "")),
                assignment_id=str(assignment["id"]),
                submission_text=text,
                grade=submission.get("grade"),
                feedback=submission.get("feedback"),
                submitted_at=str(submission.get("timemodified", "")),
            )
            synced_count += 1

        except Exception as e:
            logger.warning(
                "Failed to sync submission for assignment %s: %s",
                assignment.get("name"),
                e,
            )

    result = {
        "totalAssignments": total,
        "synced": synced_count,
    }
    db.update_job(
        job_id,
        status="done",
        progress=100,
        message=f"Synced {synced_count} submissions from {total} assignments",
        result=result,
    )
    logger.info(
        "sync_submissions completed for job %s: %d synced from %d",
        job_id, synced_count, total,
    )


async def _extract_submission_text(
    domain: str,
    token: str,
    submission: dict,
    file_processor,
) -> str | None:
    """Extract text content from a submission (online text or file)."""
    from services import moodle as moodle_service

    plugins = submission.get("plugins", [])

    for plugin in plugins:
        plugin_type = plugin.get("type", "")

        # Online text submission
        if plugin_type == "onlinetext":
            for area in plugin.get("editorfields", []):
                text = area.get("text", "").strip()
                if text:
                    # Strip HTML
                    import re
                    clean = re.sub(r"<[^>]+>", " ", text)
                    clean = re.sub(r"\s+", " ", clean).strip()
                    if len(clean) > 20:
                        return clean

        # File submission
        elif plugin_type == "file":
            for area in plugin.get("fileareas", []):
                for f in area.get("files", []):
                    fileurl = f.get("fileurl", "")
                    mimetype = f.get("mimetype", "")
                    if fileurl and mimetype:
                        try:
                            content = await moodle_service.download_file(
                                domain, token, fileurl,
                            )
                            text = file_processor.extract(content, mimetype)
                            if text and len(text.strip()) > 20:
                                return text
                        except Exception:
                            continue

    return None
