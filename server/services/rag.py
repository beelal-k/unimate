# services/rag.py
# RAG pipeline utilities: chunking and vector similarity search

import json
import logging
import math
import re

from core import database as db

logger = logging.getLogger(__name__)


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> list[dict]:
    """
    Split text into overlapping chunks of approximately chunk_size tokens.
    Uses sentence boundaries where possible to avoid mid-sentence splits.
    Returns list of { index, content, token_count }.
    """
    if not text or not text.strip():
        return []

    # Approximate token count as words (rough 1 word ≈ 1.3 tokens)
    sentences = _split_sentences(text)
    chunks: list[dict] = []
    current_tokens: list[str] = []
    current_count = 0

    for sentence in sentences:
        words = sentence.split()
        sentence_tokens = len(words)

        if current_count + sentence_tokens > chunk_size and current_tokens:
            # Finalize current chunk
            chunk_text_content = " ".join(current_tokens)
            chunks.append({
                "index": len(chunks),
                "content": chunk_text_content.strip(),
                "token_count": current_count,
            })

            # Keep overlap tokens from the end
            overlap_words = current_tokens[-overlap:] if overlap > 0 else []
            current_tokens = overlap_words + words
            current_count = len(current_tokens)
        else:
            current_tokens.extend(words)
            current_count += sentence_tokens

    # Final chunk
    if current_tokens:
        chunk_text_content = " ".join(current_tokens)
        chunks.append({
            "index": len(chunks),
            "content": chunk_text_content.strip(),
            "token_count": current_count,
        })

    return chunks


def _split_sentences(text: str) -> list[str]:
    """Split text at sentence boundaries."""
    # Split on period/question/exclamation followed by space and uppercase letter
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    # Also split on newlines for structured documents
    result = []
    for part in parts:
        sub_parts = part.split("\n")
        result.extend(p.strip() for p in sub_parts if p.strip())
    return result


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """
    Compute cosine similarity between two vectors.
    Pure Python — no numpy dependency needed.
    """
    if len(vec_a) != len(vec_b):
        return 0.0

    dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
    magnitude_a = math.sqrt(sum(a * a for a in vec_a))
    magnitude_b = math.sqrt(sum(b * b for b in vec_b))

    if magnitude_a == 0 or magnitude_b == 0:
        return 0.0

    return dot_product / (magnitude_a * magnitude_b)


def similarity_search(
    user_id: str,
    course_id: str,
    query_embedding: list[float],
    top_k: int = 20,
    source_types: list[str] | None = None,
    min_similarity: float = 0.6,
) -> list[dict]:
    """
    Fetch all embeddings for user+course from Turso.
    Compute cosine similarity against query_embedding for each.
    Return top_k results above min_similarity threshold, sorted descending.
    """
    # Load embeddings into memory
    embeddings = db.get_embeddings_for_course(
        user_id=user_id,
        course_id=course_id,
        source_types=source_types,
    )

    if not embeddings:
        logger.info("No embeddings found for user=%s course=%s", user_id, course_id)
        return []

    # Compute similarities
    scored = []
    for emb in embeddings:
        similarity = cosine_similarity(query_embedding, emb["embedding"])
        if similarity >= min_similarity:
            scored.append({
                "chunkId": emb["id"],
                "content": emb["content"],
                "similarity": round(similarity, 4),
                "sourceFileName": emb["sourceFileName"],
                "chunkIndex": emb["chunkIndex"],
                "sourceType": emb["sourceType"],
            })

    # Sort by similarity descending, take top_k
    scored.sort(key=lambda x: x["similarity"], reverse=True)
    results = scored[:top_k]

    logger.info(
        "Similarity search: %d embeddings checked, %d above threshold, returning top %d",
        len(embeddings),
        len(scored),
        len(results),
    )

    # Release the embeddings list from memory
    del embeddings
    del scored

    return results
