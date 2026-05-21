# services/gemini.py
# Gemini API wrapper for embeddings and text generation

import asyncio
import json
import logging

from google import genai
from google.genai import types

from core.config import get_settings
from core.exceptions import GeminiError

logger = logging.getLogger(__name__)

EMBED_MODEL = "gemini-embedding-001"
GENERATE_MODEL = "gemini-2.5-flash"
EMBED_DIMENSIONS = 768
MAX_BATCH_SIZE = 100
MAX_CONTEXT_TOKENS = 900_000  # cap for generate calls

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Get or create the Gemini client."""
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise GeminiError("GEMINI_API_KEY is not configured")
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


async def embed_text(text: str) -> list[float]:
    """Embed a single string. Returns a 768-dim vector."""
    client = _get_client()
    try:
        result = await asyncio.to_thread(
            client.models.embed_content,
            model=EMBED_MODEL,
            contents=text,
            config=types.EmbedContentConfig(output_dimensionality=EMBED_DIMENSIONS),
        )
        return result.embeddings[0].values
    except Exception as e:
        logger.error("Gemini embed_text failed: %s", e)
        raise GeminiError(f"Embedding failed: {e}")


async def embed_batch(texts: list[str]) -> list[list[float]]:
    """
    Embed multiple strings. Splits into batches of MAX_BATCH_SIZE.
    Adds 1-second sleep between batches to respect free-tier rate limits.
    """
    client = _get_client()
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), MAX_BATCH_SIZE):
        batch = texts[i : i + MAX_BATCH_SIZE]

        if i > 0:
            # Rate limit: 1 second between batches
            await asyncio.sleep(1)

        try:
            result = await asyncio.to_thread(
                client.models.embed_content,
                model=EMBED_MODEL,
                contents=batch,
                config=types.EmbedContentConfig(output_dimensionality=EMBED_DIMENSIONS),
            )
            for emb in result.embeddings:
                all_embeddings.append(emb.values)
        except Exception as e:
            logger.error("Gemini embed_batch failed at batch %d: %s", i, e)
            raise GeminiError(f"Batch embedding failed: {e}")

    return all_embeddings


async def summarize_assignment(
    assignment_brief: str,
    attachment_text: str,
) -> dict:
    """
    Summarize an assignment using Gemini.
    Returns { summary, deliverables, markingCriteria }.
    """
    system_prompt = (
        "You are an academic assistant. Analyze this assignment and return "
        "ONLY a JSON object with keys: summary (string), deliverables (array of strings), "
        "markingCriteria (array of {criterion, weight} objects or empty array if not stated). "
        "Be concise and precise. Do not add preamble or markdown fences."
    )

    user_prompt = f"""## Assignment Brief
{assignment_brief}

## Assignment Attachments
{attachment_text[:50000]}"""

    return await _generate_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        fallback={"summary": assignment_brief[:500], "deliverables": [], "markingCriteria": []},
    )


async def generate_draft_with_analysis(
    assignment_brief: str,
    attachment_text: str,
    relevant_chunks: list[dict],
    past_submissions: list[dict],
    course_name: str,
) -> dict:
    """
    Single Gemini call: analyze the assignment AND generate a full draft.
    Returns { summary, deliverables, markingCriteria, draft, confidence, sourcesUsed }.
    """
    system_prompt = (
        f"You are an academic writing assistant helping a university student in Pakistan "
        f"complete their {course_name} assignment. "
        "Follow these rules:\n"
        "1. Write in clear, formal Pakistani English with a natural student voice.\n"
        "2. Use hyphens (-) instead of em-dashes. Never use the em-dash character.\n"
        "3. Prioritize the provided course materials as your primary source.\n"
        "4. You may supplement with accurate general academic knowledge when materials "
        "are insufficient - never leave gaps that make the draft incomplete.\n"
        "5. Include in-text references where applicable (e.g. [Lecture 7, Slide 12]).\n"
        "6. Match the writing style of the student's past submissions when provided.\n\n"
        "Return ONLY a valid JSON object with no preamble or markdown fences. Keys:\n"
        '  "summary" (string): one-paragraph overview of the assignment requirements\n'
        '  "deliverables" (array of strings): what the student must produce/submit\n'
        '  "markingCriteria" (array of {"criterion": string, "weight": string} objects, or [])\n'
        '  "draft" (string): complete submission-ready draft in clean markdown\n'
        '  "confidence" (integer 0-10): how well source materials cover this assignment\n'
        '  "sourcesUsed" (array of {"fileName": string, "chunkIndex": integer, "relevance": float})'
    )

    estimated_system_tokens = len(system_prompt) // 4
    chunks_budget = (
        MAX_CONTEXT_TOKENS
        - estimated_system_tokens
        - (len(attachment_text[:30000]) // 4)
        - 3000
    )
    trimmed_chunks = _trim_chunks_to_budget(relevant_chunks, chunks_budget)
    chunks_text = _format_chunks(trimmed_chunks)
    submissions_text = _format_submissions(past_submissions)

    user_prompt = f"""## Assignment Brief
{assignment_brief}

## Assignment Attachments
{attachment_text[:30000]}

## Relevant Course Material
{chunks_text}

## Student's Past Writing Style (reference only - do not copy content)
{submissions_text}

## Task
Analyze this assignment and write a complete, submission-ready draft.
- Match the writing style and vocabulary of the student's past submissions
- Ground every argument in the provided course materials
- Use proper academic structure appropriate for the assignment type
- Include in-text references to sources (e.g. [Lecture 7, Slide 12])
- Do not include a bibliography unless the assignment brief requires one"""

    return await _generate_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        fallback={
            "summary": assignment_brief[:500],
            "deliverables": [],
            "markingCriteria": [],
            "draft": "Draft generation failed. Please try again.",
            "confidence": 0,
            "sourcesUsed": [],
        },
        max_output_tokens=16384,
        max_retries=3,
    )


async def generate_assignment_draft(
    assignment_brief: str,
    attachment_text: str,
    relevant_chunks: list[dict],
    past_submissions: list[dict],
    course_name: str,
) -> dict:
    """
    Generate a full assignment draft using RAG context.
    Returns { draft, confidence, sourcesUsed }.
    """
    system_prompt = (
        f"You are an academic writing assistant for a university student studying {course_name}. "
        "You write in the student's established voice and style based on their past work. "
        "You write accurate, well-structured academic content grounded entirely in the "
        "provided course materials. Every claim must be traceable to the source material given. "
        "Never invent facts, citations, or content not present in the provided materials. "
        "Return the response as a JSON object with keys: draft (string in clean markdown), "
        "confidence (integer 0-10 based on source coverage), "
        "sourcesUsed (array of {fileName, chunkIndex, relevance} objects). "
        "Do not add preamble or markdown fences around the JSON."
    )

    # Trim chunks to fit context limit before building the prompt
    estimated_system_tokens = len(system_prompt) // 4
    # Reserve budget for the non-chunk parts of the prompt
    chunks_budget = MAX_CONTEXT_TOKENS - estimated_system_tokens - (len(attachment_text[:30000]) // 4) - 2000
    trimmed_chunks = _trim_chunks_to_budget(relevant_chunks, chunks_budget)

    chunks_text = _format_chunks(trimmed_chunks)
    submissions_text = _format_submissions(past_submissions)

    user_prompt = f"""## Assignment Brief
{assignment_brief}

## Assignment Attachments
{attachment_text[:30000]}

## Relevant Course Material
{chunks_text}

## Student's Past Writing Style (for reference only — do not copy content)
{submissions_text}

## Instructions
Write a complete, submission-ready draft for this assignment.
- Match the writing style, tone, and vocabulary of the student's past work
- Ground every argument in the provided course material
- Use proper academic structure appropriate for the assignment type
- Include in-text references to the source material (e.g. [Lecture 7, Slide 12])
- Do not add a bibliography unless the assignment brief requires one"""

    return await _generate_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        fallback={
            "draft": "Draft generation failed. Please try again.",
            "confidence": 0,
            "sourcesUsed": [],
        },
    )


def _trim_chunks_to_budget(chunks: list[dict], token_budget: int) -> list[dict]:
    """Remove chunks from the end until total token count fits within the budget."""
    result = list(chunks)
    while result:
        total = sum(len(c.get("content", "")) // 4 for c in result)
        if total <= token_budget:
            break
        result.pop()
    return result


async def _generate_json(
    system_prompt: str,
    user_prompt: str,
    fallback: dict,
    max_retries: int = 3,
    max_output_tokens: int = 8192,
) -> dict:
    """
    Call Gemini for JSON generation with retry on parse failure.
    Uses response_mime_type="application/json" to force valid JSON output.
    Falls back to multi-strategy extraction if parsing still fails.
    """
    client = _get_client()

    for attempt in range(max_retries):
        text = ""
        try:
            # Capture attempt for closure
            _attempt = attempt

            def _call() -> str:
                response = client.models.generate_content(
                    model=GENERATE_MODEL,
                    contents=user_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        temperature=0.3 if _attempt == 0 else 0.1,
                        max_output_tokens=max_output_tokens,
                        response_mime_type="application/json",
                    ),
                )
                return response.text.strip()

            text = await asyncio.to_thread(_call)
            return _parse_json_robust(text)

        except json.JSONDecodeError:
            logger.warning(
                "Gemini returned non-JSON on attempt %d: %s...",
                attempt + 1,
                text[:300],
            )
            if attempt == max_retries - 1:
                logger.error("Failed to parse Gemini JSON after %d attempts", max_retries)
                return fallback
            await asyncio.sleep(1)
        except Exception as e:
            logger.error("Gemini generation failed on attempt %d: %s", attempt + 1, e)
            if attempt == max_retries - 1:
                raise GeminiError(f"Generation failed: {e}")
            await asyncio.sleep(1)

    return fallback


def _parse_json_robust(text: str) -> dict:
    """
    Try multiple strategies to extract a JSON object from model output.
    Raises json.JSONDecodeError if all strategies fail.
    """
    # Strategy 1: direct parse (works when response_mime_type is respected)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strategy 2: strip markdown code fences (```json ... ``` or ``` ... ```)
    import re as _re
    cleaned = _re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=_re.MULTILINE)
    cleaned = _re.sub(r"\s*```$", "", cleaned.strip(), flags=_re.MULTILINE)
    cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Strategy 3: find the outermost { ... } and parse that slice
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last != -1 and last > first:
        try:
            return json.loads(text[first : last + 1])
        except json.JSONDecodeError:
            pass

    # All strategies failed
    raise json.JSONDecodeError("Could not extract JSON from response", text, 0)


def _format_chunks(chunks: list[dict]) -> str:
    """Format embedding chunks for the prompt."""
    if not chunks:
        return "No relevant course materials found."

    lines = []
    for i, chunk in enumerate(chunks, 1):
        source = chunk.get("sourceFileName", "Unknown source")
        idx = chunk.get("chunkIndex", 0)
        similarity = chunk.get("similarity", 0)
        content = chunk.get("content", "")
        lines.append(
            f"[{i}] Source: {source} (chunk {idx}, relevance: {similarity:.2f})\n{content}\n"
        )
    return "\n".join(lines)


def _format_submissions(submissions: list[dict]) -> str:
    """Format past submissions for style reference."""
    if not submissions:
        return "No past submissions available for style reference."

    lines = []
    for i, sub in enumerate(submissions, 1):
        text = sub.get("submissionText", "")
        # Only include first 2000 chars per submission for context
        excerpt = text[:2000] if text else "(no text content)"
        grade = sub.get("grade", "N/A")
        lines.append(f"[Past Submission {i}] Grade: {grade}\n{excerpt}\n")
    return "\n".join(lines)
