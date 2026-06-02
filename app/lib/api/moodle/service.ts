import * as SecureStore from 'expo-secure-store';
import { createMoodleClient } from './client';
import { MoodleFunction } from './constants';
import type {
  MoodleCredentials,
  MoodleSiteInfo,
  MoodleCourse,
  MoodleAssignment,
  MoodleGrade,
} from './types';

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

export function getAuthenticatedFileUrl(
  fileUrl: string,
  token: string,
): string {
  const sep = fileUrl.includes('?') ? '&' : '?';
  return `${fileUrl}${sep}token=${token}`;
}
