// lib/db/schema.ts
// Complete SQLite database schema using drizzle-orm

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code'),
  room: text('room'),
  instructor: text('instructor'),
  color: text('color').notNull().default('#0A0A0A'),
  daysOfWeek: text('days_of_week').notNull(), // JSON array e.g. [1,3,5]
  startTime: text('start_time').notNull(), // 'HH:MM' 24h
  endTime: text('end_time').notNull(), // 'HH:MM' 24h
  notifyMinutesBefore: integer('notify_minutes_before').default(15),
  semesterStart: text('semester_start'),
  semesterEnd: text('semester_end'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull(),
});

export const assignments = sqliteTable('assignments', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull(),
  courseName: text('course_name').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: text('due_date'),
  status: text('status').notNull().default('pending'), // pending|done|overdue
  source: text('source').notNull().default('moodle'), // moodle|manual
  attachmentUrls: text('attachment_urls'), // JSON array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const fileNodes = sqliteTable('file_nodes', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  type: text('type').notNull(), // 'folder' | 'file'
  name: text('name').notNull(),
  mimeType: text('mime_type'),
  localUri: text('local_uri'),
  sizeBytes: integer('size_bytes'),
  geminiFileUri: text('gemini_file_uri'),
  geminiExpiry: text('gemini_expiry'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(), // 'user' | 'model'
  content: text('content').notNull(),
  attachedFileIds: text('attached_file_ids'), // JSON array
  createdAt: text('created_at').notNull(),
});

export const lmsItems = sqliteTable('lms_items', {
  id: text('id').primaryKey(),
  moodleId: integer('moodle_id'),
  courseId: integer('course_id'),
  courseName: text('course_name').notNull().default(''),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: text('due_date'),
  grade: text('grade'),
  maxGrade: text('max_grade'),
  status: text('status').notNull().default('upcoming'),
  attachments: text('attachments'), // JSON array of {filename, fileurl, filesize, mimetype}
  syncedAt: text('synced_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
