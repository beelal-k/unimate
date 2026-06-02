import { create } from 'zustand';
import { getUserId } from '../session';
import { db } from '../db/client';
import { enqueueSync } from '../db/sync';
import { saveSetting, readSetting } from '../db/settings';
import { lmsItems } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import {
  getMoodleCredentials,
  saveMoodleCredentials,
  clearMoodleCredentials,
  loginToMoodle,
  getCourses,
  getAssignments,
  getGrades,
  getSiteInfo,
  getSubmissionStatus,
  type SubmissionConfig,
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
  type?: 'file' | 'link';
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
  submissionConfig: SubmissionConfig | null;
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
  markAsSubmitted: (itemId: string) => Promise<void>;
  markAsUnsubmitted: (itemId: string) => Promise<void>;
}

function computeStatus(
  dueDate: number | null,
  moodleSubmissionStatus?: string,
): 'upcoming' | 'overdue' | 'submitted' {
  if (moodleSubmissionStatus === 'submitted' || moodleSubmissionStatus === 'reopened') {
    return 'submitted';
  }
  if (!dueDate || dueDate === 0) return 'upcoming';
  return (dueDate * 1000) < Date.now() ? 'overdue' : 'upcoming';
}

function extractLinksFromHtml(html: string): LmsAttachment[] {
  const links: LmsAttachment[] = [];
  const regex = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = match[1].trim();
    const label = match[2].replace(/<[^>]*>/g, '').trim();
    if (!url || url.startsWith('javascript:')) continue;
    links.push({ filename: label || url, fileurl: url, filesize: 0, mimetype: 'link', type: 'link' });
  }
  return links;
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
  let submissionConfig: SubmissionConfig | null = null;
  try {
    if (row.attachments) attachments = JSON.parse(row.attachments) as LmsAttachment[];
  } catch {}
  try {
    if ((row as any).submissionConfig) submissionConfig = JSON.parse((row as any).submissionConfig) as SubmissionConfig;
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
    submissionConfig,
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
      const [rows, pinnedStr, disabledStr, catsStr] = await Promise.all([
        db.select().from(lmsItems),
        readSetting('manuallyPinnedCourseIds'),
        readSetting('manuallyDisabledCourseIds'),
        readSetting('courseCategories'),
      ]);

      let pinnedIds: string[] = [];
      let disabledIds: string[] = [];
      let cats: Record<string, 'active' | 'archived'> = {};
      try { if (pinnedStr) pinnedIds = JSON.parse(pinnedStr) as string[]; } catch {}
      try { if (disabledStr) disabledIds = JSON.parse(disabledStr) as string[]; } catch {}
      try { if (catsStr) cats = JSON.parse(catsStr) as Record<string, 'active' | 'archived'>; } catch {}

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
      const userId = (await getUserId()) || 'unknown';

      await saveSetting('courseCategories', JSON.stringify(newCourseCategories));
      await saveSetting('lastSyncedAt', now);

      const courseIds = courses.map((c) => c.id);
      const assignments = courseIds.length > 0 ? await getAssignments(creds, courseIds) : [];
      const courseNameMap = new Map(courses.map((c) => [c.id, c.fullname || c.shortname]));

      // Fetch submission status + grades for all assignments/courses in parallel.
      const [submissionResults, gradeResults] = await Promise.all([
        Promise.allSettled(assignments.map((a) => getSubmissionStatus(creds, a.id))),
        Promise.allSettled(courses.map((c) => getGrades(creds, c.id, siteInfo.userid))),
      ]);

      const submissionStatusMap = new Map<number, string>();
      assignments.forEach((a, i) => {
        const result = submissionResults[i];
        if (result.status === 'fulfilled') {
          const moodleStatus = result.value.lastattempt?.submission?.status;
          if (moodleStatus) submissionStatusMap.set(a.id, moodleStatus);
        }
      });

      // Build grade map: "courseId:assignmentName" -> {graderaw, grademax}
      const gradeMap = new Map<string, { grade: string | null; maxGrade: string }>();
      courses.forEach((c, i) => {
        const result = gradeResults[i];
        if (result.status === 'fulfilled') {
          for (const g of result.value) {
            if (g.itemname) {
              gradeMap.set(`${c.id}:${g.itemname}`, {
                grade: g.graderaw !== null && g.graderaw !== undefined ? String(Math.round(g.graderaw * 100) / 100) : null,
                maxGrade: String(g.grademax),
              });
            }
          }
        }
      });

      const isFirstSync = get().items.length === 0;
      const newToNotify: { title: string; courseName: string; courseId: number; lmsItemId: string }[] = [];

      for (const a of assignments) {
        const existing = get().items.find((i) => i.moodleId === a.id && i.type === 'assignment');
        const moodleSubmissionStatus = submissionStatusMap.get(a.id);
        const status = computeStatus(a.duedate, moodleSubmissionStatus);
        const dueDate = a.duedate ? new Date(a.duedate * 1000).toISOString() : null;
        const courseName = courseNameMap.get(a.course) || '';

        const fileAttachments: LmsAttachment[] = (a.introattachments ?? []).map((att) => ({
          filename: att.filename,
          fileurl: att.fileurl.includes('token=')
            ? att.fileurl
            : `${att.fileurl}${att.fileurl.includes('?') ? '&' : '?'}token=${creds.token}`,
          filesize: att.filesize,
          mimetype: att.mimetype,
          type: 'file' as const,
        }));
        const linkAttachments = a.intro ? extractLinksFromHtml(a.intro) : [];
        const attachments: LmsAttachment[] = [...fileAttachments, ...linkAttachments];

        const description = a.intro?.replace(/<[^>]*>/g, '') || null;
        const attachmentsJson = JSON.stringify(attachments);

        // Parse file submission config from assignment configs
        const fileConfigs = (a.configs ?? []).filter((c) => c.plugin === 'file' && c.subtype === 'assignsubmission');
        const isFileEnabled = fileConfigs.find((c) => c.name === 'enabled')?.value === '1';
        const submissionConfig: SubmissionConfig | null = isFileEnabled ? {
          maxFiles: parseInt(fileConfigs.find((c) => c.name === 'maxfilesubmissions')?.value ?? '1'),
          maxSizeBytes: parseInt(fileConfigs.find((c) => c.name === 'maxsubmissionsizebytes')?.value ?? '0'),
          allowedTypes: (fileConfigs.find((c) => c.name === 'filetypeslist')?.value ?? '')
            .split(',').map((s) => s.trim()).filter(Boolean),
        } : null;
        const submissionConfigJson = submissionConfig ? JSON.stringify(submissionConfig) : null;

        // Grade info for this assignment (matched by name)
        const gradeKey = `${a.course}:${a.name}`;
        const gradeInfo = gradeMap.get(gradeKey);
        const maxGrade = gradeInfo?.maxGrade ?? a.grade?.toString() ?? null;
        const gradeValue = gradeInfo?.grade ?? null;

        // Determine final status — trust fresh Moodle data; only preserve local state if API failed
        const hasFreshData = submissionStatusMap.has(a.id);
        let finalStatus: 'upcoming' | 'overdue' | 'submitted' | 'graded' = hasFreshData
          ? status
          : (existing?.status === 'submitted' || existing?.status === 'graded')
            ? existing.status
            : status;
        // If there's a real grade, promote to graded
        if (gradeValue !== null) finalStatus = 'graded';

        if (existing) {
          await db.update(lmsItems).set({
            title: a.name,
            description,
            dueDate,
            grade: gradeValue ?? existing.grade,
            maxGrade,
            status: finalStatus,
            courseName,
            attachments: attachmentsJson,
            submissionConfig: submissionConfigJson,
            syncedAt: now,
          } as any).where(eq(lmsItems.id, existing.id));
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
            grade: gradeValue,
            maxGrade,
            status: finalStatus,
            isDone: false,
            reminderSettings: null,
            attachments: attachmentsJson,
            submissionConfig: submissionConfigJson,
            syncedAt: now,
          } as any);

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

  markAsSubmitted: async (itemId) => {
    set((state) => ({
      items: state.items.map((i) => (i.id === itemId ? { ...i, status: 'submitted' } : i)),
    }));
    try {
      await db.update(lmsItems).set({ status: 'submitted' }).where(eq(lmsItems.id, itemId));
    } catch (err) {
      console.error('[LMS] Failed to persist submitted status:', err);
    }
  },

  markAsUnsubmitted: async (itemId) => {
    const item = get().items.find((i) => i.id === itemId);
    if (!item) return;
    const newStatus = computeStatus(
      item.dueDate ? Math.floor(new Date(item.dueDate).getTime() / 1000) : null,
      undefined,
    );
    set((state) => ({
      items: state.items.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i)),
    }));
    try {
      await db.update(lmsItems).set({ status: newStatus }).where(eq(lmsItems.id, itemId));
    } catch (err) {
      console.error('[LMS] Failed to persist unsubmitted status:', err);
    }
  },

  updateReminderSettings: async (itemId, reminderSettings) => {
    set((state) => ({
      items: state.items.map((i) => (i.id === itemId ? { ...i, reminderSettings } : i)),
    }));

    try {
      await db.update(lmsItems).set({ reminderSettings }).where(eq(lmsItems.id, itemId));

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
