import type { ParsedQuestion, ParsedOption } from './types';

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, '').trim());
}

interface RawSummaryQuestion {
  slot: number;
  page: number;
  number: number;
  type: string;
  html: string;
  stateclass: string;
  maxmark: number;
  sequencecheck: number;
}

export function parseQuestion(q: RawSummaryQuestion, uniqueid: number): ParsedQuestion {
  const html = q.html;

  // Question text — grab content of .qtext div
  const qtextMatch = html.match(/<div[^>]*class="qtext"[^>]*>([\s\S]*?)<\/div>/);
  const text = qtextMatch ? stripTags(qtextMatch[1]) : '(Question text unavailable)';

  // Construct field names deterministically from uniqueid + slot
  const inputName = `q${uniqueid}:${q.slot}_answer`;
  const seqName   = `q${uniqueid}:${q.slot}_:sequencecheck`;
  const seqValue  = String(q.sequencecheck);

  // Currently checked answer value
  const checkedMatch = html.match(/value="(-?\d+)"[^>]*checked="checked"|checked="checked"[^>]*value="(-?\d+)"/);
  const selectedValue = checkedMatch
    ? (checkedMatch[1] ?? checkedMatch[2] ?? null)
    : null;

  // Parse MCQ / truefalse options from answer divs
  const options: ParsedOption[] = [];
  if (q.type === 'multichoice' || q.type === 'truefalse') {
    const optRegex = /<input[^>]+type="radio"[^>]+value="(\d+)"[\s\S]*?data-region="answer-label">([\s\S]*?)<\/div>\s*<\/div>/g;
    let m;
    while ((m = optRegex.exec(html)) !== null) {
      options.push({ value: m[1], label: stripTags(m[2]) });
    }
  }

  return {
    slot: q.slot,
    page: q.page,
    number: q.number,
    type: q.type,
    text,
    options,
    inputName,
    seqName,
    seqValue,
    selectedValue,
    state: q.stateclass,
    maxMark: q.maxmark,
  };
}
