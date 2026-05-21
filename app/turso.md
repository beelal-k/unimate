# Feature Requirement: Authentication & Data Persistence

## Overview

UniMate uses the user's existing Moodle LMS credentials as the sole authentication mechanism. There is no separate account creation. If you can log into your university's Moodle, you can log into UniMate. User data is persisted in two layers: **expo-secure-store** for sensitive credentials on-device, and **Turso** (cloud SQLite) for all app data that must survive device changes.

---

## 1. Authentication Flow

### 1.1 First Launch

On first launch, before any other screen is shown, the app presents a full-screen login screen. There is no way to skip or bypass this screen. The app is completely non-functional until a successful Moodle login is completed.

The login screen collects three inputs:

- **LMS Domain** — pre-filled with the placeholder `lms.umt.edu.pk`. The user can change this if their university uses a different domain. The field accepts a bare domain (e.g. `lms.umt.edu.pk`) and the app prepends `https://` internally. Never ask the user to type the full URL.
- **Username** — their Moodle username (student ID or email, depending on the university)
- **Password** — their Moodle password

A single **Sign In** button at the bottom. On press, the button enters a loading state (spinner replaces text, button disabled) while the authentication sequence runs.

### 1.2 Authentication Sequence

When the user taps Sign In, execute the following steps in order. If any step fails, show an inline error message below the relevant field and return to idle state.

**Step 1 — Fetch Moodle Token**

```
POST https://{lmsDomain}/login/token.php
Body: username={username}&password={password}&service=moodle_mobile_app
```

On success: receive `{ token: string }`.
On failure: show error "Invalid username or password. Please try again."
If the endpoint is unreachable: show error "Could not reach {lmsDomain}. Check the domain and your internet connection."

**Step 2 — Fetch User Identity**

Using the token from Step 1, call:

```
GET https://{lmsDomain}/webservice/rest/server.php
  ?wstoken={token}
  &moodlewsrestformat=json
  &wsfunction=core_webservice_get_site_info
```

Extract from the response:
- `userid` — unique integer ID for this user on this Moodle instance
- `fullname` — display name (e.g. "Ahmed Khan")
- `username` — the username they logged in with
- `sitename` — the university/site name (e.g. "University of Management and Technology")

Construct a globally unique user identifier: `{lmsDomain}_{userid}` (e.g. `lms.umt.edu.pk_12345`). This is the `userId` used in all Turso records.

**Step 3 — Provision Turso User Record**

Check the Turso `users` table for a row with `id = userId`. If none exists, insert a new row with the user's identity information. If a row exists, update `lastLoginAt`.

**Step 4 — Store Credentials in expo-secure-store**

Store all of the following in expo-secure-store. These values are encrypted using Android Keystore and never leave the device:

```typescript
await SecureStore.setItemAsync('moodle_token', token);
await SecureStore.setItemAsync('moodle_domain', lmsDomain);
await SecureStore.setItemAsync('moodle_username', username);
await SecureStore.setItemAsync('moodle_password', password); // stored for silent re-auth
await SecureStore.setItemAsync('user_id', userId);
await SecureStore.setItemAsync('user_fullname', fullname);
await SecureStore.setItemAsync('user_sitename', sitename);
```

**Step 5 — Pull Existing Data from Turso**

Query Turso for all records belonging to this `userId` across all tables (classes, assignments, fileNodes, conversations, messages, settings). Hydrate the local SQLite database with this data. This is what makes the app work seamlessly across devices — logging in on a new phone restores all the user's data.

Show a progress indicator during this step: "Restoring your data..."

**Step 6 — Navigate to Dashboard**

On completion of all steps, navigate to the main app (Dashboard tab) with a success haptic (`NotificationFeedbackType.Success`). The login screen is removed from the navigation stack and cannot be navigated back to.

### 1.3 Subsequent Launches

On every app launch after the first, check expo-secure-store for the presence of `moodle_token`. If it exists, skip the login screen entirely and go straight to the Dashboard. In the background (after the Dashboard has rendered), silently re-validate the token by calling `core_webservice_get_site_info`. If the token has expired:

- Silently use the stored `moodle_username` and `moodle_password` to fetch a new token (Step 1 of Section 1.2)
- Store the new token in expo-secure-store
- Continue without interrupting the user

If re-authentication fails (wrong password, account locked, network error), show a non-dismissable bottom sheet explaining that the session expired and asking the user to re-enter their password. Pre-fill the username and domain fields. The user only needs to re-enter their password — they do not start from scratch.

### 1.4 Sign Out

Available in the Settings screen. On sign out:

1. Call `core_auth_invalidate_tokens` on Moodle to invalidate the token server-side
2. Clear all keys from expo-secure-store
3. Clear the local SQLite database entirely
4. Do NOT delete data from Turso — it persists for when the user logs back in
5. Navigate to the login screen

---

## 2. Data Architecture

### 2.1 Two-Layer Persistence Model

UniMate uses a dual-database architecture:

```
┌─────────────────────────────────────────────────────┐
│                   Device (local)                    │
│                                                     │
│   expo-secure-store        SQLite (drizzle-orm)     │
│   ─────────────────        ────────────────────     │
│   Moodle token             classes                  │
│   Moodle credentials       assignments              │
│   User identity            fileNodes (metadata)     │
│   Gemini API key           conversations            │
│                            messages                 │
│                            lmsItems                 │
│                            settings                 │
└─────────────────────────────────────────────────────┘
                         ↕ sync
┌─────────────────────────────────────────────────────┐
│                  Turso (cloud)                      │
│                                                     │
│   users                    fileNodes (metadata)     │
│   classes                  conversations            │
│   assignments              messages                 │
│   settings                                          │
└─────────────────────────────────────────────────────┘
```

**Local SQLite** is the primary data source for all reads. The app always reads from local SQLite first — it is faster and works offline. Turso is the backup and cross-device sync layer.

**Turso** receives writes whenever the local database is mutated. Writes to Turso are fire-and-forget — they do not block the UI. If the device is offline, the write is queued in a local `syncQueue` table and retried when connectivity is restored.

### 2.2 What Lives Where

| Data | expo-secure-store | SQLite (local) | Turso (cloud) |
|---|---|---|---|
| Moodle token | ✅ | ❌ | ❌ |
| Moodle credentials | ✅ | ❌ | ❌ |
| Gemini API key | ✅ | ❌ | ❌ |
| User identity (name, uid) | ✅ | ❌ | ✅ |
| Scheduled classes | ❌ | ✅ | ✅ |
| Assignments (metadata) | ❌ | ✅ | ✅ |
| LMS course list (cache) | ❌ | ✅ | ❌ |
| File metadata (folders, names) | ❌ | ✅ | ✅ |
| File contents (PDF, PPTX bytes) | ❌ | ✅ (local URI) | ❌ |
| AI conversations | ❌ | ✅ | ✅ |
| AI messages | ❌ | ✅ | ✅ |
| App settings | ❌ | ✅ | ✅ |

**Note on file contents:** The actual bytes of uploaded files (PDFs, PPTX, DOCX) are stored only on the local device filesystem via `expo-file-system`. Only the file metadata (name, folder path, size, mime type, timestamps) is synced to Turso. If the user logs in on a new device, they will see all their folder structure and file names, but they will need to re-upload the actual files. Display a visual indicator on files that have metadata but no local content: a cloud icon with a "File not on this device" label.

### 2.3 Turso Configuration

The Turso database URL and auth token are baked into the app at build time via Expo's `app.config.js` environment variables. They are not hardcoded as string literals in source files.

```typescript
// app.config.js
export default {
  expo: {
    extra: {
      tursoUrl: process.env.TURSO_URL,
      tursoToken: process.env.TURSO_AUTH_TOKEN,
    }
  }
};

// lib/db/turso.ts
import Constants from 'expo-constants';
import { createClient } from '@libsql/client';

export const tursoClient = createClient({
  url: Constants.expoConfig.extra.tursoUrl,
  authToken: Constants.expoConfig.extra.tursoToken,
});
```

Every query to Turso must include a `WHERE userId = ?` clause. Never query or mutate rows belonging to a different userId. This is enforced at the query layer in `lib/db/turso.ts` — all exported query functions accept `userId` as a required parameter and it is never optional.

### 2.4 Turso Schema

The Turso schema mirrors the local SQLite schema exactly, with the addition of a `userId` column on every table and a top-level `users` table:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,          -- "{domain}_{moodleUserId}" e.g. "lms.umt.edu.pk_12345"
  fullname TEXT NOT NULL,
  username TEXT NOT NULL,
  lmsDomain TEXT NOT NULL,
  sitename TEXT,
  createdAt TEXT NOT NULL,
  lastLoginAt TEXT NOT NULL
);

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
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
);

CREATE TABLE assignments (
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
);

CREATE TABLE fileNodes (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  parentId TEXT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  mimeType TEXT,
  sizeBytes INTEGER,
  geminiFileUri TEXT,
  geminiExpiry TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
  -- Note: localUri is NOT synced to Turso, it is device-specific
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  title TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  conversationId TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  attachedFileIds TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE settings (
  userId TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (userId, key)
);

CREATE TABLE syncQueue (
  -- Local SQLite only, never synced to Turso
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,   -- 'insert' | 'update' | 'delete'
  tableName TEXT NOT NULL,
  recordId TEXT NOT NULL,
  payload TEXT NOT NULL,     -- JSON of the record
  createdAt TEXT NOT NULL,
  retryCount INTEGER DEFAULT 0
);
```

---

## 3. LMS Course Caching

### 3.1 What is Cached

When the app performs a Moodle sync, the full list of enrolled courses is cached in local SQLite only (not Turso — it is device-specific live data from the LMS). The following fields are cached per course:

```typescript
interface CachedCourse {
  id: string;              // Moodle course ID
  userId: string;
  fullname: string;
  shortname: string;
  startdate: number;       // Unix timestamp
  enddate: number;         // Unix timestamp, 0 if not set
  category: string;
  visible: boolean;
  lastSynced: string;      // ISO timestamp of when this was fetched
}
```

Assignment metadata (title, description, due date, status) is also cached in local SQLite and synced to Turso, so it is available offline.

### 3.2 What Requires Internet

The following LMS operations require an active internet connection and cannot function offline:

- Downloading the actual content of an assignment (brief, attached files, submission details)
- Downloading course resource files (PDFs, slides uploaded by the professor)
- Fetching new/updated assignments and resources (background sync)
- Submitting assignments (not in scope for v1, but noted)

When the user attempts any of these while offline, show a bottom sheet with the message: "You're offline. Connect to the internet to load this content." with a Retry button. Do not show an error toast — this is an expected state, not an error.

### 3.3 Offline Indicators

Any LMS item whose full content has not been downloaded shows a subtle wifi-off icon (lucide, `text-tertiary` color) in the top-right corner of its card. Items whose metadata is cached and available offline show no indicator — they open and display their cached details immediately.

---

## 4. Sync Strategy

### 4.1 Write Path (Local → Turso)

Every write to the local SQLite database must be immediately followed by an equivalent write to Turso. The pattern for all mutations:

```typescript
async function createClass(userId: string, data: NewClass) {
  // 1. Write to local SQLite first (instant, always succeeds)
  await localDb.insert(classes).values({ ...data, userId });

  // 2. Write to Turso (non-blocking, queued on failure)
  try {
    await tursoClient.execute({
      sql: `INSERT INTO classes VALUES (?, ?, ...)`,
      args: [data.id, userId, ...]
    });
  } catch {
    // Queue for retry when back online
    await localDb.insert(syncQueue).values({
      id: uuid(),
      operation: 'insert',
      tableName: 'classes',
      recordId: data.id,
      payload: JSON.stringify({ ...data, userId }),
      createdAt: new Date().toISOString(),
    });
  }
}
```

### 4.2 Read Path (New Device Login)

On Step 5 of the login sequence (Section 1.2), pull all records from Turso for the authenticated `userId` and insert them into local SQLite. Execute table pulls in this order to respect foreign key dependencies:

1. `settings`
2. `classes`
3. `assignments`
4. `fileNodes` (metadata only — local file content will be missing, show cloud indicators)
5. `conversations`
6. `messages`

### 4.3 Sync Queue Drain

On every app foreground event (`AppState` change to `active`) and every successful network reconnection (via `@react-native-community/netinfo`), drain the `syncQueue` table:

- Process up to 20 items at a time
- On success, delete the queue item
- On failure, increment `retryCount`
- If `retryCount` exceeds 5, mark the item as `failed` and surface a subtle warning in Settings ("Some data may not be backed up")

---

## 5. Settings Screen — Account Section

The Settings screen must include an **Account** section at the top showing:

- User's full name (from expo-secure-store)
- Username and LMS domain
- University/site name
- "Last synced" timestamp (from the last successful Turso write)
- A **Sign Out** button (destructive, outlined style)
- A **Sync Now** button that manually triggers a Turso push of all local data

---

## 6. Edge Cases

- **No internet on first launch:** The login screen requires internet (Moodle auth needs the network). Show a non-dismissable "No internet connection" banner at the top of the login screen. The Sign In button is disabled until connectivity is restored.
- **Turso write fails on first login:** Proceed with local-only operation. Queue all initial data writes. The app is fully functional offline after login — Turso sync is best-effort.
- **User logs in on second device before syncing from first:** Last-write-wins. Turso always reflects the most recently written state. There is no conflict resolution — the assumption is a single user on one primary device.
- **Moodle token expires mid-session:** All Moodle API calls check for a `token not valid` error response and trigger silent re-authentication (Section 1.3) before retrying the original call. This is transparent to the user.
- **User changes their Moodle password:** The stored password in expo-secure-store becomes stale. Silent re-auth will fail. Show the re-enter password sheet (Section 1.3 fallback).