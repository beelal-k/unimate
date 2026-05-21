# core/database.py
# Turso (libsql) database client and query helpers

import json
import logging
import threading
from datetime import datetime, timezone
from typing import Any

import libsql_experimental as libsql

from core.config import get_settings

logger = logging.getLogger(__name__)

# Thread-local storage ensures each thread/Celery worker gets its own DB connection.
_local = threading.local()


def get_db():
    """Get or create a thread-local database connection."""
    if not hasattr(_local, "db") or _local.db is None:
        _local.db = _new_connection()
    return _local.db


def _new_connection():
    settings = get_settings()
    conn = libsql.connect(
        "unimate.db",
        sync_url=settings.turso_url,
        auth_token=settings.turso_auth_token,
    )
    conn.sync()
    return conn


def _reconnect():
    """Force a fresh connection on the current thread (called after WAL errors)."""
    if hasattr(_local, "db") and _local.db is not None:
        try:
            _local.db.close()
        except Exception:
            pass
    _local.db = _new_connection()


def _db_write(fn, *args, **kwargs):
    """Execute a write function; on WAL error reconnect and retry once."""
    try:
        return fn(*args, **kwargs)
    except (ValueError, Exception) as exc:
        if "wal_insert_begin" in str(exc) or "wal" in str(exc).lower():
            logger.warning("WAL error, reconnecting and retrying: %s", exc)
            _reconnect()
            return fn(*args, **kwargs)
        raise


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
#  Schema creation
# ---------------------------------------------------------------------------

CREATE_TABLES_SQL = [
    """
    CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        courseId TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceFileUrl TEXT,
        sourceFileName TEXT,
        chunkIndex INTEGER NOT NULL,
        chunkTotal INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        progressMessage TEXT,
        payload TEXT NOT NULL,
        result TEXT,
        errorMessage TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        completedAt TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS assignment_analyses (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        assignmentId TEXT NOT NULL,
        courseId TEXT NOT NULL,
        summary TEXT NOT NULL,
        deliverables TEXT NOT NULL,
        markingCriteria TEXT,
        relevantChunkIds TEXT,
        draft TEXT,
        draftConfidence INTEGER,
        sourcesUsed TEXT,
        pastSubmissionsUsed INTEGER,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS past_submissions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        courseId TEXT NOT NULL,
        assignmentId TEXT NOT NULL,
        submissionText TEXT,
        fileUrl TEXT,
        grade TEXT,
        feedback TEXT,
        submittedAt TEXT,
        createdAt TEXT NOT NULL
    )
    """,
    # Indexes for performance
    "CREATE INDEX IF NOT EXISTS idx_embeddings_user_course ON embeddings(userId, courseId)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(userId)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(userId, status)",
    "CREATE INDEX IF NOT EXISTS idx_analyses_assignment ON assignment_analyses(userId, assignmentId)",
    "CREATE INDEX IF NOT EXISTS idx_submissions_course ON past_submissions(userId, courseId)",
]


def create_tables():
    """Create all server-side tables if they don't exist."""
    db = get_db()
    for sql in CREATE_TABLES_SQL:
        db.execute(sql)
    db.commit()
    db.sync()
    logger.info("Server-side database tables ensured")


# ---------------------------------------------------------------------------
#  Job helpers
# ---------------------------------------------------------------------------


def save_job(
    job_id: str,
    user_id: str,
    job_type: str,
    payload: dict,
) -> dict:
    """Insert a new job record."""
    now = _now()

    def _do():
        db = get_db()
        db.execute(
            """
            INSERT INTO jobs (id, userId, type, status, progress, progressMessage, payload, createdAt, updatedAt)
            VALUES (?, ?, ?, 'pending', 0, 'Queued...', ?, ?, ?)
            """,
            (job_id, user_id, job_type, json.dumps(payload), now, now),
        )
        db.commit()
        db.sync()

    _db_write(_do)
    return {"id": job_id, "status": "pending", "progress": 0, "createdAt": now}


def update_job(
    job_id: str,
    *,
    status: str | None = None,
    progress: int | None = None,
    message: str | None = None,
    result: dict | None = None,
    error: str | None = None,
):
    """Update job fields. Only non-None fields are updated."""
    fields: list[str] = []
    values: list[Any] = []

    if status is not None:
        fields.append("status = ?")
        values.append(status)
    if progress is not None:
        fields.append("progress = ?")
        values.append(progress)
    if message is not None:
        fields.append("progressMessage = ?")
        values.append(message)
    if result is not None:
        fields.append("result = ?")
        values.append(json.dumps(result))
    if error is not None:
        fields.append("errorMessage = ?")
        values.append(error)
    if status in ("done", "failed"):
        fields.append("completedAt = ?")
        values.append(_now())

    fields.append("updatedAt = ?")
    values.append(_now())
    values.append(job_id)

    sql = f"UPDATE jobs SET {', '.join(fields)} WHERE id = ?"
    params = tuple(values)

    def _do():
        db = get_db()
        db.execute(sql, params)
        db.commit()
        db.sync()

    _db_write(_do)


def get_job(job_id: str, user_id: str | None = None) -> dict | None:
    """Fetch a single job. Optionally verify ownership."""
    db = get_db()
    if user_id:
        cursor = db.execute(
            "SELECT * FROM jobs WHERE id = ? AND userId = ?", (job_id, user_id)
        )
    else:
        cursor = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))

    row = cursor.fetchone()
    if not row:
        return None
    return _row_to_dict(row, cursor)


def list_jobs(
    user_id: str,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """List jobs for a user with optional status filter. Returns (jobs, total)."""
    db = get_db()
    where = "WHERE userId = ?"
    params: list[Any] = [user_id]

    if status:
        where += " AND status = ?"
        params.append(status)

    total_row = db.execute(
        f"SELECT COUNT(*) as cnt FROM jobs {where}", tuple(params)
    ).fetchone()
    total = total_row[0] if total_row else 0

    cursor = db.execute(
        f"SELECT * FROM jobs {where} ORDER BY createdAt DESC LIMIT ? OFFSET ?",
        tuple(params + [limit, offset]),
    )
    rows = cursor.fetchall()

    return [_row_to_dict(r, cursor) for r in rows], total


def delete_job(job_id: str, user_id: str) -> bool:
    """Delete a job. Returns True if deleted."""
    result_holder: list[Any] = []

    def _do():
        db = get_db()
        r = db.execute("DELETE FROM jobs WHERE id = ? AND userId = ?", (job_id, user_id))
        db.commit()
        db.sync()
        result_holder.append(r.rowcount)

    _db_write(_do)
    return bool(result_holder and result_holder[0] > 0)


def count_active_jobs(user_id: str) -> int:
    """Count pending/processing jobs for a user."""
    db = get_db()
    row = db.execute(
        "SELECT COUNT(*) FROM jobs WHERE userId = ? AND status IN ('pending', 'processing')",
        (user_id,),
    ).fetchone()
    return row[0] if row else 0


# ---------------------------------------------------------------------------
#  Embedding helpers
# ---------------------------------------------------------------------------


def save_embedding(
    *,
    embedding_id: str,
    user_id: str,
    course_id: str,
    source_type: str,
    source_file_url: str | None,
    source_file_name: str | None,
    chunk_index: int,
    chunk_total: int,
    content: str,
    embedding: list[float],
):
    """Insert an embedding chunk."""
    now = _now()
    params = (
        embedding_id, user_id, course_id, source_type,
        source_file_url, source_file_name,
        chunk_index, chunk_total, content,
        json.dumps(embedding), now, now,
    )

    def _do():
        db = get_db()
        db.execute(
            """
            INSERT OR REPLACE INTO embeddings
            (id, userId, courseId, sourceType, sourceFileUrl, sourceFileName,
             chunkIndex, chunkTotal, content, embedding, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params,
        )
        db.commit()

    _db_write(_do)


def batch_save_embeddings(embeddings_data: list[dict]):
    """Batch insert embeddings for efficiency."""
    now = _now()

    def _do():
        db = get_db()
        for data in embeddings_data:
            db.execute(
                """
                INSERT OR REPLACE INTO embeddings
                (id, userId, courseId, sourceType, sourceFileUrl, sourceFileName,
                 chunkIndex, chunkTotal, content, embedding, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data["id"], data["user_id"], data["course_id"], data["source_type"],
                    data.get("source_file_url"), data.get("source_file_name"),
                    data["chunk_index"], data["chunk_total"], data["content"],
                    json.dumps(data["embedding"]), now, now,
                ),
            )
        db.commit()
        db.sync()

    _db_write(_do)


def count_embeddings(user_id: str, course_id: str) -> int:
    """Count embeddings for a user+course."""
    db = get_db()
    row = db.execute(
        "SELECT COUNT(*) FROM embeddings WHERE userId = ? AND courseId = ?",
        (user_id, course_id),
    ).fetchone()
    return row[0] if row else 0


def embedding_exists(user_id: str, course_id: str, source_file_url: str) -> bool:
    """Check if a specific file has already been embedded."""
    db = get_db()
    row = db.execute(
        "SELECT 1 FROM embeddings WHERE userId = ? AND courseId = ? AND sourceFileUrl = ? LIMIT 1",
        (user_id, course_id, source_file_url),
    ).fetchone()
    return row is not None


def get_embeddings_for_course(
    user_id: str,
    course_id: str,
    source_types: list[str] | None = None,
) -> list[dict]:
    """Fetch all embedding rows for a user+course, optionally filtered by source type."""
    db = get_db()
    if source_types:
        placeholders = ", ".join("?" for _ in source_types)
        rows = db.execute(
            f"""
            SELECT id, content, embedding, sourceFileName, chunkIndex, sourceType
            FROM embeddings
            WHERE userId = ? AND courseId = ? AND sourceType IN ({placeholders})
            """,
            (user_id, course_id, *source_types),
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT id, content, embedding, sourceFileName, chunkIndex, sourceType
            FROM embeddings WHERE userId = ? AND courseId = ?
            """,
            (user_id, course_id),
        ).fetchall()

    results = []
    for row in rows:
        results.append({
            "id": row[0],
            "content": row[1],
            "embedding": json.loads(row[2]),
            "sourceFileName": row[3],
            "chunkIndex": row[4],
            "sourceType": row[5],
        })
    return results


def delete_course_embeddings(user_id: str, course_id: str) -> int:
    """Delete all embeddings for a course. Returns count deleted."""
    count: list[int] = []

    def _do():
        db = get_db()
        r = db.execute(
            "DELETE FROM embeddings WHERE userId = ? AND courseId = ?",
            (user_id, course_id),
        )
        db.commit()
        db.sync()
        count.append(r.rowcount)

    _db_write(_do)
    return count[0] if count else 0


# ---------------------------------------------------------------------------
#  Assignment analysis helpers
# ---------------------------------------------------------------------------


def save_assignment_analysis(
    *,
    analysis_id: str,
    user_id: str,
    assignment_id: str,
    course_id: str,
    summary: str,
    deliverables: list[str],
    marking_criteria: list[dict] | None,
    relevant_chunk_ids: list[str],
    draft: str | None,
    draft_confidence: int | None,
    sources_used: list[dict],
    past_submissions_used: int,
) -> str:
    """Save a completed assignment analysis."""
    now = _now()
    params = (
        analysis_id, user_id, assignment_id, course_id,
        summary, json.dumps(deliverables),
        json.dumps(marking_criteria) if marking_criteria else None,
        json.dumps(relevant_chunk_ids),
        draft, draft_confidence,
        json.dumps(sources_used), past_submissions_used,
        now, now,
    )

    def _do():
        db = get_db()
        db.execute(
            """
            INSERT OR REPLACE INTO assignment_analyses
            (id, userId, assignmentId, courseId, summary, deliverables,
             markingCriteria, relevantChunkIds, draft, draftConfidence,
             sourcesUsed, pastSubmissionsUsed, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params,
        )
        db.commit()
        db.sync()

    _db_write(_do)
    return analysis_id


def get_assignment_analysis(analysis_id: str, user_id: str) -> dict | None:
    """Fetch a single analysis."""
    db = get_db()
    cursor = db.execute(
        "SELECT * FROM assignment_analyses WHERE id = ? AND userId = ?",
        (analysis_id, user_id),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return _row_to_dict(row, cursor)


# ---------------------------------------------------------------------------
#  Past submissions helpers
# ---------------------------------------------------------------------------


def save_past_submission(
    *,
    submission_id: str,
    user_id: str,
    course_id: str,
    assignment_id: str,
    submission_text: str | None,
    file_url: str | None = None,
    grade: str | None = None,
    feedback: str | None = None,
    submitted_at: str | None = None,
):
    """Save a past submission record."""
    now = _now()
    params = (
        submission_id, user_id, course_id, assignment_id,
        submission_text, file_url, grade, feedback,
        submitted_at, now,
    )

    def _do():
        db = get_db()
        db.execute(
            """
            INSERT OR REPLACE INTO past_submissions
            (id, userId, courseId, assignmentId, submissionText, fileUrl,
             grade, feedback, submittedAt, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params,
        )
        db.commit()
        db.sync()

    _db_write(_do)


def get_past_submissions(
    user_id: str,
    course_id: str,
    limit: int = 5,
) -> list[dict]:
    """Fetch past submissions for a user+course, ordered by most recent."""
    db = get_db()
    cursor = db.execute(
        """
        SELECT * FROM past_submissions
        WHERE userId = ? AND courseId = ?
        ORDER BY submittedAt DESC
        LIMIT ?
        """,
        (user_id, course_id, limit),
    )
    rows = cursor.fetchall()
    return [_row_to_dict(r, cursor) for r in rows]


# ---------------------------------------------------------------------------
#  Settings helpers (read-only from server side)
# ---------------------------------------------------------------------------


def get_setting(user_id: str, key: str) -> str | None:
    """Read a setting value (e.g. expo_push_token). The settings table is shared with the app."""
    db = get_db()
    row = db.execute(
        "SELECT value FROM settings WHERE userId = ? AND key = ?",
        (user_id, key),
    ).fetchone()
    return row[0] if row else None


def get_user_info(user_id: str) -> dict | None:
    """Fetch fullname and username for a user from the shared users table."""
    db = get_db()
    row = db.execute(
        "SELECT fullname, username FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not row:
        return None
    return {"fullname": row[0], "username": row[1]}


def get_user_info(user_id: str) -> dict | None:
    """Fetch fullname and username for a user from the shared users table."""
    db = get_db()
    row = db.execute(
        "SELECT fullname, username FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not row:
        return None
    return {"fullname": row[0], "username": row[1]}


# ---------------------------------------------------------------------------
#  Utility
# ---------------------------------------------------------------------------


def _row_to_dict(row, cursor=None) -> dict:
    """Convert a libsql Row to a dictionary."""
    if hasattr(row, "keys"):
        return {k: row[k] for k in row.keys()}
    # Fallback 1: use cursor description if provided
    if cursor and cursor.description:
        return {cursor.description[i][0]: value for i, value in enumerate(row)}
    # Fallback 2: use column description from the cursor (namedtuple-style)
    if hasattr(row, "_fields"):
        return dict(zip(row._fields, row))
    # Last resort: return with index keys (caller should not encounter this)
    logger.warning("_row_to_dict: could not map row to column names, falling back to index keys")
    return dict(enumerate(row))


def check_connection() -> bool:
    """Verify database connectivity."""
    try:
        db = get_db()
        db.execute("SELECT 1")
        return True
    except Exception:
        return False
