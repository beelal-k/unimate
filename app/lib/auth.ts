import * as SecureStore from 'expo-secure-store';
import { db } from './db/client';
import { users, settings, classes, assignments, fileNodes, conversations, messages, lmsItems, syncQueue } from './db/schema';
import { pullFromTurso, drainSyncQueue, enqueueSync } from './db/sync';
import { getSiteInfo, loginToMoodle, invalidateMoodleTokens } from './api/moodle';
import Constants from 'expo-constants';

export { pullFromTurso, drainSyncQueue };

const ALL_TABLES = [
  messages,
  conversations,
  lmsItems,
  assignments,
  fileNodes,
  syncQueue,
  settings,
  classes,
  users,
] as const;

export async function loginSequence(
  domain: string,
  username: string,
  password: string,
): Promise<void> {
  const siteUrl = `https://${domain}`;
  const token = await loginToMoodle(siteUrl, username, password);
  const creds = { siteUrl, token };
  const siteInfo = await getSiteInfo(creds);

  const userId = `${domain}_${siteInfo.userid}`;
  const now = new Date().toISOString();

  await db
    .insert(users)
    .values({
      id: userId,
      fullname: siteInfo.fullname,
      username: siteInfo.username || username,
      lmsDomain: domain,
      sitename: siteInfo.sitename,
      createdAt: now,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({ target: users.id, set: { lastLoginAt: now } });

  await SecureStore.setItemAsync('moodle_token', token);
  await SecureStore.setItemAsync('moodle_domain', domain);
  await SecureStore.setItemAsync('moodle_site_url', siteUrl);
  await SecureStore.setItemAsync('user_id', userId);
  await SecureStore.setItemAsync('user_fullname', siteInfo.fullname);
  await SecureStore.setItemAsync('moodle_username', siteInfo.username || username);
  if (siteInfo.sitename) {
    await SecureStore.setItemAsync('user_sitename', siteInfo.sitename);
  }

  await enqueueSync('insert', 'users', userId, {
    id: userId,
    fullname: siteInfo.fullname,
    username: siteInfo.username || username,
    lmsDomain: domain,
    sitename: siteInfo.sitename || '',
    createdAt: now,
    lastLoginAt: now,
  });

  // Register push token (non-fatal if permissions are denied)
  try {
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    const finalStatus =
      status !== 'granted'
        ? (await Notifications.requestPermissionsAsync()).status
        : status;

    if (finalStatus === 'granted') {
      const { data: pushToken } = await Notifications.getExpoPushTokenAsync({
        projectId:
          process.env.EXPO_PUBLIC_PROJECT_ID ||
          Constants.expoConfig?.extra?.eas?.projectId,
      });

      await db
        .insert(settings)
        .values({ userId, key: 'expo_push_token', value: pushToken })
        .onConflictDoUpdate({
          target: [settings.userId, settings.key],
          set: { value: pushToken },
        });

      await enqueueSync('insert', 'settings', 'expo_push_token', {
        userId,
        key: 'expo_push_token',
        value: pushToken,
      });
    }
  } catch (err) {
    console.warn('[Auth] Push token registration failed:', err);
  }

  await pullFromTurso(userId);
}

export async function signOutSequence(): Promise<void> {
  try {
    const siteUrl = await SecureStore.getItemAsync('moodle_site_url');
    const token = await SecureStore.getItemAsync('moodle_token');
    if (siteUrl && token) {
      await invalidateMoodleTokens({ siteUrl, token });
    }
  } catch (err) {
    console.warn('[Auth] Failed to invalidate Moodle token:', err);
  }

  await Promise.allSettled([
    SecureStore.deleteItemAsync('moodle_token'),
    SecureStore.deleteItemAsync('moodle_domain'),
    SecureStore.deleteItemAsync('moodle_site_url'),
    SecureStore.deleteItemAsync('user_id'),
    SecureStore.deleteItemAsync('user_fullname'),
    SecureStore.deleteItemAsync('user_sitename'),
    SecureStore.deleteItemAsync('moodle_username'),
  ]);

  for (const table of ALL_TABLES) {
    try {
      await db.delete(table);
    } catch (err) {
      console.warn('[Auth] Failed to clear table on sign-out:', err);
    }
  }
}
