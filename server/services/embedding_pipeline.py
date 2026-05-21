# services/embedding_pipeline.py
# Shared embedding pipeline used by both the embed_course task and the
# inline embedding step inside analyze_assignment.

import logging
import uuid

from core import database as db
from services import file_processor
from services import gemini as gemini_service
from services import moodle as moodle_service
from services import rag as rag_service

logger = logging.getLogger(__name__)


async def embed_course_files(
    user_id: str,
    moodle_token: str,
    moodle_domain: str,
    course_id: str,
    force: bool = False,
) -> dict:
    """
    Download, extract, chunk, embed, and persist all course files for a given course.

    Returns a summary dict with 'totalFiles', 'embedded', and 'skipped' counts.
    Skips files that are already embedded unless `force=True`.
    """
    resources = await moodle_service.get_course_contents(moodle_domain, moodle_token, course_id)

    total = len(resources)
    embedded_count = 0
    skipped_count = 0

    for resource in resources:
        if not force and db.embedding_exists(user_id, course_id, resource["fileurl"]):
            skipped_count += 1
            continue

        filename = resource.get("filename", "unknown")
        try:
            file_bytes = await moodle_service.download_file(
                moodle_domain, moodle_token, resource["fileurl"],
            )
            text = file_processor.extract(file_bytes, resource["mimetype"])
            if not text or len(text.strip()) < 50:
                skipped_count += 1
                continue

            chunks = rag_service.chunk_text(text, chunk_size=500, overlap=50)
            if not chunks:
                skipped_count += 1
                continue

            embeddings = await gemini_service.embed_batch([c["content"] for c in chunks])

            source_type = _infer_source_type(resource)
            embedding_data = [
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "course_id": course_id,
                    "source_type": source_type,
                    "source_file_url": resource["fileurl"],
                    "source_file_name": filename,
                    "chunk_index": chunk["index"],
                    "chunk_total": len(chunks),
                    "content": chunk["content"],
                    "embedding": emb,
                }
                for chunk, emb in zip(chunks, embeddings)
            ]
            db.batch_save_embeddings(embedding_data)
            embedded_count += 1

        except Exception as e:
            logger.warning("Failed to embed resource %s: %s", filename, e)

    return {"totalFiles": total, "embedded": embedded_count, "skipped": skipped_count}


def _infer_source_type(resource: dict) -> str:
    """Infer the embedding source type from the resource metadata."""
    filename = resource.get("filename", "").lower()
    section = resource.get("section_name", "").lower()
    module = resource.get("module_name", "").lower()

    combined = filename + section + module

    if any(kw in combined for kw in ["lecture", "slide", "lec"]):
        return "lecture"
    if any(kw in combined for kw in ["read", "chapter", "textbook", "article"]):
        return "reading"
    if any(kw in combined for kw in ["announce", "news", "notice"]):
        return "announcement"
    return "lecture"  # Default to lecture for generic course materials
