// lib/api/moodle.ts
// Moodle Web Service REST API client

import * as SecureStore from 'expo-secure-store';

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  enrolledusercount?: number;
  summary?: string;
}

export interface MoodleAttachment {
  filename: string;
  fileurl: string;
  filesize: number;
  mimetype: string;
}

export interface MoodleAssignment {
  id: number;
  cmid: number;
  course: number;
  name: string;
  duedate: number;
  allowsubmissionsfromdate: number;
  grade: number;
  intro: string;
  nosubmissions: number;
  introattachments?: MoodleAttachment[];
}

export interface MoodleGrade {
  courseid: number;
  itemname: string;
  graderaw: number | null;
  grademax: number;
  feedback: string;
}

export interface MoodleCredentials {
  siteUrl: string;
  token: string;
}

const STORAGE_KEY_URL = 'moodle_site_url';
const STORAGE_KEY_TOKEN = 'moodle_token';

export async function saveMoodleCredentials(siteUrl: string, token: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY_URL, siteUrl.replace(/\/$/, ''));
  await SecureStore.setItemAsync(STORAGE_KEY_TOKEN, token);
}

export async function getMoodleCredentials(): Promise<MoodleCredentials | null> {
  try {
    const siteUrl = await SecureStore.getItemAsync(STORAGE_KEY_URL);
    const token = await SecureStore.getItemAsync(STORAGE_KEY_TOKEN);
    if (!siteUrl || !token) return null;
    return { siteUrl, token };
  } catch {
    return null;
  }
}

export async function clearMoodleCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY_URL);
  await SecureStore.deleteItemAsync(STORAGE_KEY_TOKEN);
}

export async function loginToMoodle(
  siteUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const url = `${siteUrl.replace(/\/$/, '')}/login/token.php`;
  const params = new URLSearchParams({
    username,
    password,
    service: 'moodle_mobile_app',
  });

  const res = await fetch(`${url}?${params.toString()}`);
  if (!res.ok) throw new Error(`Moodle login failed: ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  if (!data.token) throw new Error('No token received from Moodle');

  return data.token;
}

async function moodleCall<T>(
  creds: MoodleCredentials,
  wsfunction: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const url = `${creds.siteUrl}/webservice/rest/server.php`;
  const allParams = new URLSearchParams({
    wstoken: creds.token,
    wsfunction,
    moodlewsrestformat: 'json',
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ),
  });

  const res = await fetch(`${url}?${allParams.toString()}`);
  if (!res.ok) throw new Error(`Moodle API error: ${res.status}`);

  const data = await res.json();
  if (data.exception) throw new Error(data.message || data.exception);

  return data as T;
}

export async function getSiteInfo(creds: MoodleCredentials) {
  return moodleCall<{ userid: number; fullname: string; sitename: string }>(
    creds,
    'core_webservice_get_site_info',
  );
}

export async function getCourses(creds: MoodleCredentials, userId: number): Promise<MoodleCourse[]> {
  return moodleCall<MoodleCourse[]>(creds, 'core_enrol_get_users_courses', {
    userid: userId,
  });
}

export async function getAssignments(
  creds: MoodleCredentials,
  courseIds: number[],
): Promise<MoodleAssignment[]> {
  const params: Record<string, string | number> = {};
  courseIds.forEach((id, i) => {
    params[`courseids[${i}]`] = id;
  });

  const data = await moodleCall<{ courses: { assignments: MoodleAssignment[] }[] }>(
    creds,
    'mod_assign_get_assignments',
    params,
  );

  return data.courses.flatMap((c) => c.assignments);
}

/**
 * Build a downloadable file URL from a Moodle file URL
 * Moodle file URLs need the token appended for authentication
 */
export function getAuthenticatedFileUrl(fileUrl: string, token: string): string {
  const separator = fileUrl.includes('?') ? '&' : '?';
  return `${fileUrl}${separator}token=${token}`;
}

export async function getGrades(
  creds: MoodleCredentials,
  courseId: number,
  userId: number,
): Promise<MoodleGrade[]> {
  const data = await moodleCall<{
    usergrades: { gradeitems: MoodleGrade[] }[];
  }>(creds, 'gradereport_user_get_grade_items', {
    courseid: courseId,
    userid: userId,
  });

  return data.usergrades?.[0]?.gradeitems || [];
}
