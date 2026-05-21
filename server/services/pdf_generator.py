# services/pdf_generator.py
# Generates PDF documents for assignment drafts using ReportLab

import base64
import io
import re
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

MARGIN = 2.5 * cm


def generate_draft_pdf(
    *,
    student_name: str,
    student_id: str,
    course_title: str,
    assignment_number: str,
    teacher_name: str,
    summary: str,
    deliverables: list[str],
    draft_text: str,
) -> bytes:
    """Generate a PDF for an assignment draft. Returns raw PDF bytes."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title=f"Assignment Draft - {course_title}",
        author=student_name,
    )

    styles = getSampleStyleSheet()
    story = _build_cover(
        styles, student_name, student_id, course_title, assignment_number, teacher_name
    )
    story.append(PageBreak())
    story.extend(_build_body(styles, summary, deliverables, draft_text))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()


def generate_draft_pdf_b64(
    *,
    student_name: str,
    student_id: str,
    course_title: str,
    assignment_number: str,
    teacher_name: str,
    summary: str,
    deliverables: list[str],
    draft_text: str,
) -> str:
    """Return the PDF as a base64-encoded string."""
    raw = generate_draft_pdf(
        student_name=student_name,
        student_id=student_id,
        course_title=course_title,
        assignment_number=assignment_number,
        teacher_name=teacher_name,
        summary=summary,
        deliverables=deliverables,
        draft_text=draft_text,
    )
    return base64.b64encode(raw).decode("utf-8")


def _build_cover(styles, student_name, student_id, course_title, assignment_number, teacher_name):
    cover_title = ParagraphStyle(
        "CoverTitle",
        parent=styles["Title"],
        fontSize=20,
        spaceAfter=6,
        textColor=colors.HexColor("#0A0A0A"),
        alignment=1,
    )
    cover_label = ParagraphStyle(
        "CoverLabel",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#6E6E6E"),
        alignment=1,
        spaceAfter=2,
    )
    cover_value = ParagraphStyle(
        "CoverValue",
        parent=styles["Normal"],
        fontSize=13,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#111827"),
        alignment=1,
        spaceAfter=14,
    )

    date_str = datetime.now().strftime("%B %d, %Y")

    return [
        Spacer(1, 4 * cm),
        Paragraph(_esc(course_title), cover_title),
        Spacer(1, 0.5 * cm),
        HRFlowable(width="60%", thickness=1, color=colors.HexColor("#E5E7EB"), hAlign="CENTER"),
        Spacer(1, 1.5 * cm),
        Paragraph("Assignment Number", cover_label),
        Paragraph(_esc(assignment_number or "N/A"), cover_value),
        Paragraph("Submitted By", cover_label),
        Paragraph(_esc(student_name), cover_value),
        Paragraph("Student ID", cover_label),
        Paragraph(_esc(student_id or "N/A"), cover_value),
        Paragraph("Course Teacher", cover_label),
        Paragraph(_esc(teacher_name or "N/A"), cover_value),
        Paragraph("Date", cover_label),
        Paragraph(date_str, cover_value),
    ]


def _build_body(styles, summary, deliverables, draft_text):
    h1 = ParagraphStyle(
        "DraftH1",
        parent=styles["Heading1"],
        fontSize=16,
        spaceBefore=18,
        spaceAfter=6,
        textColor=colors.HexColor("#111827"),
    )
    h2 = ParagraphStyle(
        "DraftH2",
        parent=styles["Heading2"],
        fontSize=13,
        spaceBefore=12,
        spaceAfter=4,
        textColor=colors.HexColor("#374151"),
    )
    body = ParagraphStyle(
        "DraftBody",
        parent=styles["Normal"],
        fontSize=11,
        leading=17,
        spaceAfter=6,
        textColor=colors.HexColor("#111827"),
    )
    bullet = ParagraphStyle(
        "DraftBullet",
        parent=styles["Normal"],
        fontSize=11,
        leading=17,
        leftIndent=20,
        spaceAfter=4,
        textColor=colors.HexColor("#111827"),
    )

    story = []

    if summary:
        story.append(Paragraph("Summary", h1))
        story.append(Paragraph(_esc(summary), body))
        story.append(Spacer(1, 0.3 * cm))

    if deliverables:
        story.append(Paragraph("Deliverables", h1))
        for d in deliverables:
            story.append(Paragraph(f"&#8226; {_esc(d)}", bullet))
        story.append(Spacer(1, 0.3 * cm))

    if draft_text:
        story.append(Paragraph("Assignment Draft", h1))
        story.extend(_markdown_to_flowables(draft_text, h2, body, bullet))

    return story


def _markdown_to_flowables(text: str, h2_style, body_style, bullet_style):
    flowables = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            flowables.append(Spacer(1, 0.2 * cm))
            continue

        if stripped.startswith("### ") or stripped.startswith("## ") or stripped.startswith("# "):
            content = _inline_md(_esc(re.sub(r"^#+\s*", "", stripped)))
            flowables.append(Paragraph(content, h2_style))
        elif stripped.startswith(("- ", "* ")):
            content = _inline_md(_esc(stripped[2:]))
            flowables.append(Paragraph(f"&#8226; {content}", bullet_style))
        elif re.match(r"^\d+\.\s", stripped):
            content = _inline_md(_esc(re.sub(r"^\d+\.\s*", "", stripped)))
            flowables.append(Paragraph(f"&#8226; {content}", bullet_style))
        else:
            content = _inline_md(_esc(stripped))
            flowables.append(Paragraph(content, body_style))

    return flowables


def _esc(text: str) -> str:
    """Escape XML special characters for ReportLab."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _inline_md(text: str) -> str:
    """Convert inline bold/italic markdown to ReportLab XML tags (text must be pre-escaped)."""
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
    return text
