import { db } from './client';
import { syncQueue, classes, assignments, fileNodes, conversations, messages, settings } from './schema';
import { queryTurso } from './turso';
import { randomUUID } from 'expo-crypto';
import { eq } from 'drizzle-orm';
import * as SecureStore from 'expo-secure-store';

export type SyncOperation = 'insert' | 'update' | 'delete';

type ScalarValue = string | number | boolean | null;

// Max retries before a queued item is abandoned
const MAX_RETRY_COUNT = 5;

// Allowed column names per table for Turso writes (camelCase, matching Turso schema)
const TURSO_COLUMNS: Record<string, string[]> = {
  users: ['id', 'fullname', 'username', 'lmsDomain', 'sitename', 'createdAt', 'lastLoginAt'],
  classes: [
    'id', 'userId', 'name', 'code', 'section', 'room', 'instructor', 'color',
    'daysOfWeek', 'startTime', 'endTime', 'notifyMinutesBefore',
    'semesterStart', 'semesterEnd', 'isActive', 'createdAt', 'updatedAt',
  ],
  assignments: [
    'id', 'userId', 'courseId', 'courseName', 'title', 'description',
    'dueDate', 'status', 'source', 'isDone', 'reminderSettings', 'attachmentUrls', 'createdAt', 'updatedAt',
  ],
  fileNodes: [
    'id', 'userId', 'parentId', 'type', 'name', 'mimeType',
    'sizeBytes', 'geminiFileUri', 'geminiExpiry', 'createdAt', 'updatedAt',
  ],
  conversations: ['id', 'userId', 'title', 'createdAt', 'updatedAt'],
  messages: ['id', 'userId', 'conversationId', 'role', 'content', 'attachedFileIds', 'createdAt'],
  settings: ['userId', 'key', 'value'],
};

function filterPayload(
  tableName: string,
  payload: Record<string, ScalarValue>,
): Record<string, ScalarValue> {
  const allowed = TURSO_COLUMNS[tableName];
  if (!allowed) return payload;
  return Object.fromEntries(
    Object.entries(payload).filter(([k]) => allowed.includes(k)),
  );
}

async function executeTursoOperation(
  operation: SyncOperation,
  tableName: string,
  recordId: string,
  payload: Record<string, ScalarValue>,
  userId: string,
): Promise<void> {
  if (operation === 'insert') {
    const keys = Object.keys(payload);
    const values = Object.values(payload);
    const placeholders = keys.map(() => '?').join(', ');
    const cmd = tableName === 'users' || tableName === 'settings' ? 'INSERT OR REPLACE' : 'INSERT';
    await queryTurso(
      `${cmd} INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`,
      values,
    );
  } else if (operation === 'update') {
    const keys = Object.keys(payload).filter((k) => k !== 'id' && k !== 'userId');
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => payload[k]);
    const idColumn = tableName === 'settings' ? 'key' : 'id';
    const queryId = tableName === 'settings' ? payload.key : recordId;
    await queryTurso(
      `UPDATE ${tableName} SET ${setClause} WHERE ${idColumn} = ? AND userId = ?`,
      [...values, queryId, userId],
    );
  } else if (operation === 'delete') {
    const idColumn = tableName === 'settings' ? 'key' : 'id';
    const queryId = tableName === 'settings' ? payload.key : recordId;
    await queryTurso(
      `DELETE FROM ${tableName} WHERE ${idColumn} = ? AND userId = ?`,
      [queryId, userId],
    );
  }
}

/** Writes a mutation to Turso immediately, or queues it locally on failure. */
export async function enqueueSync(
  operation: SyncOperation,
  tableName: string,
  recordId: string,
  payload: Record<string, ScalarValue>,
): Promise<void> {
  const userId = await SecureStore.getItemAsync('user_id');
  if (!userId) return;

  const safePayload = filterPayload(tableName, payload);

  try {
    await executeTursoOperation(operation, tableName, recordId, safePayload, userId);
  } catch (err) {
    console.warn(`[Sync] Turso ${operation} failed on ${tableName}, queuing locally.`, err);
    await queueLocally(operation, tableName, recordId, payload);
  }
}

async function queueLocally(
  operation: SyncOperation,
  tableName: string,
  recordId: string,
  payload: Record<string, ScalarValue>,
): Promise<void> {
  await db.insert(syncQueue).values({
    id: randomUUID(),
    operation,
    tableName,
    recordId,
    payload: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
  });
}

/** Hydrates the local SQLite database from Turso for a given user. */
export async function pullFromTurso(userId: string): Promise<void> {
  const tableMap: Array<{ name: string; table: typeof classes | typeof assignments | typeof fileNodes | typeof conversations | typeof messages | typeof settings }> = [
    { name: 'settings', table: settings },
    { name: 'classes', table: classes },
    { name: 'assignments', table: assignments },
    { name: 'fileNodes', table: fileNodes },
    { name: 'conversations', table: conversations },
    { name: 'messages', table: messages },
  ];

  for (const { name, table } of tableMap) {
    try {
      const rows = await queryTurso(`SELECT * FROM ${name} WHERE userId = ?`, [userId]);
      for (const row of rows) {
        const payload = Object.fromEntries(Object.entries(row)) as Record<string, ScalarValue>;

        if (name === 'settings') {
          await db
            .insert(table as typeof settings)
            .values(payload as typeof settings.$inferInsert)
            .onConflictDoUpdate({
              target: [(table as typeof settings).userId, (table as typeof settings).key],
              set: payload as Partial<typeof settings.$inferInsert>,
            });
        } else {
          await db
            .insert(table as typeof classes)
            .values(payload as typeof classes.$inferInsert)
            .onConflictDoUpdate({
              target: (table as typeof classes).id,
              set: payload as Partial<typeof classes.$inferInsert>,
            });
        }
      }
    } catch (err) {
      console.error(`[Sync] Failed to pull ${name}:`, err);
    }
  }
}

/**
 * Replays queued mutations when back online.
 * Processes at most 20 items per call. Items exceeding MAX_RETRY_COUNT are dropped.
 */
export async function drainSyncQueue(): Promise<void> {
  const queue = await db.select().from(syncQueue);
  if (queue.length === 0) return;

  const userId = await SecureStore.getItemAsync('user_id');
  if (!userId) return;

  const slice = queue.slice(0, 20);

  for (const item of slice) {
    if ((item.retryCount ?? 0) >= MAX_RETRY_COUNT) {
      console.warn(`[Sync] Dropping ${item.tableName}/${item.recordId} after ${MAX_RETRY_COUNT} retries.`);
      await db.delete(syncQueue).where(eq(syncQueue.id, item.id));
      continue;
    }

    try {
      const rawPayload = JSON.parse(item.payload) as Record<string, ScalarValue>;
      const payload = filterPayload(item.tableName, rawPayload);
      await executeTursoOperation(item.operation as SyncOperation, item.tableName, item.recordId, payload, userId);
      await db.delete(syncQueue).where(eq(syncQueue.id, item.id));
    } catch {
      await db
        .update(syncQueue)
        .set({ retryCount: (item.retryCount ?? 0) + 1 })
        .where(eq(syncQueue.id, item.id));
    }
  }
}
