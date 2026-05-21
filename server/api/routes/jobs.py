# api/routes/jobs.py
# Job submission, status polling, and management endpoints

import json
import logging
import uuid

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from api.middleware.auth import get_current_user
from api.middleware.rate_limit import check_job_rate_limit
from core import database as db
from core.config import Settings, get_settings
from core.exceptions import ForbiddenError, JobNotFoundError
from tasks.analyze_assignment import analyze_assignment
from tasks.embed_course_materials import embed_course_materials
from tasks.sync_submissions import sync_submissions

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/jobs", tags=["jobs"])


# ---------------------------------------------------------------------------
#  Request/Response Models
# ---------------------------------------------------------------------------


class AnalyzeAssignmentRequest(BaseModel):
    assignmentId: str
    courseId: str
    courseName: str
    assignmentName: str
    dueDate: str | None = None
    assignmentNumber: str | None = None
    teacherName: str | None = None


class EmbedCourseRequest(BaseModel):
    courseId: str
    courseName: str
    forceReembed: bool = False


class SyncSubmissionsRequest(BaseModel):
    courseId: str | None = None


class JobSubmittedResponse(BaseModel):
    jobId: str
    message: str


class JobStatusResponse(BaseModel):
    jobId: str
    type: str
    status: str
    progress: int
    progressMessage: str | None = None
    createdAt: str
    updatedAt: str
    result: dict | None = None


class JobListResponse(BaseModel):
    jobs: list[dict]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
#  Endpoints
# ---------------------------------------------------------------------------


@router.post("/analyze-assignment", status_code=202, response_model=JobSubmittedResponse)
async def submit_analyze_assignment(
    body: AnalyzeAssignmentRequest,
    request: Request,
    user_id: str = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Submit an assignment analysis job. Returns immediately with a job ID."""
    logger.info("User %s submitting analyze_assignment for assignment %s", user_id, body.assignmentId)

    await check_job_rate_limit(user_id, "analyze_assignment", settings)

    job_id = str(uuid.uuid4())

    payload = {
        "assignmentId": body.assignmentId,
        "courseId": body.courseId,
        "courseName": body.courseName,
        "assignmentName": body.assignmentName,
        "dueDate": body.dueDate,
        "assignmentNumber": body.assignmentNumber,
        "teacherName": body.teacherName,
    }

    db.save_job(
        job_id=job_id,
        user_id=user_id,
        job_type="analyze_assignment",
        payload=payload,
    )

    analyze_assignment.delay(
        job_id=job_id,
        user_id=user_id,
        moodle_token=request.state.moodle_token,
        moodle_domain=request.state.moodle_domain,
        assignment_id=body.assignmentId,
        course_id=body.courseId,
        assignment_number=body.assignmentNumber,
        teacher_name=body.teacherName,
    )

    return JobSubmittedResponse(jobId=job_id, message="Assignment analysis queued")


@router.post("/embed-course", status_code=202, response_model=JobSubmittedResponse)
async def submit_embed_course(
    body: EmbedCourseRequest,
    request: Request,
    user_id: str = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Submit a course embedding job."""
    logger.info("User %s submitting embed_course for course %s", user_id, body.courseId)

    await check_job_rate_limit(user_id, "embed_course", settings)

    job_id = str(uuid.uuid4())

    payload = {
        "courseId": body.courseId,
        "courseName": body.courseName,
        "forceReembed": body.forceReembed,
    }

    db.save_job(
        job_id=job_id,
        user_id=user_id,
        job_type="embed_course",
        payload=payload,
    )

    embed_course_materials.delay(
        job_id=job_id,
        user_id=user_id,
        moodle_token=request.state.moodle_token,
        moodle_domain=request.state.moodle_domain,
        course_id=body.courseId,
        force=body.forceReembed,
    )

    return JobSubmittedResponse(jobId=job_id, message="Course embedding queued")


@router.post("/sync-submissions", status_code=202, response_model=JobSubmittedResponse)
async def submit_sync_submissions(
    body: SyncSubmissionsRequest,
    request: Request,
    user_id: str = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Submit a past submissions sync job."""
    logger.info("User %s submitting sync_submissions", user_id)

    await check_job_rate_limit(user_id, "sync_submissions", settings)

    job_id = str(uuid.uuid4())

    payload = {"courseId": body.courseId}

    db.save_job(
        job_id=job_id,
        user_id=user_id,
        job_type="sync_submissions",
        payload=payload,
    )

    sync_submissions.delay(
        job_id=job_id,
        user_id=user_id,
        moodle_token=request.state.moodle_token,
        moodle_domain=request.state.moodle_domain,
        course_id=body.courseId,
    )

    return JobSubmittedResponse(jobId=job_id, message="Submission sync queued")


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    user_id: str = Depends(get_current_user),
):
    """Get the status of a job. Polled by the app every 5 seconds."""
    job = db.get_job(job_id, user_id)
    if not job:
        raise JobNotFoundError(job_id)

    response = {
        "jobId": job.get("id", job_id),
        "type": job.get("type", ""),
        "status": job.get("status", "pending"),
        "progress": job.get("progress", 0),
        "progressMessage": job.get("progressMessage"),
        "createdAt": job.get("createdAt", ""),
        "updatedAt": job.get("updatedAt", ""),
    }

    # Include result if the job is done
    if job.get("status") == "done" and job.get("result"):
        raw = job["result"]
        try:
            response["result"] = json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, TypeError):
            response["result"] = {"raw": raw}

    return response


@router.get("/{job_id}/result")
async def get_job_result(
    job_id: str,
    user_id: str = Depends(get_current_user),
):
    """Get the full result of a completed job."""
    job = db.get_job(job_id, user_id)
    if not job:
        raise JobNotFoundError(job_id)

    if job.get("status") != "done":
        return {
            "error": "JobNotComplete",
            "message": f"Job is currently '{job.get('status')}'. Results are only available when status is 'done'.",
        }

    # Parse the result JSON
    raw = job.get("result", "{}")
    try:
        result = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        result = {"raw": raw}

    # If there's an analysis ID, fetch the full analysis and augment with PDF
    analysis_id = result.get("analysisId") if isinstance(result, dict) else None
    if analysis_id:
        analysis = db.get_assignment_analysis(analysis_id, user_id)
        if analysis:
            if isinstance(result, dict) and result.get("pdfBase64"):
                analysis["pdfBase64"] = result["pdfBase64"]
            return analysis

    return result


@router.get("", response_model=JobListResponse)
async def list_user_jobs(
    user_id: str = Depends(get_current_user),
    status: str | None = Query(None, description="Filter by job status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List the authenticated user's jobs."""
    jobs, total = db.list_jobs(
        user_id=user_id,
        status=status,
        limit=limit,
        offset=offset,
    )

    return JobListResponse(
        jobs=jobs,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.delete("/{job_id}")
async def delete_job(
    job_id: str,
    user_id: str = Depends(get_current_user),
):
    """Delete a job."""
    logger.info("User %s deleting job %s", user_id, job_id)

    deleted = db.delete_job(job_id, user_id)
    if not deleted:
        raise JobNotFoundError(job_id)

    return {"message": "Job deleted"}
