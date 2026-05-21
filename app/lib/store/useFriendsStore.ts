import { create } from 'zustand';
import { queryTurso } from '../db/turso';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { db } from '../db/client';
import { classes } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { ClassItem } from './useScheduleStore';

// Friends are stored only in Turso — schedule sharing is inherently cross-user.

export interface ShareRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  fromFullname: string;
  toFullname: string;
  createdAt: string;
  updatedAt: string;
}

export interface Friend {
  shareId: string;
  userId: string;
  fullname: string;
}

type TursoRow = Record<string, string | number | boolean | null>;

function tursoRowToClassItem(row: TursoRow): ClassItem {
  return {
    id: row.id as string,
    name: row.name as string,
    code: (row.code as string | null) ?? null,
    section: (row.section as string | null) ?? null,
    room: (row.room as string | null) ?? null,
    instructor: (row.instructor as string | null) ?? null,
    color: (row.color as string) ?? '#0A0A0A',
    daysOfWeek:
      typeof row.daysOfWeek === 'string'
        ? (JSON.parse(row.daysOfWeek) as number[])
        : (row.daysOfWeek as number[]) ?? [],
    startTime: row.startTime as string,
    endTime: row.endTime as string,
    notifyMinutesBefore: (row.notifyMinutesBefore as number | null) ?? 15,
    semesterStart: (row.semesterStart as string | null) ?? null,
    semesterEnd: (row.semesterEnd as string | null) ?? null,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt as string,
    updatedAt: (row.updatedAt as string | undefined) ?? new Date().toISOString(),
    ownerUserId: row.userId as string,
  };
}

interface FriendsState {
  incoming: ShareRequest[];
  friends: Friend[];
  friendClasses: Map<string, ClassItem[]>;
  isLoading: boolean;
  visibleFriendIds: Set<string>;

  setLoading: (loading: boolean) => void;
  toggleFriendVisibility: (userId: string) => void;
  searchUser: (username: string) => Promise<{ id: string; fullname: string; username: string } | null>;
  sendRequest: (toUserId: string, toFullname: string) => Promise<void>;
  loadIncoming: () => Promise<void>;
  loadFriends: () => Promise<void>;
  acceptRequest: (shareId: string) => Promise<void>;
  rejectRequest: (shareId: string) => Promise<void>;
  unshare: (shareId: string) => Promise<void>;
  loadFriendClasses: (friendUserId: string) => Promise<void>;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  incoming: [],
  friends: [],
  friendClasses: new Map(),
  isLoading: false,
  visibleFriendIds: new Set(),

  setLoading: (loading) => set({ isLoading: loading }),

  toggleFriendVisibility: (userId) => {
    const next = new Set(get().visibleFriendIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
      if (!get().friendClasses.has(userId)) {
        get().loadFriendClasses(userId);
      }
    }
    set({ visibleFriendIds: next });
  },

  searchUser: async (username) => {
    try {
      const rows = await queryTurso(
        'SELECT id, fullname, username FROM users WHERE username = ?',
        [username],
      );
      if (rows.length === 0) return null;
      const row = rows[0] as TursoRow;
      return {
        id: row.id as string,
        fullname: row.fullname as string,
        username: row.username as string,
      };
    } catch (err) {
      console.error('[Friends] Search error:', err);
      throw err;
    }
  },

  sendRequest: async (toUserId, toFullname) => {
    const myId = await SecureStore.getItemAsync('user_id');
    const myName = (await SecureStore.getItemAsync('user_fullname')) || 'Unknown User';
    if (!myId) throw new Error('Not logged in');
    if (myId === toUserId) throw new Error('Cannot send a request to yourself');

    const now = new Date().toISOString();
    await queryTurso(
      `INSERT INTO scheduleShares (id, fromUserId, toUserId, status, fromFullname, toFullname, createdAt, updatedAt)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [randomUUID(), myId, toUserId, myName, toFullname, now, now],
    );
  },

  loadIncoming: async () => {
    const myId = await SecureStore.getItemAsync('user_id');
    if (!myId) return;

    try {
      set({ isLoading: true });
      const rows = await queryTurso(
        `SELECT * FROM scheduleShares WHERE toUserId = ? AND status = 'pending'`,
        [myId],
      );
      set({ incoming: rows as unknown as ShareRequest[], isLoading: false });
    } catch (err) {
      console.error('[Friends] Failed to load incoming requests:', err);
      set({ isLoading: false });
    }
  },

  loadFriends: async () => {
    const myId = await SecureStore.getItemAsync('user_id');
    if (!myId) return;

    try {
      set({ isLoading: true });
      const rows = await queryTurso(
        `SELECT * FROM scheduleShares WHERE status = 'accepted' AND (fromUserId = ? OR toUserId = ?)`,
        [myId, myId],
      );

      const friendsList: Friend[] = (rows as unknown as ShareRequest[]).map((r) => {
        const isFromMe = r.fromUserId === myId;
        return {
          shareId: r.id,
          userId: isFromMe ? r.toUserId : r.fromUserId,
          fullname: isFromMe ? r.toFullname : r.fromFullname,
        };
      });

      const visibleIds = new Set(friendsList.map((f) => f.userId));
      set({ friends: friendsList, visibleFriendIds: visibleIds, isLoading: false });

      await Promise.all(friendsList.map((f) => get().loadFriendClasses(f.userId)));
    } catch (err) {
      console.error('[Friends] Failed to load friends:', err);
      set({ isLoading: false });
    }
  },

  acceptRequest: async (shareId) => {
    const now = new Date().toISOString();
    await queryTurso(
      `UPDATE scheduleShares SET status = 'accepted', updatedAt = ? WHERE id = ?`,
      [now, shareId],
    );
    await get().loadIncoming();
    await get().loadFriends();
  },

  rejectRequest: async (shareId) => {
    const now = new Date().toISOString();
    await queryTurso(
      `UPDATE scheduleShares SET status = 'rejected', updatedAt = ? WHERE id = ?`,
      [now, shareId],
    );
    await get().loadIncoming();
  },

  unshare: async (shareId) => {
    await queryTurso(`DELETE FROM scheduleShares WHERE id = ?`, [shareId]);
    await get().loadFriends();
  },

  loadFriendClasses: async (friendUserId) => {
    try {
      // Show local SQLite cache immediately for offline support
      const localRows = await db.select().from(classes).where(eq(classes.userId, friendUserId));
      if (localRows.length > 0) {
        const cached = localRows.map((row) => ({
          ...row,
          daysOfWeek: JSON.parse(row.daysOfWeek || '[]') as number[],
          isActive: Boolean(row.isActive),
          ownerUserId: row.userId,
          ownerInitials: undefined,
          sharedWith: [],
        })) as ClassItem[];

        set((state) => {
          const next = new Map(state.friendClasses);
          next.set(friendUserId, cached);
          return { friendClasses: next };
        });
      }

      // Fetch fresh data from Turso and update
      const tursoRows = await queryTurso(
        `SELECT * FROM classes WHERE userId = ? AND isActive = 1`,
        [friendUserId],
      );
      const fresh = (tursoRows as unknown as TursoRow[]).map(tursoRowToClassItem);

      set((state) => {
        const next = new Map(state.friendClasses);
        next.set(friendUserId, fresh);
        return { friendClasses: next };
      });

      // Sync fresh data to local cache
      await db.delete(classes).where(eq(classes.userId, friendUserId));
      if (fresh.length > 0) {
        await db.insert(classes).values(
          fresh.map((c) => ({
            id: c.id,
            userId: c.ownerUserId!,
            name: c.name,
            code: c.code ?? null,
            section: c.section ?? null,
            room: c.room ?? null,
            instructor: c.instructor ?? null,
            color: c.color,
            daysOfWeek: JSON.stringify(c.daysOfWeek),
            startTime: c.startTime,
            endTime: c.endTime,
            notifyMinutesBefore: c.notifyMinutesBefore,
            semesterStart: c.semesterStart ?? null,
            semesterEnd: c.semesterEnd ?? null,
            isActive: c.isActive,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt ?? new Date().toISOString(),
          })),
        );
      }
    } catch (err) {
      console.error(`[Friends] Failed to load classes for ${friendUserId}:`, err);
    }
  },
}));
