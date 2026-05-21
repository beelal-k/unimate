// lib/backgroundSync.ts
// Background fetch task for auto-syncing LMS assignments and firing notifications

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { useLmsStore } from './store/useLmsStore';
import { initializeDatabase } from './db/client';

const BACKGROUND_SYNC_TASK = 'background-moodle-sync';

// Define the task
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    // Background JS context may not have run _layout.tsx init — ensure DB is ready.
    // initializeDatabase() is idempotent: a no-op if already initialised.
    await initializeDatabase();

    const store = useLmsStore.getState();
    const isConnected = await store.checkConnection();

    if (!isConnected) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    await store.syncFromMoodle();

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('[BackgroundSync] Failed to sync data:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Registers the background fetch task with the OS scheduler
 * Should be called near the root of the app, e.g. in _layout.tsx
 */
export async function registerBackgroundSync() {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15 * 60, // 15 minutes
      stopOnTerminate: false, // Android only: keep running after app close
      startOnBoot: true,     // Android only: restart on device boot
    });
    console.log('[BackgroundSync] Registered successfully');
  } catch (err) {
    console.error('[BackgroundSync] Registration failed:', err);
  }
}

/**
 * Unregisters the background sync task
 */
export async function unregisterBackgroundSync() {
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  } catch (err) {
    // Ignored, likely not registered
  }
}
