import { createMoodleClient } from '../client';
import { MoodleFunction } from '../constants';
import { parseQuestion } from './parser';
import type { MoodleCredentials } from '../types';
import type { MoodleQuiz, MoodleAttempt, ParsedQuestion, QuizBestGrade } from './types';

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getQuizzesByCourses(
  creds: MoodleCredentials,
  courseIds: number[],
): Promise<MoodleQuiz[]> {
  const params: Record<string, string | number> = {
    wsfunction: MoodleFunction.GetQuizzesByCourses,
  };
  courseIds.forEach((id, i) => { params[`courseids[${i}]`] = id; });

  const { data } = await createMoodleClient(creds).get<{ quizzes: MoodleQuiz[] }>('', { params });
  return data.quizzes ?? [];
}

export async function getUserAttempts(
  creds: MoodleCredentials,
  quizId: number,
  userId: number,
): Promise<MoodleAttempt[]> {
  const { data } = await createMoodleClient(creds).get<{ attempts: MoodleAttempt[] }>('', {
    params: { wsfunction: MoodleFunction.GetUserAttempts, quizid: quizId, userid: userId },
  });
  return data.attempts ?? [];
}

export async function getUserBestGrade(
  creds: MoodleCredentials,
  quizId: number,
  userId: number,
): Promise<QuizBestGrade> {
  const { data } = await createMoodleClient(creds).get<QuizBestGrade>('', {
    params: { wsfunction: MoodleFunction.GetUserBestGrade, quizid: quizId, userid: userId },
  });
  return data;
}

export async function getAttemptSummary(
  creds: MoodleCredentials,
  attemptId: number,
  uniqueid: number,
): Promise<ParsedQuestion[]> {
  const { data } = await createMoodleClient(creds).get<{ questions: any[] }>('', {
    params: { wsfunction: MoodleFunction.GetAttemptSummary, attemptid: attemptId },
  });
  return (data.questions ?? []).map((q) => parseQuestion(q, uniqueid));
}

// ─── Writes (POST) ────────────────────────────────────────────────────────────

function buildAnswerForm(
  attemptId: number,
  answers: Array<{ name: string; value: string }>,
  finishattempt: 0 | 1,
): string {
  const p = new URLSearchParams();
  p.append('attemptid', String(attemptId));
  p.append('finishattempt', String(finishattempt));
  p.append('timeup', '0');
  answers.forEach((a, i) => {
    p.append(`data[${i}][name]`, a.name);
    p.append(`data[${i}][value]`, a.value);
  });
  return p.toString();
}

export async function startAttempt(
  creds: MoodleCredentials,
  quizId: number,
): Promise<MoodleAttempt> {
  const body = new URLSearchParams({ quizid: String(quizId) }).toString();
  const { data } = await createMoodleClient(creds).post<{ attempt: MoodleAttempt }>(
    '',
    body,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      params: { wsfunction: MoodleFunction.StartAttempt } },
  );
  return data.attempt;
}

export async function saveAttempt(
  creds: MoodleCredentials,
  attemptId: number,
  answers: Array<{ name: string; value: string }>,
): Promise<void> {
  const body = buildAnswerForm(attemptId, answers, 0);
  await createMoodleClient(creds).post('', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    params: { wsfunction: MoodleFunction.SaveAttempt },
  });
}

export async function submitAttempt(
  creds: MoodleCredentials,
  attemptId: number,
  answers: Array<{ name: string; value: string }>,
): Promise<void> {
  const body = buildAnswerForm(attemptId, answers, 1);
  await createMoodleClient(creds).post('', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    params: { wsfunction: MoodleFunction.ProcessAttempt },
  });
}

export async function viewQuiz(creds: MoodleCredentials, quizId: number): Promise<void> {
  await createMoodleClient(creds).get('', {
    params: { wsfunction: MoodleFunction.ViewQuiz, quizid: quizId },
  });
}
