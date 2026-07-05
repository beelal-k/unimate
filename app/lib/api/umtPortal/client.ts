import axios, { AxiosInstance } from 'axios';
import { UMT_BASE_URL } from './constants';

// Lazily required: this native module isn't present until a dev-client build that
// includes it has been installed. A top-level import would throw as soon as this file
// is loaded (even before any of its methods are called), which would take down every
// screen that transitively imports this module. See getNotifications() in
// useScheduleStore.ts for the same defensive pattern.
function getCookieManager() {
  try {
    return require('@preeternal/react-native-cookie-manager')
      .default as typeof import('@preeternal/react-native-cookie-manager').default;
  } catch {
    return null;
  }
}

export function createUmtClient(): AxiosInstance {
  return axios.create({
    baseURL: UMT_BASE_URL,
    timeout: 30000,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    },
  });
}

/**
 * Clears any leftover .AspNet.ApplicationCookie / ASP.NET_SessionId from a previous
 * import attempt. Without this, a second import (e.g. a different student on a shared
 * device) could pick up a stale session and silently return the wrong account's data.
 */
export async function resetPortalSession(): Promise<void> {
  const CookieManager = getCookieManager();
  if (!CookieManager) {
    console.warn('[UmtPortal] CookieManager native module unavailable — skipping cookie reset. Rebuild the dev client to enable this.');
    return;
  }
  try {
    await CookieManager.clearAll();
  } catch (err) {
    console.warn('[UmtPortal] Failed to clear cookies before import:', err);
  }
}
