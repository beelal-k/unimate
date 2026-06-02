import { create } from 'zustand';
import { db } from '../db/client';
import { enqueueSync, pullFromTurso } from '../db/sync';
import { classes } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { getUserId } from '../session';

function getNotifications() {
  try {
    return require('../notifications') as {
      scheduleClassReminders: (cls: ClassItem) => Promise<void>;
      cancelClassReminders: (id: string) => Promise<void>;
    };
  } catch {
    return null;
  }
}

export interface ClassItem {
  id: string;
  name: string;
  code: string | null;
  section: string | null;
  room: string | null;
  instructor: string | null;
  color: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  notifyMinutesBefore: number;
  semesterStart: string | null;
  semesterEnd: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  ownerUserId?: string;
  ownerInitials?: string;
  sharedWith?: { userId: string; initials: string; bgColor?: string }[];
}

export function rowToClassItem(row: typeof classes.$inferSelect): ClassItem {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    section: row.section,
    room: row.room,
    instructor: row.instructor,
    color: row.color,
    daysOfWeek: JSON.parse(row.daysOfWeek || '[]'),
    startTime: row.startTime,
    endTime: row.endTime,
    notifyMinutesBefore: row.notifyMinutesBefore ?? 15,
    semesterStart: row.semesterStart,
    semesterEnd: row.semesterEnd,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ownerUserId: row.userId,
    ownerInitials: 'Me',
  };
}

interface ScheduleState {
  classes: ClassItem[];
  isLoading: boolean;
  viewMode: 'grid' | 'list';

  setLoading: (loading: boolean) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  loadClasses: () => Promise<void>;
  addClass: (data: Omit<ClassItem, 'id' | 'createdAt'>) => Promise<ClassItem>;
  updateClass: (id: string, data: Partial<Omit<ClassItem, 'id' | 'createdAt'>>) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  classes: [],
  isLoading: false,
  viewMode: 'grid',

  setLoading: (loading) => set({ isLoading: loading }),
  setViewMode: (mode) => set({ viewMode: mode }),

  loadClasses: async () => {
    try {
      set({ isLoading: true });
      const userId = await getUserId();
      if (!userId) { set({ isLoading: false }); return; }

      // If local DB is empty for this user, pull from Turso first to hydrate it.
      const localRows = await db.select().from(classes).where(eq(classes.userId, userId));
      if (localRows.length === 0) {
        await pullFromTurso(userId).catch((err) =>
          console.warn('[Schedule] Turso pull failed, showing empty state:', err),
        );
      }

      const rows = await db.select().from(classes).where(eq(classes.userId, userId));
      set({ classes: rows.map(rowToClassItem), isLoading: false });
    } catch (err) {
      console.error('[Schedule] Failed to load classes:', err);
      set({ isLoading: false });
      throw err;
    }
  },

  addClass: async (data) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const userId = await getUserId() || 'unknown';

    const payload = {
      id,
      userId,
      name: data.name,
      code: data.code,
      section: data.section,
      room: data.room,
      instructor: data.instructor,
      color: data.color,
      daysOfWeek: JSON.stringify(data.daysOfWeek),
      startTime: data.startTime,
      endTime: data.endTime,
      notifyMinutesBefore: data.notifyMinutesBefore,
      semesterStart: data.semesterStart,
      semesterEnd: data.semesterEnd,
      isActive: data.isActive,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert(classes).values(payload);

      const classItem: ClassItem = { ...data, id, createdAt: now };
      set((state) => ({ classes: [...state.classes, classItem] }));

      await enqueueSync('insert', 'classes', id, payload);
      await getNotifications()?.scheduleClassReminders(classItem).catch(console.error);

      return classItem;
    } catch (err) {
      console.error('[Schedule] Failed to add class:', err);
      throw err;
    }
  },

  updateClass: async (id, data) => {
    try {
      const updateValues: Record<string, unknown> = {};
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.code !== undefined) updateValues.code = data.code;
      if (data.section !== undefined) updateValues.section = data.section;
      if (data.room !== undefined) updateValues.room = data.room;
      if (data.instructor !== undefined) updateValues.instructor = data.instructor;
      if (data.color !== undefined) updateValues.color = data.color;
      if (data.daysOfWeek !== undefined) updateValues.daysOfWeek = JSON.stringify(data.daysOfWeek);
      if (data.startTime !== undefined) updateValues.startTime = data.startTime;
      if (data.endTime !== undefined) updateValues.endTime = data.endTime;
      if (data.notifyMinutesBefore !== undefined) updateValues.notifyMinutesBefore = data.notifyMinutesBefore;
      if (data.semesterStart !== undefined) updateValues.semesterStart = data.semesterStart;
      if (data.semesterEnd !== undefined) updateValues.semesterEnd = data.semesterEnd;
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;

      await db.update(classes).set(updateValues).where(eq(classes.id, id));
      set((state) => ({
        classes: state.classes.map((c) => (c.id === id ? { ...c, ...data } : c)),
      }));

      await enqueueSync('update', 'classes', id, updateValues as Record<string, string | number | boolean | null>);

      const updated = get().classes.find((c) => c.id === id);
      if (updated) {
        await getNotifications()?.scheduleClassReminders(updated).catch(console.error);
      }
    } catch (err) {
      console.error('[Schedule] Failed to update class:', err);
      throw err;
    }
  },

  deleteClass: async (id) => {
    try {
      await getNotifications()?.cancelClassReminders(id).catch(console.error);
      await db.delete(classes).where(eq(classes.id, id));
      set((state) => ({ classes: state.classes.filter((c) => c.id !== id) }));
      await enqueueSync('delete', 'classes', id, {});
    } catch (err) {
      console.error('[Schedule] Failed to delete class:', err);
      throw err;
    }
  },
}));

/** Merges and deduplicates classes from the current user and visible friends. */
export function mergeAndDeduplicateClasses(
  myClasses: ClassItem[],
  friendClassesMap: Map<string, ClassItem[]>,
  visibleFriendIds: Set<string>,
  friendsList: { userId: string; fullname: string }[],
  myInitials: string,
): ClassItem[] {
  const myItems = myClasses.map((c) => ({
    ...c,
    ownerUserId: 'me',
    ownerInitials: myInitials,
    sharedWith: [] as { userId: string; initials: string; bgColor?: string }[],
  }));

  const friendItems: ClassItem[] = [];
  for (const friend of friendsList) {
    if (!visibleFriendIds.has(friend.userId)) continue;
    const friendClasses = friendClassesMap.get(friend.userId) ?? [];
    const initials = friend.fullname
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'FR';
    for (const c of friendClasses) {
      friendItems.push({ ...c, ownerUserId: friend.userId, ownerInitials: initials, sharedWith: [] });
    }
  }

  const generateKey = (cls: ClassItem): string => {
    const id = cls.code ? cls.code.toLowerCase().trim() : cls.name.toLowerCase().trim();
    const section = cls.section?.toLowerCase().trim() ?? '';
    const days = [...cls.daysOfWeek].sort((a, b) => a - b).join(',');
    return `${id}|${section}|${cls.startTime}|${cls.endTime}|${days}`;
  };

  const deduplicated = new Map<string, ClassItem>();

  for (const item of [...myItems, ...friendItems]) {
    const key = generateKey(item);
    const existing = deduplicated.get(key);

    if (!existing) {
      deduplicated.set(key, item);
      continue;
    }

    if (!existing.sharedWith) existing.sharedWith = [];

    if (item.ownerUserId === 'me') {
      // Current user's copy takes ownership
      const prevOwner = existing.ownerUserId;
      const prevInitials = existing.ownerInitials;
      existing.ownerUserId = 'me';
      existing.ownerInitials = myInitials;
      if (prevOwner && prevOwner !== 'me' && !existing.sharedWith.some((s) => s.userId === prevOwner)) {
        existing.sharedWith.push({ userId: prevOwner, initials: prevInitials! });
      }
    } else if (!existing.sharedWith.some((s) => s.userId === item.ownerUserId)) {
      existing.sharedWith.push({ userId: item.ownerUserId!, initials: item.ownerInitials! });
    }
  }

  return Array.from(deduplicated.values());
}
