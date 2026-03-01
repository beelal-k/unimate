// lib/store/useLmsStore.ts
// LMS store with Moodle sync, SQLite persistence, assignment tracking, attachments

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { db } from '../db/client';
import { lmsItems } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import {
  getMoodleCredentials,
  saveMoodleCredentials,
  clearMoodleCredentials,
  loginToMoodle,
  getSiteInfo,
  getCourses,
  getAssignments,
  type MoodleCourse,
  type MoodleAttachment,
} from '../api/moodle';

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
  hiddenCourseIds: number[];

  setLoading: (loading: boolean) => void;
  loadItems: () => Promise<void>;
  checkConnection: () => Promise<boolean>;
  connectMoodle: (siteUrl: string, username: string, password: string) => Promise<void>;
  disconnectMoodle: () => Promise<void>;
  syncFromMoodle: () => Promise<void>;
  toggleCourseVisibility: (courseId: number) => Promise<void>;
  getUpcomingAssignments: () => LmsItem[];
  getOverdueAssignments: () => LmsItem[];
  getCompletedAssignments: () => LmsItem[];
}

function computeStatus(dueDate: number | null): 'upcoming' | 'overdue' | 'submitted' {
  if (!dueDate || dueDate === 0) return 'upcoming';
  const now = Date.now() / 1000;
  return dueDate < now ? 'overdue' : 'upcoming';
}

function rowToItem(row: typeof lmsItems.$inferSelect): LmsItem {
  let attachments: LmsAttachment[] = [];
  try {
    if (row.attachments) attachments = JSON.parse(row.attachments);
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
  hiddenCourseIds: [],

  setLoading: (loading) => set({ isLoading: loading }),

  loadItems: async () => {
    try {
      set({ isLoading: true });
      const rows = await db.select().from(lmsItems);
      
      let hiddenIds: number[] = [];
      try {
        const stored = await SecureStore.getItemAsync('moodle_hidden_courses');
        if (stored) hiddenIds = JSON.parse(stored);
      } catch (err) {}
      
      set({ items: rows.map(rowToItem), hiddenCourseIds: hiddenIds, isLoading: false });
    } catch (error) {
      console.error('[LMS] Failed to load items:', error);
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
    try {
      set({ isLoading: true });
      const token = await loginToMoodle(siteUrl, username, password);
      await saveMoodleCredentials(siteUrl, token);
      set({ isConnected: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  disconnectMoodle: async () => {
    await clearMoodleCredentials();
    set({ isConnected: false, courses: [], items: [], lastSyncAt: null });
  },

  syncFromMoodle: async () => {
    const creds = await getMoodleCredentials();
    if (!creds) throw new Error('Not connected to Moodle');

    try {
      set({ isSyncing: true });
      const siteInfo = await getSiteInfo(creds);
      const courses = await getCourses(creds, siteInfo.userid);
      set({ courses });

      const courseIds = courses.map((c) => c.id);
      const assignments = courseIds.length > 0
        ? await getAssignments(creds, courseIds)
        : [];

      const now = new Date().toISOString();
      const courseNameMap = new Map(courses.map((c) => [c.id, c.fullname || c.shortname]));

      for (const a of assignments) {
        const existing = get().items.find((i) => i.moodleId === a.id && i.type === 'assignment');
        const status = computeStatus(a.duedate);
        const dueDate = a.duedate ? new Date(a.duedate * 1000).toISOString() : null;
        const courseName = courseNameMap.get(a.course) || '';

        // Convert Moodle attachments, appending token for download
        const attachments: LmsAttachment[] = (a.introattachments || []).map((att) => ({
          filename: att.filename,
          fileurl: att.fileurl.includes('token=') ? att.fileurl : `${att.fileurl}${att.fileurl.includes('?') ? '&' : '?'}token=${creds.token}`,
          filesize: att.filesize,
          mimetype: att.mimetype,
        }));

        if (existing) {
          await db.update(lmsItems).set({
            title: a.name,
            description: a.intro?.replace(/<[^>]*>/g, '') || null,
            dueDate,
            maxGrade: a.grade?.toString() || null,
            status,
            courseName,
            attachments: JSON.stringify(attachments),
            syncedAt: now,
          }).where(eq(lmsItems.id, existing.id));
        } else {
          const id = randomUUID();
          await db.insert(lmsItems).values({
            id,
            moodleId: a.id,
            courseId: a.course,
            courseName,
            type: 'assignment',
            title: a.name,
            description: a.intro?.replace(/<[^>]*>/g, '') || null,
            dueDate,
            grade: null,
            maxGrade: a.grade?.toString() || null,
            status,
            attachments: JSON.stringify(attachments),
            syncedAt: now,
          });
        }
      }

      const rows = await db.select().from(lmsItems);
      const mappedItems = rows.map(rowToItem);

      // Schedule notifications for upcoming assignments (lazy import to avoid module crash)
      try {
        const { scheduleAssignmentReminders } = await import('../notifications');
        for (const item of mappedItems) {
          if (item.type === 'assignment' && item.status === 'upcoming' && item.dueDate) {
            scheduleAssignmentReminders(item.id, item.title, item.courseName, item.dueDate).catch(() => {});
          }
        }
      } catch {
        // Notifications not available, skip
      }

      set({
        items: mappedItems,
        isSyncing: false,
        lastSyncAt: now,
      });
    } catch (error) {
      set({ isSyncing: false });
      console.error('[LMS] Sync failed:', error);
      throw error;
    }
  },

  toggleCourseVisibility: async (courseId: number) => {
    try {
      const current = get().hiddenCourseIds;
      const filtered = current.includes(courseId)
        ? current.filter(id => id !== courseId)
        : [...current, courseId];
      
      // Update state before saving for instant UI feedback
      set({ hiddenCourseIds: filtered });
      await SecureStore.setItemAsync('moodle_hidden_courses', JSON.stringify(filtered));
    } catch (err) {
      console.error('[LMS] Failed to save hidden courses:', err);
    }
  },

  getUpcomingAssignments: () => {
    const hidden = get().hiddenCourseIds;
    return get().items
      .filter((i) => i.type === 'assignment' && i.status === 'upcoming' && (!i.courseId || !hidden.includes(i.courseId)))
      .sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  },

  getOverdueAssignments: () => {
    const hidden = get().hiddenCourseIds;
    return get().items
      .filter((i) => i.type === 'assignment' && i.status === 'overdue' && (!i.courseId || !hidden.includes(i.courseId)))
      .sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
      });
  },

  getCompletedAssignments: () => {
    const hidden = get().hiddenCourseIds;
    return get().items
      .filter((i) => i.type === 'assignment' && (i.status === 'submitted' || i.status === 'graded') && (!i.courseId || !hidden.includes(i.courseId)));
  },
}));
