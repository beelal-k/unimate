# UniMate Backend — FastAPI Server
## Full Requirements & Build Specification

---

## 1. Project Overview

The UniMate backend is a FastAPI server that handles all compute-heavy, long-running, and AI-orchestration tasks that are unsuitable for a mobile device. The Expo app is the client — it delegates expensive work to this server and polls for results.

The server is responsible for:
- Receiving assignment processing requests from the app
- Fetching course materials and past submissions from Moodle
- Chunking and embedding documents using the Gemini Embeddings API
- Running RAG (Retrieval Augmented Generation) pipelines
- Generating assignment summaries and AI drafts via Gemini
- Managing a persistent job queue with status tracking
- Storing embeddings and job results in a Turso database
- Sending push notifications to the app when jobs complete

The server does NOT handle authentication — it trusts the Moodle token provided by the app and verifies it against the Moodle instance on every request.

---

## 2. Technology Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | FastAPI | Async-native, automatic OpenAPI docs, fast |
| Language | Python 3.11+ | Best AI/ML ecosystem |
| Task Queue | Celery 5.x | Reliable background job processing |
| Message Broker | Redis 7 | Celery broker + result backend |
| Database | Turso (libsql) | Same DB as the Expo app, shared schema |
| Embeddings | Gemini `text-embedding-004` API | Free, 768-dim vectors |
| LLM | Gemini 2.5 Flash | Fast, free tier, large context window |
| File Processing | `python-pptx`, `python-docx`, `pypdf2` | Extract text from course materials |
| HTTP Client | `httpx` | Async HTTP for Moodle API calls |
| Validation | Pydantic v2 | Request/response validation |
| Environment | `python-dotenv` | Secrets management |
| Hosting | Railway | Free tier, supports FastAPI + Redis + Celery |

---

## 3. Project Structure

```
unimate-backend/
├── main.py                         ← FastAPI app entry point
├── celery_app.py                   ← Celery configuration
├── requirements.txt
├── .env                            ← secrets (never commit)
├── railway.toml                    ← Railway deployment config
│
├── api/
│   ├── __init__.py
│   ├── routes/
│   │   ├── jobs.py                 ← job submission + status endpoints
│   │   ├── embeddings.py           ← embedding management endpoints
│   │   └── health.py              ← health check endpoint
│   └── middleware/
│       ├── auth.py                 ← Moodle token verification
│       └── rate_limit.py          ← per-user rate limiting
│
├── core/
│   ├── config.py                   ← settings from environment
│   ├── database.py                 ← Turso client + query helpers
│   └── exceptions.py              ← custom exception classes
│
├── services/
│   ├── moodle.py                   ← Moodle REST API wrapper
│   ├── gemini.py                   ← Gemini API wrapper (embeddings + generation)
│   ├── rag.py                      ← RAG pipeline (chunking, search, retrieval)
│   ├── file_processor.py           ← PDF/PPTX/DOCX text extraction
│   └── notifications.py           ← Expo push notification sender
│
└── tasks/
    ├── analyze_assignment.py       ← Celery task: full assignment pipeline
    ├── embed_course_materials.py   ← Celery task: embed all course content
    └── sync_submissions.py         ← Celery task: fetch past submissions
```

---

## 4. Environment Variables

All secrets live in `.env` and are never hardcoded. The `.env` file is never committed to version control.

```env
# Gemini
GEMINI_API_KEY=your_gemini_api_key

# Turso
TURSO_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_turso_token

# Redis (provided by Railway)
REDIS_URL=redis://localhost:6379/0

# Expo Push Notifications
EXPO_ACCESS_TOKEN=your_expo_access_token

# Server
SECRET_KEY=random_32_char_string_for_signing
ENVIRONMENT=production
MAX_JOBS_PER_USER=5
RATE_LIMIT_PER_MINUTE=20
```

---

## 5. Authentication & Request Verification

Every endpoint (except `/health`) requires a valid Moodle token in the request header. There are no server-side accounts, no JWTs, no API keys issued to users. The Moodle token IS the credential.

### 5.1 Request Header

Every request from the Expo app must include:

```
X-Moodle-Token: {moodleToken}
X-Moodle-Domain: {lmsDomain}
```

### 5.2 Verification Middleware

On every incoming request, the auth middleware:

1. Reads `X-Moodle-Token` and `X-Moodle-Domain` from headers
2. Calls `core_webservice_get_site_info` on the provided Moodle domain using the token
3. On success: extracts `userid`, constructs `userId = "{domain}_{userid}"`, attaches to `request.state.user_id` and `request.state.moodle_token`
4. On failure: returns `401 Unauthorized` with `{ error: "Invalid or expired Moodle token" }`

### 5.3 Token Verification Caching

Calling Moodle on every single request adds 200-400ms latency. Cache verification results in Redis with a 30-minute TTL:

```python
cache_key = f"auth:{moodle_domain}:{moodle_token}"

# Check cache first
cached = await redis.get(cache_key)
if cached:
    user_id = cached.decode()
    return user_id

# Cache miss — verify with Moodle
user_id = await verify_with_moodle(domain, token)
await redis.setex(cache_key, 1800, user_id)  # 30 min TTL
return user_id
```

---

## 6. Database Schema (Turso — Server-Side Tables)

The server uses the same Turso database as the Expo app. The server-side tables extend the existing schema with embedding storage and job tracking. All existing app tables (classes, assignments, fileNodes, etc.) are shared — the server can read from them but should only write to them when syncing job results.

```sql
-- Stores text chunks and their vector embeddings from course materials
CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  courseId TEXT NOT NULL,
  sourceType TEXT NOT NULL,     -- 'lecture' | 'reading' | 'announcement' | 'past_submission'
  sourceFileUrl TEXT,           -- original Moodle file URL
  sourceFileName TEXT,          -- human-readable filename
  chunkIndex INTEGER NOT NULL,  -- position of this chunk in the original document
  chunkTotal INTEGER NOT NULL,  -- total chunks in this document
  content TEXT NOT NULL,        -- raw text of this chunk (~500 tokens)
  embedding TEXT NOT NULL,      -- JSON array of 768 floats
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Tracks background processing jobs
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,          -- UUID
  userId TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'analyze_assignment' | 'embed_course' | 'sync_submissions'
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'processing'|'done'|'failed'
  progress INTEGER DEFAULT 0,   -- 0-100
  progressMessage TEXT,         -- human-readable status e.g. "Embedding lecture 3 of 8..."
  payload TEXT NOT NULL,        -- JSON input params for the job
  result TEXT,                  -- JSON result when done
  errorMessage TEXT,            -- error details if failed
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT
);

-- Stores processed assignment drafts and summaries
CREATE TABLE IF NOT EXISTS assignment_analyses (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  assignmentId TEXT NOT NULL,   -- Moodle assignment ID
  courseId TEXT NOT NULL,
  summary TEXT NOT NULL,        -- plain text summary of what is being asked
  deliverables TEXT NOT NULL,   -- JSON array of deliverable items
  markingCriteria TEXT,         -- JSON array if extractable from brief
  relevantChunkIds TEXT,        -- JSON array of embedding IDs used
  draft TEXT,                   -- full generated draft text (markdown)
  draftConfidence INTEGER,      -- 0-10 score based on source coverage
  sourcesUsed TEXT,             -- JSON array of { fileName, chunkIndex, relevance }
  pastSubmissionsUsed INTEGER,  -- how many past submissions informed the style
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Stores past submissions fetched from Moodle
CREATE TABLE IF NOT EXISTS past_submissions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  courseId TEXT NOT NULL,
  assignmentId TEXT NOT NULL,
  submissionText TEXT,          -- extracted text content of the submission
  fileUrl TEXT,                 -- original Moodle file URL if file submission
  grade TEXT,                   -- grade received if available
  feedback TEXT,                -- instructor feedback if available
  submittedAt TEXT,
  createdAt TEXT NOT NULL
);
```

---

## 7. API Endpoints

### 7.1 Health Check

```
GET /health
Auth: None required

Response 200:
{
  "status": "ok",
  "version": "1.0.0",
  "redis": "connected",
  "turso": "connected"
}
```

### 7.2 Submit Assignment Analysis Job

The primary endpoint. Called by the Expo app when a new assignment is detected. Kicks off the full pipeline asynchronously and returns a job ID immediately.

```
POST /jobs/analyze-assignment
Auth: X-Moodle-Token + X-Moodle-Domain required

Request body:
{
  "assignmentId": "12345",        // Moodle assignment cmid
  "courseId": "678",              // Moodle course ID
  "courseName": "Software Re-engineering",
  "assignmentName": "Assignment 3 — Design Patterns",
  "dueDate": "2025-04-15T23:59:00Z"
}

Response 202:
{
  "jobId": "uuid-here",
  "message": "Assignment analysis queued"
}

Error 429:
{
  "error": "You have 5 active jobs. Wait for one to complete before submitting another."
}
```

### 7.3 Get Job Status

Polled by the Expo app every 5 seconds after submitting a job.

```
GET /jobs/{jobId}
Auth: Required

Response 200:
{
  "jobId": "uuid",
  "type": "analyze_assignment",
  "status": "processing",        // pending | processing | done | failed
  "progress": 45,                // 0-100
  "progressMessage": "Embedding lecture slides (3/8)...",
  "createdAt": "2025-03-01T10:00:00Z",
  "updatedAt": "2025-03-01T10:01:23Z"
}

// When status === 'done':
{
  "jobId": "uuid",
  "status": "done",
  "progress": 100,
  "result": {
    "analysisId": "uuid",
    "summary": "...",
    "deliverables": [...],
    "draftAvailable": true,
    "confidence": 8,
    "sourcesCount": 14
  }
}
```

### 7.4 Get Job Result

Fetches the full analysis result. Only callable when job status is `done`.

```
GET /jobs/{jobId}/result
Auth: Required

Response 200:
{
  "analysisId": "uuid",
  "assignmentId": "12345",
  "courseId": "678",
  "summary": "This assignment requires you to...",
  "deliverables": [
    "A 1500-word report analyzing...",
    "A UML class diagram showing...",
    "A working code implementation of..."
  ],
  "markingCriteria": [
    { "criterion": "Code quality", "weight": "30%" },
    { "criterion": "Report clarity", "weight": "40%" },
    { "criterion": "Diagram accuracy", "weight": "30%" }
  ],
  "draft": "# Assignment 3 — Design Patterns\n\n## Introduction\n\n...",
  "confidence": 8,
  "sourcesUsed": [
    {
      "fileName": "Lecture 7 — Design Patterns.pptx",
      "relevance": 0.94,
      "chunksUsed": 6
    },
    {
      "fileName": "Lecture 4 — OOP Principles.pptx",
      "relevance": 0.81,
      "chunksUsed": 3
    }
  ],
  "pastSubmissionsUsed": 4,
  "createdAt": "2025-03-01T10:05:00Z"
}
```

### 7.5 List User Jobs

```
GET /jobs?status=done&limit=20&offset=0
Auth: Required

Response 200:
{
  "jobs": [...],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

### 7.6 Submit Course Embedding Job

Triggered by the app when a user first connects Moodle, or when they tap "Re-index Course" in the app. Embeds all course materials for a given course.

```
POST /jobs/embed-course
Auth: Required

Request body:
{
  "courseId": "678",
  "courseName": "Software Re-engineering",
  "forceReembed": false     // if true, re-embeds even if already done
}

Response 202:
{
  "jobId": "uuid",
  "message": "Course embedding queued"
}
```

### 7.7 Submit Past Submissions Sync Job

```
POST /jobs/sync-submissions
Auth: Required

Request body:
{
  "courseId": "678"     // optional, omit to sync all courses
}

Response 202:
{
  "jobId": "uuid",
  "message": "Submission sync queued"
}
```

### 7.8 Delete Job

```
DELETE /jobs/{jobId}
Auth: Required

Response 200:
{ "message": "Job deleted" }
```

---

## 8. Background Tasks (Celery)

### 8.1 Task: analyze_assignment

This is the core task. It runs the full pipeline from Moodle fetch to draft generation.

```python
@celery.task(bind=True, max_retries=2)
def analyze_assignment(self, job_id: str, user_id: str, moodle_token: str,
                        moodle_domain: str, assignment_id: str, course_id: str):
    try:
        update_job(job_id, status='processing', progress=5,
                   message='Fetching assignment details...')

        # Step 1: Fetch assignment details from Moodle
        assignment = moodle_service.get_assignment(
            moodle_domain, moodle_token, assignment_id, course_id
        )
        # Downloads all attachments (PDF, DOCX, PPTX) to temp storage
        attachments = moodle_service.download_assignment_files(
            moodle_domain, moodle_token, assignment
        )

        update_job(job_id, progress=15, message='Extracting assignment content...')

        # Step 2: Extract text from attachments
        attachment_text = file_processor.extract_all(attachments)

        update_job(job_id, progress=20, message='Generating assignment summary...')

        # Step 3: Generate summary (fast, separate Gemini call)
        summary_result = gemini_service.summarize_assignment(
            assignment_brief=assignment['intro'],
            attachment_text=attachment_text
        )

        update_job(job_id, progress=30, message='Checking course material index...')

        # Step 4: Ensure course materials are embedded
        # If not embedded yet, embed them now (blocking, before proceeding)
        embedding_count = db.count_embeddings(user_id, course_id)
        if embedding_count == 0:
            update_job(job_id, progress=35,
                       message='Indexing course materials for the first time...')
            embed_course_materials_sync(
                user_id, moodle_token, moodle_domain, course_id
            )

        update_job(job_id, progress=60, message='Finding relevant course content...')

        # Step 5: Embed the assignment brief + search for relevant chunks
        assignment_embedding = gemini_service.embed_text(
            assignment['intro'] + '\n' + attachment_text[:2000]
        )
        relevant_chunks = rag_service.similarity_search(
            user_id=user_id,
            course_id=course_id,
            query_embedding=assignment_embedding,
            top_k=20,
            source_types=['lecture', 'reading', 'announcement']
        )

        update_job(job_id, progress=70, message='Loading your past submission style...')

        # Step 6: Fetch past submissions for style reference
        past_submissions = db.get_past_submissions(
            user_id=user_id,
            course_id=course_id,
            limit=5
        )

        update_job(job_id, progress=75, message='Generating draft...')

        # Step 7: Generate full draft via Gemini
        draft_result = gemini_service.generate_assignment_draft(
            assignment_brief=assignment['intro'],
            attachment_text=attachment_text,
            relevant_chunks=relevant_chunks,
            past_submissions=past_submissions,
            course_name=assignment['courseName']
        )

        update_job(job_id, progress=90, message='Saving results...')

        # Step 8: Store analysis in Turso
        analysis_id = db.save_assignment_analysis(
            user_id=user_id,
            assignment_id=assignment_id,
            course_id=course_id,
            summary=summary_result,
            draft=draft_result,
            relevant_chunks=relevant_chunks
        )

        update_job(job_id, status='done', progress=100,
                   result={ 'analysisId': analysis_id, ... })

        # Step 9: Send push notification to user's device
        notifications_service.send(
            user_id=user_id,
            title='Draft Ready',
            body=f'Your draft for {assignment["name"]} is ready to review',
            data={ 'screen': 'assignment', 'analysisId': analysis_id }
        )

    except Exception as exc:
        update_job(job_id, status='failed', error=str(exc))
        raise self.retry(exc=exc, countdown=30)
```

### 8.2 Task: embed_course_materials

Fetches all uploaded files from a Moodle course, extracts text, chunks it, embeds each chunk, and stores in Turso.

```python
@celery.task(bind=True, max_retries=2)
def embed_course_materials(self, job_id: str, user_id: str, moodle_token: str,
                            moodle_domain: str, course_id: str, force: bool = False):

    update_job(job_id, status='processing', progress=5,
               message='Fetching course file list...')

    # Fetch all course resources (files uploaded by the teacher)
    resources = moodle_service.get_course_contents(
        moodle_domain, moodle_token, course_id
    )
    # Filter to supported file types only
    supported = [r for r in resources if r['mimetype'] in SUPPORTED_MIMETYPES]

    total = len(supported)
    for i, resource in enumerate(supported):
        progress = 10 + int((i / total) * 85)
        update_job(job_id, progress=progress,
                   message=f'Processing {resource["filename"]} ({i+1}/{total})...')

        # Skip if already embedded and force=False
        if not force and db.embedding_exists(user_id, course_id, resource['fileurl']):
            continue

        # Download file
        file_bytes = moodle_service.download_file(
            moodle_domain, moodle_token, resource['fileurl']
        )

        # Extract text based on file type
        text = file_processor.extract(file_bytes, resource['mimetype'])
        if not text or len(text.strip()) < 50:
            continue  # Skip empty or unreadable files

        # Chunk the text
        chunks = rag_service.chunk_text(text, chunk_size=500, overlap=50)

        # Embed each chunk (batch API calls where possible)
        embeddings = gemini_service.embed_batch(
            [chunk['content'] for chunk in chunks]
        )

        # Store in Turso
        for chunk, embedding in zip(chunks, embeddings):
            db.save_embedding(
                user_id=user_id,
                course_id=course_id,
                source_type='lecture',
                source_file_url=resource['fileurl'],
                source_file_name=resource['filename'],
                chunk_index=chunk['index'],
                chunk_total=len(chunks),
                content=chunk['content'],
                embedding=embedding
            )

    update_job(job_id, status='done', progress=100)
```

### 8.3 Task: sync_submissions

```python
@celery.task(bind=True)
def sync_submissions(self, job_id: str, user_id: str, moodle_token: str,
                     moodle_domain: str, course_id: str = None):

    # Fetch all assignments the user has submitted to
    assignments = moodle_service.get_user_assignments(
        moodle_domain, moodle_token, course_id
    )

    for assignment in assignments:
        submission = moodle_service.get_submission_status(
            moodle_domain, moodle_token, assignment['id']
        )
        if submission['status'] != 'submitted':
            continue

        # Extract text from submission (online text or file)
        text = extract_submission_text(
            moodle_domain, moodle_token, submission
        )
        if not text:
            continue

        db.save_past_submission(
            user_id=user_id,
            course_id=assignment['course'],
            assignment_id=assignment['id'],
            submission_text=text,
            grade=submission.get('grade'),
            feedback=submission.get('feedback'),
            submitted_at=submission.get('timemodified')
        )

    update_job(job_id, status='done', progress=100)
```

---

## 9. Services

### 9.1 Moodle Service (`services/moodle.py`)

Wraps all Moodle REST API calls. Every function is async using `httpx.AsyncClient`.

```python
SUPPORTED_MIMETYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/html',
]

async def call(domain: str, token: str, function: str, **params) -> dict:
    url = f"https://{domain}/webservice/rest/server.php"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, params={
            'wstoken': token,
            'moodlewsrestformat': 'json',
            'wsfunction': function,
            **params
        })
    data = response.json()
    if isinstance(data, dict) and 'exception' in data:
        raise MoodleAPIError(data.get('message', 'Unknown Moodle error'))
    return data

# Key functions to implement:
# get_assignment(domain, token, assignment_id, course_id)
# get_course_contents(domain, token, course_id)
# download_file(domain, token, file_url) → bytes
# get_user_assignments(domain, token, course_id=None)
# get_submission_status(domain, token, assignment_id)
# download_assignment_files(domain, token, assignment) → list[bytes]
```

### 9.2 Gemini Service (`services/gemini.py`)

All Gemini API calls. Uses the REST API directly via `httpx` — no SDK.

```python
EMBED_MODEL = "models/text-embedding-004"
GENERATE_MODEL = "gemini-2.5-flash-preview-05-20"
EMBED_DIMENSIONS = 768
MAX_BATCH_SIZE = 100  # Gemini embeddings batch limit

async def embed_text(text: str) -> list[float]:
    """Embed a single string. Returns a 768-dim vector."""

async def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed multiple strings in one API call. Splits into batches of 100."""

async def summarize_assignment(brief: str, attachment_text: str) -> dict:
    """
    System prompt: You are an academic assistant. Analyze this assignment and return
    ONLY a JSON object with keys: summary (string), deliverables (array of strings),
    markingCriteria (array of {criterion, weight} objects or empty array if not stated).
    Be concise and precise. Do not add preamble or markdown fences.
    """

async def generate_assignment_draft(
    assignment_brief: str,
    attachment_text: str,
    relevant_chunks: list[dict],
    past_submissions: list[dict],
    course_name: str
) -> dict:
    """
    Builds a carefully structured prompt:

    SYSTEM:
    You are an academic writing assistant for a university student studying {course_name}.
    You write in the student's established voice and style based on their past work.
    You write accurate, well-structured academic content grounded entirely in the
    provided course materials. Every claim must be traceable to the source material given.
    Never invent facts, citations, or content not present in the provided materials.
    Return the draft in clean markdown format.

    USER:
    ## Assignment Brief
    {assignment_brief}

    ## Assignment Attachments
    {attachment_text}

    ## Relevant Course Material
    {format_chunks(relevant_chunks)}  ← numbered chunks with source labels

    ## Student's Past Writing Style (for reference only — do not copy content)
    {format_submissions(past_submissions)}  ← excerpts from past submissions

    ## Instructions
    Write a complete, submission-ready draft for this assignment.
    - Match the writing style, tone, and vocabulary of the student's past work
    - Ground every argument in the provided course material
    - Use proper academic structure appropriate for the assignment type
    - Include in-text references to the source material (e.g. [Lecture 7, Slide 12])
    - Do not add a bibliography unless the assignment brief requires one
    """
```

### 9.3 RAG Service (`services/rag.py`)

Handles chunking and vector similarity search.

```python
def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[dict]:
    """
    Splits text into overlapping chunks of approximately chunk_size tokens.
    Uses sentence boundaries where possible to avoid mid-sentence splits.
    Returns list of { index, content, token_count }
    """

def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """
    Standard cosine similarity between two vectors.
    Implemented in pure Python — no numpy needed.
    dot_product / (magnitude_a * magnitude_b)
    """

async def similarity_search(
    user_id: str,
    course_id: str,
    query_embedding: list[float],
    top_k: int = 20,
    source_types: list[str] = None,
    min_similarity: float = 0.6
) -> list[dict]:
    """
    Fetches all embeddings for user+course from Turso.
    Computes cosine similarity against query_embedding for each.
    Returns top_k results above min_similarity threshold,
    sorted by similarity descending.
    Each result includes: { chunkId, content, similarity,
                            sourceFileName, chunkIndex }
    """
```

### 9.4 File Processor (`services/file_processor.py`)

Extracts plain text from uploaded files.

```python
def extract(file_bytes: bytes, mimetype: str) -> str:
    """Route to correct extractor based on mimetype."""

def extract_pdf(file_bytes: bytes) -> str:
    """Uses pypdf2. Handles multi-page PDFs. Returns concatenated page text."""

def extract_pptx(file_bytes: bytes) -> str:
    """
    Uses python-pptx. Extracts text from:
    - All slide text frames (title + body)
    - Speaker notes
    - Table cells
    Preserves slide structure with markers: [Slide 1], [Slide 2], etc.
    """

def extract_docx(file_bytes: bytes) -> str:
    """
    Uses python-docx. Extracts:
    - All paragraph text
    - Table cell content
    - Preserves heading structure
    """

def extract_txt(file_bytes: bytes) -> str:
    """Decodes as UTF-8 with fallback to latin-1."""
```

### 9.5 Notifications Service (`services/notifications.py`)

Sends push notifications to the Expo app via Expo's Push Notification API.

```python
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

async def send(user_id: str, title: str, body: str, data: dict = None):
    """
    Fetches the user's Expo push token from Turso (stored there by the app).
    Sends a push notification via Expo's push API.
    Expo push tokens are stored in the settings table:
      key = 'expo_push_token', value = 'ExponentPushToken[...]'
    """

async def send_batch(notifications: list[dict]):
    """
    Sends up to 100 notifications in a single Expo push API call.
    Used for bulk operations.
    """
```

---

## 10. Rate Limiting

Prevent abuse via per-user rate limits enforced in middleware:

```python
# Per-user limits
MAX_ANALYZE_JOBS_PER_HOUR = 10     # assignment analysis jobs
MAX_EMBED_JOBS_PER_DAY = 5         # course embedding jobs  
MAX_CONCURRENT_JOBS_PER_USER = 3   # jobs running at the same time
MAX_REQUESTS_PER_MINUTE = 30       # general API rate limit

# Limits are stored and checked in Redis
# Key pattern: ratelimit:{userId}:{limit_type}:{window}
```

If a user exceeds the limit, return:

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 3600,
  "message": "You can submit 10 analysis jobs per hour. Try again in 45 minutes."
}
```

---

## 11. Error Handling

All endpoints return consistent error responses:

```python
# Standard error format
{
  "error": "ShortErrorCode",
  "message": "Human-readable description",
  "details": {}   # optional additional context
}

# HTTP status codes used:
# 400 — Bad request (missing fields, invalid params)
# 401 — Auth failed (invalid/expired Moodle token)
# 403 — Forbidden (job belongs to different user)
# 404 — Not found (job ID doesn't exist)
# 422 — Validation error (Pydantic)
# 429 — Rate limit exceeded
# 500 — Internal server error (always with a safe message, never expose stack trace)
# 503 — Service unavailable (Redis/Turso down)
```

All unhandled exceptions are caught by a global exception handler, logged server-side, and returned as a safe 500 response. Stack traces are never sent to the client.

---

## 12. Celery Configuration

```python
# celery_app.py
from celery import Celery
import os

celery = Celery(
    'unimate',
    broker=os.environ['REDIS_URL'],
    backend=os.environ['REDIS_URL'],
    include=['tasks.analyze_assignment', 'tasks.embed_course_materials',
             'tasks.sync_submissions']
)

celery.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    task_track_started=True,
    task_acks_late=True,              # only ack after completion, not on receipt
    worker_prefetch_multiplier=1,     # one task at a time per worker
    task_time_limit=600,              # kill task after 10 minutes
    task_soft_time_limit=540,         # warn at 9 minutes
    task_max_retries=2,
    task_default_retry_delay=30,
)
```

---

## 13. Railway Deployment Configuration

```toml
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

Three Railway services in one project:

| Service | Start Command | Notes |
|---|---|---|
| `api` | `uvicorn main:app --host 0.0.0.0 --port $PORT` | FastAPI web server |
| `worker` | `celery -A celery_app worker --loglevel=info --concurrency=2` | Celery task worker |
| `redis` | Use Railway's Redis plugin | Managed, no config needed |

All three services share the same environment variables via Railway's shared variables feature.

---

## 14. Expo App Integration

### 14.1 How the App Interacts with the Server

The app never polls Moodle for assignment analysis — it delegates entirely to the server. The integration flow:

```
1. App detects new assignment via Moodle background sync
2. App calls POST /jobs/analyze-assignment
3. App stores jobId locally in SQLite
4. App shows "Analyzing..." card on the assignment
5. App polls GET /jobs/{jobId} every 5 seconds
6. When status === 'done', app calls GET /jobs/{jobId}/result
7. App stores the result locally and updates the assignment card
8. Server also sends a push notification as a fallback
   (in case the app isn't open when the job finishes)
```

### 14.2 Expo Push Token Registration

On every app launch, after authentication, the app registers its Expo push token with the server by saving it to the Turso settings table:

```typescript
const token = await Notifications.getExpoPushTokenAsync();
await tursoClient.execute({
  sql: `INSERT OR REPLACE INTO settings (userId, key, value) VALUES (?, 'expo_push_token', ?)`,
  args: [userId, token.data]
});
```

The server reads this token from Turso when it needs to send a notification.

### 14.3 Base URL Configuration

```typescript
// lib/api/server.ts
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://your-app.railway.app';

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const moodleToken = await SecureStore.getItemAsync('moodle_token');
  const moodleDomain = await SecureStore.getItemAsync('moodle_domain');

  return fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Moodle-Token': moodleToken!,
      'X-Moodle-Domain': moodleDomain!,
      ...options.headers,
    }
  });
}
```

---

## 15. Instructions for the AI Code Generator

1. Implement every service as an async class with dependency injection — pass the Moodle token and domain into each service call, never store them as class state.
2. Every Turso query must be parameterized — never use f-strings to build SQL queries.
3. Every Celery task must call `update_job()` at each significant step so the app can show meaningful progress.
4. The `embed_batch` function must respect Gemini's rate limits — add a 1-second sleep between batches of 100 embeddings to avoid 429 errors on the free tier.
5. File downloads from Moodle must stream to memory, not disk — use `httpx` streaming responses and keep files as `bytes` objects in memory for the duration of the job.
6. Cosine similarity search must load all embeddings for a course into memory, compute similarities, then release. Do not store numpy arrays or large objects between requests.
7. All Gemini generation prompts must instruct the model to return JSON only (no markdown fences, no preamble) when structured output is expected. Always wrap `json.loads()` in a try/except and retry the Gemini call once if parsing fails.
8. The `generate_assignment_draft` Gemini call must cap the context at 900,000 tokens. If `relevant_chunks` + `past_submissions` + `assignment_brief` exceeds this, reduce `top_k` chunks until it fits. Never truncate the assignment brief.
9. Every endpoint must log the `userId` and request summary at INFO level, and any errors at ERROR level with full stack trace. Never log Moodle tokens or passwords.
10. Deploy configuration must include a `/health` endpoint that the Railway health check pings every 30 seconds to keep the server warm on the free tier.