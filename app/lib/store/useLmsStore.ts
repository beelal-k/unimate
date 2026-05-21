import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { db } from '../db/client';
import { enqueueSync } from '../db/sync';
import { saveSetting } from '../db/settings';
import { lmsItems, settings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import {
  getMoodleCredentials,
  saveMoodleCredentials,
  clearMoodleCredentials,
  loginToMoodle,
  getCourses,
  getAssignments,
  getSiteInfo,
  type MoodleCourse,
} from '../api/moodle';

function getNotifications() {
  try {
    return require('../notifications') as typeof import('../notifications');
  } catch {
    return null;
  }
}

export interface LmsAttachment {
  filename: string;
  fileurl: string;
  filesize: number;
  mimetype: string;
}

export interface LmsItem {
  id: string;
  moodleId: number | null;
  courseId: number | null;
  courseName: string;
  type: 'assignment' | 'resource' | 'quiz' | 'grade';
  title: string;
  description: string | null;
  dueDate: string | null;
  grade: string | null;
  maxGrade: string | null;
  status: 'upcoming' | 'overdue' | 'submitted' | 'graded';
  isDone: boolean;
  reminderSettings: string | null;
  attachments: LmsAttachment[];
  syncedAt: string;
}

interface LmsState {
  items: LmsItem[];
  courses: MoodleCourse[];
  isLoading: boolean;
  isSyncing: boolean;
  isConnected: boolean;
  lastSyncAt: string | null;
  manuallyPinnedCourseIds: string[];
  manuallyDisabledCourseIds: string[];
  courseCategories: Record<string, 'active' | 'archived'>;

  setLoading: (loading: boolean) => void;
  loadItems: () => Promise<void>;
  checkConnection: () => Promise<boolean>;
  connectMoodle: (siteUrl: string, username: string, password: string) => Promise<void>;
  disconnectMoodle: () => Promise<void>;
  syncFromMoodle: () => Promise<void>;
  toggleCoursePin: (courseId: number) => Promise<void>;
  toggleCourseDisable: (courseId: number) => Promise<void>;
  isCourseEnabled: (courseId: number) => boolean;
  getUpcomingAssignments: () => LmsItem[];
  getOverdueAssignments: () => LmsItem[];
  getCompletedAssignments: () => LmsItem[];
  getArchivedCourseItems: () => Record<string, LmsItem[]>;
  toggleItemDone: (itemId: string, isDone: boolean) => Promise<void>;
  updateReminderSettings: (itemId: string, settings: string | null) => Promise<void>;
}

function computeStatus(dueDate: number | null): 'upcoming' | 'overdue' {
  if (!dueDate || dueDate === 0) return 'upcoming';
  return (dueDate * 1000) < Date.now() ? 'overdue' : 'upcoming';
}

export function getCurrentSemesterCode(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = String(now.getFullYear()).slice(-2);
  if (month >= 1 && month <= 5) return `SP${year}`;
  if (month >= 6 && month <= 7) return `SU${year}`;
  return `FA${year}`;
}

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export function categorizeCourse(
  course: MoodleCourse,
  manuallyPinnedIds: string[],
): 'active' | 'archived' {
  if (manuallyPinnedIds.includes(String(course.id))) return 'active';

  const code = getCurrentSemesterCode();
  const isCurrentSemester =
    course.shortname?.includes(code) || course.fullname?.includes(code);

  const start = course.startdate ?? 0;
  const isRecent = start === 0 || (Date.now() - start * 1000) < SIX_MONTHS_MS;

  return isCurrentSemester || isRecent ? 'active' : 'archived';
}

/** Whether an item is recent enough to display (within 85 days, or already submitted/graded). */
export function isAssignmentRelevant(dueDate: string | null, status: string): boolean {
  if (status === 'submitted' || status === 'graded') return true;
  if (!dueDate) return true;
  return new Date(dueDate).getTime() > Date.now() - 85 * 24 * 60 * 60 * 1000;
}

function rowToItem(row: typeof lmsItems.$inferSelect): LmsItem {
  let attachments: LmsAttachment[] = [];
  try {
    if (row.attachments) attachments = JSON.parse(row.attachments) as LmsAttachment[];
  } catch {}
  return {
    id: row.id,
    moodleId: row.moodleId,
    courseId: row.courseId,
    courseName: row.courseName || '',
    type: row.type as LmsItem['type'],
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    grade: row.grade,
    maxGrade: row.maxGrade,
    status: row.status as LmsItem['status'],
    isDone: Boolean(row.isDone),
    reminderSettings: row.reminderSettings,
    attachments,
    syncedAt: row.syncedAt,
  };
}

export const useLmsStore = create<LmsState>((set, get) => ({
  items: [],
  courses: [],
  isLoading: false,
  isSyncing: false,
  isConnected: false,
  lastSyncAt: null,
  manuallyPinnedCourseIds: [],
  manuallyDisabledCourseIds: [],
  courseCategories: {},

  setLoading: (loading) => set({ isLoading: loading }),

  loadItems: async () => {
    try {
      set({ isLoading: true });
      const rows = await db.select().from(lmsItems);
      const settingsRows = await db.select().from(settings);

      let pinnedIds: string[] = [];
      let disabledIds: string[] = [];
      let cats: Record<string, 'active' | 'archived'> = {};

      for (const r of settingsRows) {
        try {
          if (r.key === 'manuallyPinnedCourseIds') pinnedIds = JSON.parse(r.value) as string[];
          if (r.key === 'manuallyDisabledCourseIds') disabledIds = JSON.parse(r.value) as string[];
          if (r.key === 'courseCategories') cats = JSON.parse(r.value) as Record<string, 'active' | 'archived'>;
        } catch {}
      }

      set({
        items: rows.map(rowToItem),
        manuallyPinnedCourseIds: pinnedIds,
        manuallyDisabledCourseIds: disabledIds,
        courseCategories: cats,
        isLoading: false,
      });
    } catch (err) {
      console.error('[LMS] Failed to load items:', err);
      set({ isLoading: false });
    }
  },

  checkConnection: async () => {
    const creds = await getMoodleCredentials();
    const connected = !!creds;
    set({ isConnected: connected });
    return connected;
  },

  connectMoodle: async (siteUrl, username, password) => {
    set({ isLoading: true });
    try {
      const token = await loginToMoodle(siteUrl, username, password);
      await saveMoodleCredentials(siteUrl, token);
      set({ isConnected: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  disconnectMoodle: async () => {
    await clearMoodleCredentials();
    set({ isConnected: false });
  },

  syncFromMoodle: async () => {
    const creds = await getMoodleCredentials();
    if (!creds) throw new Error('Not connected to Moodle');

    set({ isSyncing: true });

    try {
      const siteInfo = await getSiteInfo(creds);
      const courses = await getCourses(creds, siteInfo.userid);
      set({ courses });

      const { manuallyPinnedCourseIds } = get();
      const newCourseCategories: Record<string, 'active' | 'archived'> = {};
      for (const c of courses) {
        newCourseCategories[String(c.id)] = categorizeCourse(c, manuallyPinnedCourseIds);
      }
      set({ courseCategories: newCourseCategories });

      const now = new Date().toISOString();
      const userId = (await SecureStore.getItemAsync('user_id')) || 'unknown';

      await saveSetting('courseCategories', JSON.stringify(newCourseCategories));
      await saveSetting('lastSyncedAt', now);

      const courseIds = courses.map((c) => c.id);
      const assignments = courseIds.length > 0 ? await getAssignments(creds, courseIds) : [];
      const courseNameMap = new Map(courses.map((c) => [c.id, c.fullname || c.shortname]));

      const isFirstSync = get().items.length === 0;
      const newToNotify: { title: string; courseName: string; courseId: number; lmsItemId: string }[] = [];

      for (const a of assignments) {
        const existing = get().items.find((i) => i.moodleId === a.id && i.type === 'assignment');
        const status = computeStatus(a.duedate);
        const dueDate = a.duedate ? new Date(a.duedate * 1000).toISOString() : null;
        const courseName = courseNameMap.get(a.course) || '';

        const attachments: LmsAttachment[] = (a.introattachments ?? []).map((att) => ({
          filename: att.filename,
          fileurl: att.fileurl.includes('token=')
            ? att.fileurl
            : `${att.fileurl}${att.fileurl.includes('?') ? '&' : '?'}token=${creds.token}`,
          filesize: att.filesize,
          mimetype: att.mimetype,
        }));

        const description = a.intro?.replace(/<[^>]*>/g, '') || null;
        const maxGrade = a.grade?.toString() || null;
        const attachmentsJson = JSON.stringify(attachments);

        if (existing) {
          await db.update(lmsItems).set({
            title: a.name,
            description,
            dueDate,
            maxGrade,
            status,
            courseName,
            attachments: attachmentsJson,
            syncedAt: now,
          }).where(eq(lmsItems.id, existing.id));
        } else {
          const id = randomUUID();
          await db.insert(lmsItems).values({
            id,
            userId,
            moodleId: a.id,
            courseId: a.course,
            courseName,
            type: 'assignment',
            title: a.name,
            description,
            dueDate,
            grade: null,
            maxGrade,
            status,
            isDone: false,
            reminderSettings: null,
            attachments: attachmentsJson,
            syncedAt: now,
          });

          if (!isFirstSync && status === 'upcoming') {
            newToNotify.push({ title: a.name, courseName, courseId: a.course, lmsItemId: id });
          }
        }
      }

      const updatedRows = await db.select().from(lmsItems);
      const mappedItems = updatedRows.map(rowToItem);

      try {
        const { isCourseEnabled } = get();
        for (const item of mappedItems) {
          if (item.type === 'assignment' && item.status === 'upcoming' && item.dueDate) {
            if (!item.courseId || (isCourseEnabled(item.courseId) && isAssignmentRelevant(item.dueDate, item.status))) {
              getNotifications()
                ?.scheduleAssignmentReminders(item.id, item.title, item.courseId ?? undefined, item.courseName, item.dueDate)
                .catch(() => {});
            }
          }
        }
        for (const n of newToNotify) {
          if (get().isCourseEnabled(n.courseId)) {
            getNotifications()
              ?.notifyNewAssignment(n.title, n.courseName, n.courseId, n.lmsItemId)
              .catch(() => {});
          }
        }
      } catch (err) {
        console.warn('[LMS] Notification scheduling failed:', err);
      }

      set({ items: mappedItems, isSyncing: false, lastSyncAt: now });
    } catch (err) {
      set({ isSyncing: false });
      throw err;
    }
  },

  isCourseEnabled: (courseId) => {
    const { courseCategories, manuallyDisabledCourseIds, manuallyPinnedCourseIds } = get();
    const id = String(courseId);
    if (courseCategories[id] === 'archived') {
      return manuallyPinnedCourseIds.includes(id);
    }
    return !manuallyDisabledCourseIds.includes(id);
  },

  toggleCoursePin: async (courseId) => {
    try {
      const id = String(courseId);
      const current = get().manuallyPinnedCourseIds;
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      set({ manuallyPinnedCourseIds: next });
      await saveSetting('manuallyPinnedCourseIds', JSON.stringify(next));
    } catch (err) {
      console.error('[LMS] Failed to save pinned courses:', err);
    }
  },

  toggleCourseDisable: async (courseId) => {
    try {
      const id = String(courseId);
      const current = get().manuallyDisabledCourseIds;
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      set({ manuallyDisabledCourseIds: next });
      await saveSetting('manuallyDisabledCourseIds', JSON.stringify(next));
    } catch (err) {
      console.error('[LMS] Failed to save disabled courses:', err);
    }
  },

  getUpcomingAssignments: () => {
    const { isCourseEnabled } = get();
    return get()
      .items.filter(
        (i) =>
          i.type === 'assignment' &&
          !i.isDone &&
          i.status === 'upcoming' &&
          (!i.courseId || isCourseEnabled(i.courseId)) &&
          isAssignmentRelevant(i.dueDate, i.status),
      )
      .sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  },

  getOverdueAssignments: () => {
    const { isCourseEnabled } = get();
    return get()
      .items.filter(
        (i) =>
          i.type === 'assignment' &&
          !i.isDone &&
          i.status === 'overdue' &&
          (!i.courseId || isCourseEnabled(i.courseId)) &&
          isAssignmentRelevant(i.dueDate, i.status),
      )
      .sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
      });
  },

  getCompletedAssignments: () => {
    const { isCourseEnabled } = get();
    return get().items.filter(
      (i) =>
        i.type === 'assignment' &&
        (i.isDone || i.status === 'submitted' || i.status === 'graded') &&
        (!i.courseId || isCourseEnabled(i.courseId)),
    );
  },

  getArchivedCourseItems: () => {
    const { courseCategories, items, isCourseEnabled } = get();
    const grouped: Record<string, LmsItem[]> = {};

    for (const item of items) {
      if (!item.courseId) continue;
      const id = String(item.courseId);
      if (courseCategories[id] === 'archived' && !isCourseEnabled(item.courseId)) {
        (grouped[item.courseName] ??= []).push(item);
      }
    }

    for (const key of Object.keys(grouped)) {
      grouped[key] = grouped[key]
        .sort((a, b) => new Date(b.syncedAt).getTime() - new Date(a.syncedAt).getTime())
        .slice(0, 5);
    }

    return grouped;
  },

  toggleItemDone: async (itemId, isDone) => {
    set((state) => ({
      items: state.items.map((i) => (i.id === itemId ? { ...i, isDone } : i)),
    }));

    try {
      await db.update(lmsItems).set({ isDone }).where(eq(lmsItems.id, itemId));

      // Also update the assignments table if the item originated from there
      try {
        const { assignments } = await import('../db/schema');
        await db.update(assignments).set({ isDone }).where(eq(assignments.id, itemId));
      } catch {}

      const item = get().items.find((i) => i.id === itemId);
      if (isDone) {
        await getNotifications()?.cancelAssignmentReminders(itemId);
      } else if (item?.dueDate) {
        await getNotifications()?.scheduleAssignmentReminders(
          item.id, item.title, item.courseId ?? undefined, item.courseName, item.dueDate,
        );
      }
    } catch (err) {
      console.error('[LMS] Failed to toggle done status:', err);
      // Revert optimistic update
      set((state) => ({
        items: state.items.map((i) => (i.id === itemId ? { ...i, isDone: !isDone } : i)),
      }));
    }
  },

  updateReminderSettings: async (itemId, reminderSettings) => {
    set((state) => ({
      items: state.items.map((i) => (i.id === itemId ? { ...i, reminderSettings } : i)),
    }));

    try {
      await db.update(lmsItems).set({ reminderSettings }).where(eq(lmsItems.id, itemId));

      try {
        const { assignments } = await import('../db/schema');
        await db.update(assignments).set({ reminderSettings }).where(eq(assignments.id, itemId));
      } catch {}

      const item = get().items.find((i) => i.id === itemId);
      if (item?.dueDate && !item.isDone) {
        await getNotifications()?.scheduleAssignmentReminders(
          item.id, item.title, item.courseId ?? undefined, item.courseName, item.dueDate,
        );
      }
    } catch (err) {
      console.error('[LMS] Failed to update reminder settings:', err);
    }
  },
}));
