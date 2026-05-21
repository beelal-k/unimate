import { drainSyncQueue } from './db/sync';

/** One-time app setup: notification channels, categories, and background sync registration. */
export async function setupApp(): Promise<void> {
  try {
    const { setupNotificationChannel, setupNotificationCategories } =
      require('./notifications') as typeof import('./notifications');
    const { registerBackgroundSync } =
      require('./backgroundSync') as typeof import('./backgroundSync');

    await setupNotificationChannel();
    await setupNotificationCategories();
    await registerBackgroundSync();
  } catch (err) {
    console.warn('[Startup] Notification/sync setup failed:', err);
  }
}

export { drainSyncQueue };
