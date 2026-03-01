// lib/store/useScheduleStore.ts
// Schedule store wired to SQLite for class CRUD + notifications

import { create } from 'zustand';
import { db } from '../db/client';
import { classes } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

// Lazy-load notifications to prevent import-time crashes
function getNotifications() {
  try {
    return require('../notifications') as {
      scheduleClassReminders: (cls: any) => Promise<void>;
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
}

// Convert DB row to ClassItem
function rowToClassItem(row: typeof classes.$inferSelect): ClassItem {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
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
      const rows = await db.select().from(classes);
      const items = rows.map(rowToClassItem);
      set({ classes: items, isLoading: false });
    } catch (error) {
      console.error('[Schedule] Failed to load classes:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  addClass: async (data) => {
    const id = randomUUID();
    const now = new Date().toISOString();

    const classItem: ClassItem = {
      ...data,
      id,
      createdAt: now,
    };

    try {
      await db.insert(classes).values({
        id,
        name: data.name,
        code: data.code,
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
      });

      set((state) => ({ classes: [...state.classes, classItem] }));

      // Schedule notifications
      await getNotifications()?.scheduleClassReminders(classItem).catch(console.error);

      return classItem;
    } catch (error) {
      console.error('[Schedule] Failed to add class:', error);
      throw error;
    }
  },

  updateClass: async (id, data) => {
    try {
      const updateValues: Record<string, unknown> = {};
      if (data.name !== undefined) updateValues.name = data.name;
      if (data.code !== undefined) updateValues.code = data.code;
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
        classes: state.classes.map((c) =>
          c.id === id ? { ...c, ...data } : c
        ),
      }));

      // Re-schedule notifications with updated data
      const updatedClass = get().classes.find((c) => c.id === id);
      if (updatedClass) {
        await getNotifications()?.scheduleClassReminders(updatedClass).catch(console.error);
      }
    } catch (error) {
      console.error('[Schedule] Failed to update class:', error);
      throw error;
    }
  },

  deleteClass: async (id) => {
    try {
      await getNotifications()?.cancelClassReminders(id).catch(console.error);
      await db.delete(classes).where(eq(classes.id, id));
      set((state) => ({ classes: state.classes.filter((c) => c.id !== id) }));
    } catch (error) {
      console.error('[Schedule] Failed to delete class:', error);
      throw error;
    }
  },
}));
