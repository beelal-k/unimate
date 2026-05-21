import { createClient } from '@libsql/client';

const turso = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const SHEMAS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    fullname TEXT NOT NULL,
    username TEXT NOT NULL,
    lmsDomain TEXT NOT NULL,
    sitename TEXT,
    createdAt TEXT NOT NULL,
    lastLoginAt TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    section TEXT,
    room TEXT,
    instructor TEXT,
    color TEXT NOT NULL DEFAULT '#0A0A0A',
    daysOfWeek TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    notifyMinutesBefore INTEGER DEFAULT 15,
    semesterStart TEXT,
    semesterEnd TEXT,
    isActive INTEGER DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    courseId TEXT NOT NULL,
    courseName TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    dueDate TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'moodle',
    attachmentUrls TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS fileNodes (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    parentId TEXT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    mimeType TEXT,
    localUri TEXT,
    sizeBytes INTEGER,
    geminiFileUri TEXT,
    geminiExpiry TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    title TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    conversationId TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    attachedFileIds TEXT,
    createdAt TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS settings (
    userId TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (userId, key)
  );`,
  `CREATE TABLE IF NOT EXISTS scheduleShares (
    id TEXT PRIMARY KEY,
    fromUserId TEXT NOT NULL,
    toUserId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    fromFullname TEXT NOT NULL,
    toFullname TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );`
];

async function init() {
  for (const sql of SHEMAS) {
    try {
      await turso.execute(sql);
      console.log('Successfully executed schema creation block.');
    } catch (e) {
      console.error('Failed to create table:', e);
    }
  }
}

init();
