import * as SecureStore from 'expo-secure-store';
import { createMoodleClient } from './client';
import { MoodleFunction } from './constants';
import type {
  MoodleCredentials,
  MoodleSiteInfo,
  MoodleCourse,
  MoodleAssignment,
  MoodleGrade,
  MoodleSubmissionStatus,
} from './types';

export interface SubmissionConfig {
  maxFiles: number;
  maxSizeBytes: number;
  allowedTypes: string[];
}

const KEY_SITE_URL = 'moodle_site_url';
const KEY_TOKEN = 'moodle_token';

// ─── Credential helpers ────────────────────────────────────────────────────

export async function getMoodleCredentials(): Promise<MoodleCredentials | null> {
  try {
    const siteUrl = await SecureStore.getItemAsync(KEY_SITE_URL);
    const token = await SecureStore.getItemAsync(KEY_TOKEN);
    if (!siteUrl || !token) return null;
    return { siteUrl, token };
  } catch {
    return null;
  }
}

export async function saveMoodleCredentials(
  siteUrl: string,
  token: string,
): Promise<void> {
  await SecureStore.setItemAsync(KEY_SITE_URL, siteUrl.replace(/\/$/, ''));
  await SecureStore.setItemAsync(KEY_TOKEN, token);
}

export async function clearMoodleCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_SITE_URL);
  await SecureStore.deleteItemAsync(KEY_TOKEN);
}

// ─── Auth ──────────────────────────────────────────────────────────────────

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

  const data = (await res.json()) as { token?: string; error?: string };
  if (data.error) throw new Error(data.error);
  if (!data.token) throw new Error('No token received from Moodle');

  return data.token;
}

// ─── API calls ────────────────────────────────────────────────────────────

export async function getSiteInfo(
  creds: MoodleCredentials,
): Promise<MoodleSiteInfo> {
  const { data } = await createMoodleClient(creds).get<MoodleSiteInfo>('', {
    params: { wsfunction: MoodleFunction.GetSiteInfo },
  });
  return data;
}

export async function invalidateMoodleTokens(
  creds: MoodleCredentials,
): Promise<void> {
  await createMoodleClient(creds).get('', {
    params: { wsfunction: MoodleFunction.InvalidateTokens },
  });
}

export async function getCourses(
  creds: MoodleCredentials,
  userId: number,
): Promise<MoodleCourse[]> {
  const { data } = await createMoodleClient(creds).get<MoodleCourse[]>('', {
    params: { wsfunction: MoodleFunction.GetUserCourses, userid: userId },
  });
  return data;
}

export async function getAssignments(
  creds: MoodleCredentials,
  courseIds: number[],
): Promise<MoodleAssignment[]> {
  const courseParams: Record<string, number> = {};
  courseIds.forEach((id, i) => {
    courseParams[`courseids[${i}]`] = id;
  });

  const { data } = await createMoodleClient(creds).get<{
    courses: { assignments: MoodleAssignment[] }[];
  }>('', {
    params: { wsfunction: MoodleFunction.GetAssignments, ...courseParams },
  });
  return data.courses.flatMap((c) => c.assignments);
}

export async function getGrades(
  creds: MoodleCredentials,
  courseId: number,
  userId: number,
): Promise<MoodleGrade[]> {
  const { data } = await createMoodleClient(creds).get<{
    usergrades: { gradeitems: MoodleGrade[] }[];
  }>('', {
    params: {
      wsfunction: MoodleFunction.GetGradeItems,
      courseid: courseId,
      userid: userId,
    },
  });
  return data.usergrades?.[0]?.gradeitems ?? [];
}

export async function getSubmissionStatus(
  creds: MoodleCredentials,
  assignmentId: number,
): Promise<MoodleSubmissionStatus> {
  const { data } = await createMoodleClient(creds).get<MoodleSubmissionStatus>('', {
    params: { wsfunction: MoodleFunction.GetSubmissionStatus, assignid: assignmentId },
  });
  return data;
}

export async function getUnusedDraftItemId(creds: MoodleCredentials): Promise<number> {
  const { data } = await createMoodleClient(creds).get<{ itemid: number }>('', {
    params: { wsfunction: MoodleFunction.GetUnusedDraftItemId },
  });
  return data.itemid;
}

export async function uploadFileToDraft(
  creds: MoodleCredentials,
  draftItemId: number,
  fileUri: string,
  fileName: string,
  mimeType: string,
): Promise<number> {
  const formData = new FormData();
  formData.append('token', creds.token);
  formData.append('filearea', 'draft');
  formData.append('itemid', String(draftItemId));
  // React Native FormData file append
  formData.append('file_1', { uri: fileUri, name: fileName, type: mimeType } as any);

  const res = await fetch(`${creds.siteUrl}/webservice/upload.php`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const json = (await res.json()) as Array<{ itemid: number; error?: string }> | { error: string };
  if (!Array.isArray(json)) throw new Error((json as any).error || 'Upload failed');
  if ((json[0] as any).error) throw new Error((json[0] as any).error);
  return json[0].itemid;
}

export async function saveSubmission(
  creds: MoodleCredentials,
  assignmentId: number,
  itemId: number,
): Promise<void> {
  // URLSearchParams encodes brackets as %5B/%5D which breaks Moodle's parser.
  // Build the body string manually to keep brackets literal.
  // The file plugin registers its external parameter as "files_filemanager" (not
  // "assignsubmission_file_filemanager") — see submission/file/locallib.php:get_external_parameters().
  const body = [
    `wstoken=${encodeURIComponent(creds.token)}`,
    `wsfunction=${MoodleFunction.SaveSubmission}`,
    `moodlewsrestformat=json`,
    `assignmentid=${assignmentId}`,
    `plugindata[files_filemanager]=${itemId}`,
  ].join('&');

  const res = await fetch(`${creds.siteUrl}/webservice/rest/server.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as any;
  if (data?.exception) throw new Error(data.message || 'Failed to save submission');
}

export async function submitForGrading(
  creds: MoodleCredentials,
  assignmentId: number,
): Promise<void> {
  const body = [
    `wstoken=${encodeURIComponent(creds.token)}`,
    `wsfunction=${MoodleFunction.SubmitForGrading}`,
    `moodlewsrestformat=json`,
    `assignmentid=${assignmentId}`,
    `acceptsubmissionstatement=1`,
  ].join('&');

  const res = await fetch(`${creds.siteUrl}/webservice/rest/server.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as any;
  if (data?.exception) throw new Error(data.message || 'Failed to submit for grading');
}

export async function removeSubmission(
  creds: MoodleCredentials,
  assignmentId: number,
  userId: number,
): Promise<void> {
  const body = [
    `wstoken=${encodeURIComponent(creds.token)}`,
    `wsfunction=${MoodleFunction.RemoveSubmission}`,
    `moodlewsrestformat=json`,
    `assignid=${assignmentId}`,
    `userid=${userId}`,
  ].join('&');

  const res = await fetch(`${creds.siteUrl}/webservice/rest/server.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as any;
  if (data?.exception) throw new Error(data.message || 'Failed to remove submission');
}

export function getAuthenticatedFileUrl(
  fileUrl: string,
  token: string,
): string {
  const sep = fileUrl.includes('?') ? '&' : '?';
  return `${fileUrl}${sep}token=${token}`;
}
