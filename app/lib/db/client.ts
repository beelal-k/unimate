import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

export const expoDb = openDatabaseSync('unimate.db');
export const db = drizzle(expoDb, { schema });

// Resolves once initializeDatabase() completes (or fails).
let _resolveReady!: () => void;
export const dbReady: Promise<void> = new Promise((resolve) => {
  _resolveReady = resolve;
});

interface PragmaColumn { name: string }

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    fullname TEXT NOT NULL,
    username TEXT NOT NULL,
    lms_domain TEXT NOT NULL,
    sitename TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY NOT NULL,
    operation TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL DEFAULT 'unknown',
    name TEXT NOT NULL,
    code TEXT,
    section TEXT,
    room TEXT,
    instructor TEXT,
    color TEXT NOT NULL DEFAULT '#0A0A0A',
    days_of_week TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    notify_minutes_before INTEGER DEFAULT 15,
    semester_start TEXT,
    semester_end TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL DEFAULT 'unknown',
    course_id TEXT NOT NULL,
    course_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'moodle',
    is_done INTEGER DEFAULT 0,
    reminder_settings TEXT,
    attachment_urls TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS file_nodes (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    parent_id TEXT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT,
    local_uri TEXT,
    size_bytes INTEGER,
    gemini_file_uri TEXT,
    gemini_expiry TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    attached_file_ids TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS lms_items (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    moodle_id INTEGER,
    course_id INTEGER,
    course_name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    grade TEXT,
    max_grade TEXT,
    status TEXT NOT NULL DEFAULT 'upcoming',
    is_done INTEGER DEFAULT 0,
    reminder_settings TEXT,
    attachments TEXT,
    synced_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  )`,
];

// Compatibility: adds columns missing from older installs. Safe to fail on fresh installs.
const COMPAT_COLUMNS = [
  `ALTER TABLE classes ADD COLUMN user_id TEXT NOT NULL DEFAULT 'unknown'`,
  `ALTER TABLE classes ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE classes ADD COLUMN section TEXT`,
  `ALTER TABLE assignments ADD COLUMN user_id TEXT NOT NULL DEFAULT 'unknown'`,
  `ALTER TABLE assignments ADD COLUMN is_done INTEGER DEFAULT 0`,
  `ALTER TABLE assignments ADD COLUMN reminder_settings TEXT`,
  `ALTER TABLE file_nodes ADD COLUMN user_id TEXT`,
  `ALTER TABLE conversations ADD COLUMN user_id TEXT`,
  `ALTER TABLE messages ADD COLUMN user_id TEXT`,
  `ALTER TABLE lms_items ADD COLUMN user_id TEXT NOT NULL DEFAULT 'unknown'`,
  `ALTER TABLE lms_items ADD COLUMN is_done INTEGER DEFAULT 0`,
  `ALTER TABLE lms_items ADD COLUMN reminder_settings TEXT`,
];

export async function initializeDatabase(): Promise<void> {
  try {
    // Recreate settings if it predates the user_id composite key
    try {
      const cols = expoDb.getAllSync<PragmaColumn>('PRAGMA table_info(settings)');
      if (cols.length > 0 && !cols.some((c) => c.name === 'user_id')) {
        expoDb.execSync('DROP TABLE settings');
      }
    } catch {}

    for (const sql of CREATE_TABLES) {
      try {
        expoDb.execSync(sql);
      } catch (err) {
        console.error('[DB] Failed to create table:', err);
      }
    }

    for (const sql of COMPAT_COLUMNS) {
      try {
        expoDb.execSync(sql);
      } catch {
        // Expected: column already exists on current installs
      }
    }
  } finally {
    _resolveReady();
  }
}
