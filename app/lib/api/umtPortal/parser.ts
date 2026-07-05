import { parse, HTMLElement } from 'node-html-parser';
import type { UmtCourse, UmtTimetableRow } from './types';

/** True when the given HTML is the login page (unauthenticated redirect or failed login re-render). */
export function isLoginPage(html: string): boolean {
  return /id=["']loginform["']/i.test(html);
}

export function extractLoginForm(html: string): { token: string; captcha: string } {
  const root = parse(html);
  const token = root.querySelector('input[name="__RequestVerificationToken"]')?.getAttribute('value');
  const captcha = root.querySelector('span.captcha')?.text?.trim();

  if (!token) throw new Error('Could not find the anti-forgery token on the UMT login page.');
  if (!captcha) throw new Error('Could not find the security code on the UMT login page.');

  return { token, captcha };
}

/** Decodes Cloudflare's email obfuscation: hex-encoded bytes XORed with the first byte as key. */
function decodeCfEmail(encoded: string): string {
  const bytes = encoded.match(/.{1,2}/g) ?? [];
  if (bytes.length === 0) return '';
  const key = parseInt(bytes[0]!, 16);
  return bytes
    .slice(1)
    .map((byte) => String.fromCharCode(parseInt(byte, 16) ^ key))
    .join('');
}

function cellText(cell: HTMLElement | null | undefined): string | null {
  if (!cell) return null;
  const cfEncoded = cell.querySelector('a.__cf_email__')?.getAttribute('data-cfemail');
  if (cfEncoded) {
    try {
      return decodeCfEmail(cfEncoded);
    } catch {
      // fall through to raw text below
    }
  }
  return cell.text?.trim() || null;
}

/** Maps normalized header text (lowercased, non-letters stripped) -> column index. */
function headerIndexMap(headerCells: HTMLElement[]): Map<string, number> {
  const map = new Map<string, number>();
  headerCells.forEach((cell, i) => {
    const key = cell.text?.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (key) map.set(key, i);
  });
  return map;
}

function findColumn(map: Map<string, number>, fallbackIndex: number, ...aliases: string[]): number {
  if (map.size === 0) return fallbackIndex;
  for (const alias of aliases) {
    const idx = map.get(alias);
    if (idx !== undefined) return idx;
  }
  return fallbackIndex;
}

/** Parses the "Registered Courses" table returned by GET /MyCourses. */
export function parseCoursesTable(html: string): UmtCourse[] {
  const root = parse(html);
  const table = root.querySelector('table');
  if (!table) return [];

  const rows = table.querySelectorAll('tr');
  if (rows.length === 0) return [];

  const headerCells = rows[0].querySelectorAll('th');
  const cols = headerIndexMap(headerCells);
  const dataRows = headerCells.length > 0 ? rows.slice(1) : rows;

  const idx = {
    code: findColumn(cols, 0, 'id'),
    title: findColumn(cols, 1, 'title'),
    creditHours: findColumn(cols, 2, 'crhr'),
    type: findColumn(cols, 3, 'type'),
    faculty: findColumn(cols, 4, 'faculty'),
    email: findColumn(cols, 5, 'email'),
    mode: findColumn(cols, 6, 'mode'),
    section: findColumn(cols, 7, 'section'),
    semester: findColumn(cols, 8, 'semester'),
  };

  const courses: UmtCourse[] = [];
  for (const row of dataRows) {
    const cells = row.querySelectorAll('td');
    if (cells.length === 0) continue;
    const code = cellText(cells[idx.code]);
    const title = cellText(cells[idx.title]);
    if (!code || !title) continue;

    courses.push({
      code,
      title,
      creditHours: cellText(cells[idx.creditHours]),
      type: cellText(cells[idx.type]),
      faculty: cellText(cells[idx.faculty]),
      email: cellText(cells[idx.email]),
      mode: cellText(cells[idx.mode]),
      section: cellText(cells[idx.section]),
      semester: cellText(cells[idx.semester]),
    });
  }
  return courses;
}

/** Parses the timetable table inside #collapseThree on GET /Home/Index. */
export function parseTimetableTable(html: string): UmtTimetableRow[] {
  const root = parse(html);
  const panel = root.querySelector('#collapseThree');
  const table = (panel ?? root).querySelector('table');
  if (!table) return [];

  const rows = table.querySelectorAll('tr');
  if (rows.length === 0) return [];

  const headerCells = rows[0].querySelectorAll('th');
  const cols = headerIndexMap(headerCells);
  const dataRows = headerCells.length > 0 ? rows.slice(1) : rows;

  const idx = {
    day: findColumn(cols, 0, 'day'),
    code: findColumn(cols, 1, 'ccode', 'code'),
    name: findColumn(cols, 2, 'name'),
    faculty: findColumn(cols, 3, 'faculty'),
    type: findColumn(cols, 4, 'type'),
    mode: findColumn(cols, 5, 'mode'),
    startTime: findColumn(cols, 6, 'starttime'),
    endTime: findColumn(cols, 7, 'endtime'),
    room: findColumn(cols, 8, 'room'),
  };

  const timetable: UmtTimetableRow[] = [];
  for (const row of dataRows) {
    const cells = row.querySelectorAll('td');
    if (cells.length === 0) continue;
    const day = cellText(cells[idx.day]);
    const code = cellText(cells[idx.code]);
    const startTime = cellText(cells[idx.startTime]);
    const endTime = cellText(cells[idx.endTime]);
    if (!day || !code || !startTime || !endTime) continue;

    timetable.push({
      day,
      code,
      name: cellText(cells[idx.name]) ?? '',
      faculty: cellText(cells[idx.faculty]),
      type: cellText(cells[idx.type]),
      mode: cellText(cells[idx.mode]),
      startTime,
      endTime,
      room: cellText(cells[idx.room]),
    });
  }
  return timetable;
}
