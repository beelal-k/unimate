# services/moodle.py
# Async Moodle REST API wrapper

import logging
from typing import Any

import httpx

from core.exceptions import MoodleAPIError

logger = logging.getLogger(__name__)

SUPPORTED_MIMETYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/html",
]


async def call(
    domain: str,
    token: str,
    function: str,
    **params: Any,
) -> dict | list:
    """
    Generic Moodle REST API caller.
    Uses GET to webservice/rest/server.php with the given wsfunction and params.
    """
    url = f"https://{domain}/webservice/rest/server.php"
    query = {
        "wstoken": token,
        "moodlewsrestformat": "json",
        "wsfunction": function,
        **params,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, params=query)
        response.raise_for_status()
        data = response.json()

    if isinstance(data, dict) and "exception" in data:
        msg = data.get("message", "Unknown Moodle error")
        logger.error("Moodle API error [%s]: %s", function, msg)
        raise MoodleAPIError(msg)

    return data


async def get_site_info(domain: str, token: str) -> dict:
    """Fetch site info (user identity) — used for token verification."""
    return await call(domain, token, "core_webservice_get_site_info")


async def get_courses(domain: str, token: str, user_id: int) -> list[dict]:
    """Fetch all courses the user is enrolled in."""
    return await call(domain, token, "core_enrol_get_users_courses", userid=user_id)


async def get_course_contents(domain: str, token: str, course_id: str) -> list[dict]:
    """
    Fetch all resources/activities in a course.
    Returns a flat list of files with their URLs and metadata.
    """
    sections = await call(domain, token, "core_course_get_contents", courseid=course_id)

    resources = []
    for section in sections:
        for module in section.get("modules", []):
            for content in module.get("contents", []):
                mimetype = content.get("mimetype", "")
                if mimetype in SUPPORTED_MIMETYPES:
                    resources.append({
                        "filename": content.get("filename", ""),
                        "fileurl": content.get("fileurl", ""),
                        "filesize": content.get("filesize", 0),
                        "mimetype": mimetype,
                        "timemodified": content.get("timemodified"),
                        "module_name": module.get("name", ""),
                        "section_name": section.get("name", ""),
                    })
    return resources


async def get_assignments(
    domain: str,
    token: str,
    course_ids: list[str],
) -> list[dict]:
    """Fetch assignments for one or more courses."""
    params = {}
    for i, cid in enumerate(course_ids):
        params[f"courseids[{i}]"] = cid

    data = await call(domain, token, "mod_assign_get_assignments", **params)
    assignments = []
    for course in data.get("courses", []):
        course_id = course.get("id")
        for assignment in course.get("assignments", []):
            assignment["course"] = course_id
            assignments.append(assignment)
    return assignments


async def get_assignment(
    domain: str,
    token: str,
    assignment_id: str,
    course_id: str,
) -> dict:
    """Fetch a single assignment's details."""
    assignments = await get_assignments(domain, token, [course_id])
    for a in assignments:
        if str(a.get("cmid")) == str(assignment_id) or str(a.get("id")) == str(assignment_id):
            return a
    raise MoodleAPIError(f"Assignment {assignment_id} not found in course {course_id}")


async def get_user_assignments(
    domain: str,
    token: str,
    course_id: str | None = None,
) -> list[dict]:
    """Fetch all assignments the user has access to, optionally filtered by course."""
    if course_id:
        return await get_assignments(domain, token, [course_id])

    # Fetch user's site info to get their Moodle user ID
    site_info = await get_site_info(domain, token)
    user_id = site_info["userid"]

    # Get all enrolled courses
    courses = await get_courses(domain, token, user_id)
    course_ids = [str(c["id"]) for c in courses]

    if not course_ids:
        return []

    return await get_assignments(domain, token, course_ids)


async def get_submission_status(
    domain: str,
    token: str,
    assignment_id: str,
) -> dict:
    """Fetch the submission status for a specific assignment."""
    data = await call(
        domain, token, "mod_assign_get_submission_status",
        assignid=assignment_id,
    )
    # Extract relevant submission info
    submission = data.get("lastattempt", {}).get("submission", {})
    grade_info = data.get("feedback", {})

    return {
        "status": submission.get("status", "new"),
        "timemodified": submission.get("timemodified"),
        "plugins": submission.get("plugins", []),
        "grade": grade_info.get("grade", {}).get("grade"),
        "feedback": grade_info.get("gradefordisplay"),
    }


async def download_file(
    domain: str,
    token: str,
    file_url: str,
) -> bytes:
    """
    Download a file from Moodle. Streams to memory (never disk).
    Appends the token for authentication.
    """
    separator = "&" if "?" in file_url else "?"
    authenticated_url = f"{file_url}{separator}token={token}"

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        response = await client.get(authenticated_url)
        response.raise_for_status()
        return response.content


async def download_assignment_files(
    domain: str,
    token: str,
    assignment: dict,
) -> list[dict]:
    """
    Download all attachments from an assignment.
    Returns list of { filename, mimetype, content (bytes) }.
    """
    attachments = assignment.get("introattachments", [])
    results = []

    for attachment in attachments:
        mimetype = attachment.get("mimetype", "")
        if mimetype not in SUPPORTED_MIMETYPES:
            continue

        try:
            content = await download_file(domain, token, attachment["fileurl"])
            results.append({
                "filename": attachment.get("filename", "unknown"),
                "mimetype": mimetype,
                "content": content,
            })
        except Exception as e:
            logger.warning(
                "Failed to download attachment %s: %s",
                attachment.get("filename"),
                e,
            )

    return results
