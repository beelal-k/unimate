import { create } from 'zustand';
import { getMoodleCredentials, getSiteInfo } from '../api/moodle';
import {
  getQuizzesByCourses,
  getUserAttempts,
  getUserBestGrade,
  startAttempt as apiStartAttempt,
  getAttemptSummary,
  saveAttempt as apiSaveAttempt,
  submitAttempt as apiSubmitAttempt,
  viewQuiz,
} from '../api/moodle/quiz';
import type { MoodleQuiz, MoodleAttempt, ParsedQuestion, QuizBestGrade } from '../api/moodle/quiz';

export type { MoodleQuiz, MoodleAttempt, ParsedQuestion };

interface QuizState {
  quizzes: MoodleQuiz[];
  // keyed by quizId
  attempts: Record<number, MoodleAttempt[]>;
  bestGrades: Record<number, QuizBestGrade>;
  isSyncing: boolean;

  // active attempt
  activeQuiz: MoodleQuiz | null;
  activeAttempt: MoodleAttempt | null;
  questions: ParsedQuestion[];
  answers: Record<number, string>; // slot → selected value
  isLoadingAttempt: boolean;
  isSaving: boolean;
  isSubmitting: boolean;

  syncQuizzes: (courseIds: number[]) => Promise<void>;
  loadAttemptState: (quiz: MoodleQuiz) => Promise<void>;
  startAttempt: (quiz: MoodleQuiz) => Promise<void>;
  setAnswer: (slot: number, value: string) => void;
  saveProgress: () => Promise<void>;
  submitAttempt: () => Promise<void>;
  clearAttempt: () => void;
  // helpers
  getAttemptsForQuiz: (quizId: number) => MoodleAttempt[];
  canAttempt: (quiz: MoodleQuiz) => boolean;
  hasInProgress: (quizId: number) => MoodleAttempt | undefined;
}

async function getCredAndUser() {
  const creds = await getMoodleCredentials();
  if (!creds) throw new Error('Not connected to Moodle');
  const siteInfo = await getSiteInfo(creds);
  return { creds, userId: siteInfo.userid };
}

export const useQuizStore = create<QuizState>((set, get) => ({
  quizzes: [],
  attempts: {},
  bestGrades: {},
  isSyncing: false,
  activeQuiz: null,
  activeAttempt: null,
  questions: [],
  answers: {},
  isLoadingAttempt: false,
  isSaving: false,
  isSubmitting: false,

  syncQuizzes: async (courseIds) => {
    if (courseIds.length === 0) return;
    set({ isSyncing: true });
    try {
      const { creds, userId } = await getCredAndUser();
      const quizzes = await getQuizzesByCourses(creds, courseIds);
      set({ quizzes, isSyncing: false });

      // Fetch attempts + best grades for all quizzes in parallel
      const attemptsMap: Record<number, MoodleAttempt[]> = {};
      const gradesMap: Record<number, QuizBestGrade> = {};
      await Promise.allSettled(
        quizzes.map(async (q) => {
          const [attList, grade] = await Promise.all([
            getUserAttempts(creds, q.id, userId),
            getUserBestGrade(creds, q.id, userId),
          ]);
          attemptsMap[q.id] = attList;
          gradesMap[q.id]   = grade;
        }),
      );
      set({ attempts: attemptsMap, bestGrades: gradesMap });
    } catch {
      set({ isSyncing: false });
    }
  },

  loadAttemptState: async (quiz) => {
    set({ isLoadingAttempt: true, activeQuiz: quiz, questions: [], answers: {} });
    try {
      const { creds, userId } = await getCredAndUser();
      const attList = await getUserAttempts(creds, quiz.id, userId);
      set((s) => ({ attempts: { ...s.attempts, [quiz.id]: attList } }));

      const inProgress = attList.find((a) => a.state === 'inprogress');
      if (inProgress) {
        const questions = await getAttemptSummary(creds, inProgress.id, inProgress.uniqueid);
        // Restore already-saved answers from question states
        const restoredAnswers: Record<number, string> = {};
        questions.forEach((q) => {
          if (q.selectedValue !== null) restoredAnswers[q.slot] = q.selectedValue;
        });
        set({ activeAttempt: inProgress, questions, answers: restoredAnswers });
      }
    } finally {
      set({ isLoadingAttempt: false });
    }
  },

  startAttempt: async (quiz) => {
    set({ isLoadingAttempt: true });
    try {
      const { creds, userId } = await getCredAndUser();
      await viewQuiz(creds, quiz.id);
      const attempt = await apiStartAttempt(creds, quiz.id);
      const questions = await getAttemptSummary(creds, attempt.id, attempt.uniqueid);
      const updatedAttempts = await getUserAttempts(creds, quiz.id, userId);
      set((s) => ({
        activeAttempt: attempt,
        questions,
        answers: {},
        attempts: { ...s.attempts, [quiz.id]: updatedAttempts },
      }));
    } finally {
      set({ isLoadingAttempt: false });
    }
  },

  setAnswer: (slot, value) => {
    set((s) => ({
      answers: { ...s.answers, [slot]: value },
      // Update selectedValue on the question for derived reads
      questions: s.questions.map((q) =>
        q.slot === slot ? { ...q, selectedValue: value, state: 'answersaved' } : q,
      ),
    }));
  },

  saveProgress: async () => {
    const { activeAttempt, questions, answers } = get();
    if (!activeAttempt) return;
    set({ isSaving: true });
    try {
      const creds = await getMoodleCredentials();
      if (!creds) return;
      const data = buildAnswerData(questions, answers);
      await apiSaveAttempt(creds, activeAttempt.id, data);
      // Refresh sequencechecks after save
      const updated = await getAttemptSummary(creds, activeAttempt.id, activeAttempt.uniqueid);
      set({ questions: updated });
    } finally {
      set({ isSaving: false });
    }
  },

  submitAttempt: async () => {
    const { activeAttempt, activeQuiz, questions, answers } = get();
    if (!activeAttempt || !activeQuiz) throw new Error('No active attempt');
    set({ isSubmitting: true });
    try {
      const { creds, userId } = await getCredAndUser();
      const data = buildAnswerData(questions, answers);
      await apiSubmitAttempt(creds, activeAttempt.id, data);
      const [attList, grade] = await Promise.all([
        getUserAttempts(creds, activeQuiz.id, userId),
        getUserBestGrade(creds, activeQuiz.id, userId),
      ]);
      set((s) => ({
        attempts: { ...s.attempts, [activeQuiz.id]: attList },
        bestGrades: { ...s.bestGrades, [activeQuiz.id]: grade },
        activeAttempt: attList.find((a) => a.id === activeAttempt.id) ?? activeAttempt,
      }));
    } finally {
      set({ isSubmitting: false });
    }
  },

  clearAttempt: () => {
    set({ activeQuiz: null, activeAttempt: null, questions: [], answers: {} });
  },

  getAttemptsForQuiz: (quizId) => get().attempts[quizId] ?? [],

  canAttempt: (quiz) => {
    const attList = get().attempts[quiz.id] ?? [];
    const finishedCount = attList.filter((a) => a.state === 'finished').length;
    const isOpen = !quiz.timeclose || quiz.timeclose * 1000 > Date.now();
    const hasSlots = quiz.attempts === 0 || finishedCount < quiz.attempts;
    return isOpen && hasSlots;
  },

  hasInProgress: (quizId) => {
    return (get().attempts[quizId] ?? []).find((a) => a.state === 'inprogress');
  },
}));

function buildAnswerData(
  questions: ParsedQuestion[],
  answers: Record<number, string>,
): Array<{ name: string; value: string }> {
  const data: Array<{ name: string; value: string }> = [];
  questions.forEach((q) => {
    const val = answers[q.slot];
    if (val !== undefined) {
      data.push({ name: q.inputName, value: val });
    }
    data.push({ name: q.seqName, value: q.seqValue });
  });
  return data;
}
