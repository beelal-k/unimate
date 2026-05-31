# tasks/analyze_assignment.py
# Celery task: full assignment analysis pipeline

import asyncio
import logging
import uuid

from celery_app import celery
from core import database as db

logger = logging.getLogger(__name__)


@celery.task(bind=True, max_retries=2)
def analyze_assignment(
    self,
    job_id: str,
    user_id: str,
    moodle_token: str,
    moodle_domain: str,
    assignment_id: str,
    course_id: str,
    assignment_number: str | None = None,
    teacher_name: str | None = None,
):
    """
    Assignment analysis pipeline:
    1. Fetch assignment details from Moodle
    2. Download and extract text from attachments
    3. Embed query; kick off course indexing non-blocking if not yet indexed
    4. RAG search for relevant chunks
    5. Fetch past submissions for style reference
    6. Single Gemini call: analyze + generate draft
    7. Save analysis, generate PDF, finalize job, send notification
    """
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(
                _run_pipeline(
                    self, job_id, user_id, moodle_token, moodle_domain,
                    assignment_id, course_id, assignment_number, teacher_name,
                )
            )
        finally:
            loop.close()
    except Exception as exc:
        db.update_job(job_id, status="failed", error=str(exc))
        logger.error("analyze_assignment failed for job %s: %s", job_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=30)


async def _run_pipeline(
    task,
    job_id: str,
    user_id: str,
    moodle_token: str,
    moodle_domain: str,
    assignment_id: str,
    course_id: str,
    assignment_number: str | None,
    teacher_name: str | None,
):
    from services import moodle as moodle_service
    from services import gemini as gemini_service
    from services import file_processor
    from services import rag as rag_service
    from services import pdf_generator
    from services.embedding_pipeline import embed_course_files

    # Step 1: Fetch assignment details
    db.update_job(job_id, status="processing", progress=5, message="Fetching assignment...")
    assignment = await moodle_service.get_assignment(
        moodle_domain, moodle_token, assignment_id, course_id,
    )

    # Step 2: Download and extract text from attachments
    attachments = await moodle_service.download_assignment_files(
        moodle_domain, moodle_token, assignment,
    )
    db.update_job(job_id, progress=15, message="Extracting assignment content...")
    attachment_text = file_processor.extract_all(attachments)

    # Step 3: Kick off course indexing if not yet done (non-blocking)
    db.update_job(job_id, progress=25, message="Searching course materials...")
    embedding_count = db.count_embeddings(user_id, course_id)
    if embedding_count == 0:
        asyncio.create_task(
            embed_course_files(user_id, moodle_token, moodle_domain, course_id)
        )

    # Embed the assignment query for RAG (runs regardless of indexing state)
    brief_text = assignment.get("intro", "") + "\n" + attachment_text[:2000]
    assignment_embedding = await gemini_service.embed_text(brief_text)

    # Step 4: RAG search
    relevant_chunks = rag_service.similarity_search(
        user_id=user_id,
        course_id=course_id,
        query_embedding=assignment_embedding,
        top_k=20,
        source_types=["lecture", "reading", "announcement"],
    )

    # Step 5: Fetch past submissions for style reference
    db.update_job(job_id, progress=40, message="Analyzing your writing style...")
    past_submissions = db.get_past_submissions(
        user_id=user_id,
        course_id=course_id,
        limit=5,
    )

    # Step 6: Single Gemini call — analyze + generate draft
    db.update_job(job_id, progress=50, message="Generating draft with AI...")
    course_name = assignment.get("courseName", "")
    analysis_result = await gemini_service.generate_draft_with_analysis(
        assignment_brief=assignment.get("intro", ""),
        attachment_text=attachment_text,
        relevant_chunks=relevant_chunks,
        past_submissions=past_submissions,
        course_name=course_name,
    )

    # Step 7: Save analysis, generate PDF, finalize
    db.update_job(job_id, progress=85, message="Generating PDF...")
    analysis_id = str(uuid.uuid4())

    source_map: dict[str, dict] = {}
    for chunk in relevant_chunks:
        fname = chunk.get("sourceFileName", "Unknown")
        if fname not in source_map:
            source_map[fname] = {
                "fileName": fname,
                "relevance": chunk["similarity"],
                "chunksUsed": 0,
            }
        source_map[fname]["chunksUsed"] += 1
        source_map[fname]["relevance"] = max(source_map[fname]["relevance"], chunk["similarity"])
    sources_used = list(source_map.values())

    db.save_assignment_analysis(
        analysis_id=analysis_id,
        user_id=user_id,
        assignment_id=assignment_id,
        course_id=course_id,
        summary=analysis_result.get("summary", ""),
        deliverables=analysis_result.get("deliverables", []),
        marking_criteria=analysis_result.get("markingCriteria"),
        relevant_chunk_ids=[c["chunkId"] for c in relevant_chunks],
        draft=analysis_result.get("draft"),
        draft_confidence=analysis_result.get("confidence"),
        sources_used=sources_used,
        past_submissions_used=len(past_submissions),
    )

    # Generate PDF (failure is non-fatal)
    pdf_b64 = None
    try:
        user_info = db.get_user_info(user_id) or {}
        pdf_b64 = pdf_generator.generate_draft_pdf_b64(
            student_name=user_info.get("fullname", "Student"),
            student_id=user_info.get("username", ""),
            course_title=assignment.get("courseName", course_name),
            assignment_number=assignment_number or "N/A",
            teacher_name=teacher_name or "N/A",
            summary=analysis_result.get("summary", ""),
            deliverables=analysis_result.get("deliverables", []),
            draft_text=analysis_result.get("draft", ""),
        )
    except Exception as pdf_err:
        logger.warning("PDF generation failed for job %s: %s", job_id, pdf_err)

    result = {
        "analysisId": analysis_id,
        "summary": analysis_result.get("summary", ""),
        "deliverables": analysis_result.get("deliverables", []),
        "draftAvailable": bool(analysis_result.get("draft")),
        "confidence": analysis_result.get("confidence", 0),
        "sourcesCount": len(relevant_chunks),
        "pdfBase64": pdf_b64,
    }
    db.update_job(job_id, status="done", progress=100, result=result)

    # NOTE: "Draft Ready" is surfaced client-side as a local notification when the
    # app finishes polling this job (see app/(modals)/assignment.tsx). We intentionally
    # do not send a server push here — the app never registers an Expo push token.

    logger.info("analyze_assignment completed for job %s, analysis %s", job_id, analysis_id)
