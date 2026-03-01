// lib/db/client.ts
// Database initialization with expo-sqlite + drizzle-orm

import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

const expo = openDatabaseSync('unimate.db');

export const db = drizzle(expo, { schema });

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
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
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY NOT NULL,
    course_id TEXT NOT NULL,
    course_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'moodle',
    attachment_urls TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS file_nodes (
    id TEXT PRIMARY KEY NOT NULL,
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
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    attached_file_ids TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS lms_items (
    id TEXT PRIMARY KEY NOT NULL,
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
    attachments TEXT,
    synced_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`,
];

export async function initializeDatabase() {
  for (const sql of CREATE_TABLES) {
    try {
      expo.execSync(sql);
    } catch (error) {
      console.error('[DB] Failed to create table:', sql.substring(0, 60), error);
      // Try with runSync as fallback
      try {
        expo.runSync(sql);
      } catch (e2) {
        console.error('[DB] runSync also failed:', e2);
      }
    }
  }
  console.log('[DB] All tables initialized');
}
