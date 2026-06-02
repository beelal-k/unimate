import { getUserId } from '../session';
import { eq, and } from 'drizzle-orm';
import { db } from './client';
import { settings } from './schema';
import { enqueueSync } from './sync';

/** Persist a user setting to SQLite and enqueue a Turso sync. */
export async function saveSetting(key: string, value: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await db
    .insert(settings)
    .values({ userId, key, value })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { value },
    });

  await enqueueSync('update', 'settings', key, { key, value });
}

/** Read a user setting from SQLite. Returns null if not found. */
export async function readSetting(key: string): Promise<string | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const rows = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, key)));

  return rows[0]?.value ?? null;
}
