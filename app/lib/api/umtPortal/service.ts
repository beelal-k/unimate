import { createUmtClient, resetPortalSession } from './client';
import { extractLoginForm, isLoginPage, parseCoursesTable, parseTimetableTable } from './parser';
import { UmtRoute } from './constants';
import type { ImportedClass, UmtTimetableRow } from './types';

const DAY_TO_NUMBER: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function dayNameToNumber(raw: string): number | null {
  const key = raw.trim().toLowerCase().slice(0, 3);
  return key in DAY_TO_NUMBER ? DAY_TO_NUMBER[key] : null;
}

/** Converts a portal-displayed time (e.g. "9:00 AM", "14:30") to the app's 'HH:MM' 24h format. */
function to24Hour(raw: string): string {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!match) return raw.trim();
  const [, h, m, meridiem] = match;
  let hour = parseInt(h, 10);
  if (meridiem) {
    const isPm = meridiem.toLowerCase() === 'pm';
    if (isPm && hour !== 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
  }
  return `${String(hour).padStart(2, '0')}:${m}`;
}

/**
 * Logs into the UMT student portal. The portal 302-redirects to /Home/Index on success;
 * the underlying networking layer follows this automatically, so the response we see is
 * already the final page. We detect success/failure from its content rather than a status
 * code, since intermediate redirect status codes aren't observable through fetch/XHR.
 */
export async function loginToPortal(studentId: string, password: string): Promise<void> {
  await resetPortalSession();
  const client = createUmtClient();

  const loginPageRes = await client.get(UmtRoute.Login);
  const { token, captcha } = extractLoginForm(loginPageRes.data as string);

  const body = new URLSearchParams({
    __RequestVerificationToken: token,
    student_id: studentId,
    Password: password,
    SecurityCode: captcha,
  }).toString();

  const loginRes = await client.post(UmtRoute.Login, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (isLoginPage(loginRes.data as string)) {
    throw new Error('Invalid UMT student ID, password, or security code. Please try again.');
  }
}

export async function getMyCourses() {
  const client = createUmtClient();
  const res = await client.get(UmtRoute.MyCourses);
  const html = res.data as string;
  if (isLoginPage(html)) {
    throw new Error('Your UMT portal session expired. Please try importing again.');
  }
  return parseCoursesTable(html);
}

export async function getTimetable() {
  const client = createUmtClient();
  const res = await client.get(UmtRoute.Dashboard);
  const html = res.data as string;
  if (isLoginPage(html)) {
    throw new Error('Your UMT portal session expired. Please try importing again.');
  }
  return parseTimetableTable(html);
}

/**
 * Logs in, fetches registered courses + timetable, and joins them by course code into
 * one entry per distinct (code, startTime, endTime) slot — matching the app's `classes`
 * schema, which stores a single start/end time per row and a daysOfWeek array.
 */
export async function importSchedule(
  studentId: string,
  password: string,
  onProgress?: (phase: string) => void,
): Promise<ImportedClass[]> {
  onProgress?.('Logging in…');
  await loginToPortal(studentId, password);

  onProgress?.('Fetching courses and timetable…');
  const [courses, timetable] = await Promise.all([getMyCourses(), getTimetable()]);

  onProgress?.('Matching classes…');

  const courseByCode = new Map(courses.map((c) => [c.code.toLowerCase(), c]));

  const groups = new Map<string, { row: UmtTimetableRow; days: Set<number> }>();
  for (const raw of timetable) {
    const day = dayNameToNumber(raw.day);
    if (day === null) continue;

    const startTime = to24Hour(raw.startTime);
    const endTime = to24Hour(raw.endTime);
    const key = `${raw.code.toLowerCase()}|${startTime}|${endTime}`;

    const existing = groups.get(key);
    if (existing) {
      existing.days.add(day);
    } else {
      groups.set(key, { row: { ...raw, startTime, endTime }, days: new Set([day]) });
    }
  }

  const result: ImportedClass[] = [];
  for (const { row, days } of groups.values()) {
    const course = courseByCode.get(row.code.toLowerCase());
    result.push({
      name: course?.title || row.name,
      code: row.code || null,
      section: course?.section ?? null,
      instructor: row.faculty || course?.faculty || null,
      room: row.room,
      daysOfWeek: Array.from(days).sort((a, b) => a - b),
      startTime: row.startTime,
      endTime: row.endTime,
    });
  }
  return result;
}
