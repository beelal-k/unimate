import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { NotificationResponse } from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useNetInfo } from '@react-native-community/netinfo';
import { ToastProvider } from '../components/ui/Toast';
import { AppTooltip } from '../components/ui/AppTooltip';
import { UpdateChecker } from '../components/update/UpdateChecker';
import { initializeDatabase } from '../lib/db/client';
import { setupApp, drainSyncQueue } from '../lib/startup';
import '../global.css';

SplashScreen.preventAutoHideAsync();

function tryGetNotifications(): typeof import('expo-notifications') | null {
  try {
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
}

function getNavUrlFromNotification(response: NotificationResponse): string | null {
  const data = response.notification.request.content.data as Record<string, unknown>;
  if (!data?.lmsItemId) return null;
  if (response.actionIdentifier === 'generate-draft') {
    return `/(modals)/assignment?id=${data.lmsItemId}&autoGenerate=true`;
  }
  return `/(modals)/assignment?id=${data.lmsItemId}`;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const pendingNavUrl = useRef<string | null>(null);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const netInfo = useNetInfo();

  // DB init + startup (non-blocking for notifications/sync)
  useEffect(() => {
    initializeDatabase()
      .catch(console.error)
      .finally(() => setReady(true));

    setupApp();

    // Capture cold-launch notification tap (no-op in Expo Go)
    tryGetNotifications()?.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const url = getNavUrlFromNotification(response);
        if (url) pendingNavUrl.current = url;
      }
    });
  }, []);

  // Hide splash and handle pending deep-link once everything is ready
  useEffect(() => {
    if (!fontsLoaded || !ready) return;

    SplashScreen.hideAsync();

    if (pendingNavUrl.current) {
      const url = pendingNavUrl.current;
      pendingNavUrl.current = null;
      setTimeout(() => router.push(url as Parameters<typeof router.push>[0]), 300);
    }
  }, [fontsLoaded, ready]);

  // Notification tap while app is open (no-op in Expo Go)
  useEffect(() => {
    const N = tryGetNotifications();
    if (!N) return;
    const sub = N.addNotificationResponseReceivedListener((response) => {
      const url = getNavUrlFromNotification(response);
      if (url) router.push(url as Parameters<typeof router.push>[0]);
    });
    return () => sub.remove();
  }, []);

  // Sync on foreground / reconnect
  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && netInfo.isConnected) drainSyncQueue().catch(console.error);
    });
    return () => sub.remove();
  }, [ready, netInfo.isConnected]);

  useEffect(() => {
    if (ready && netInfo.isConnected) drainSyncQueue().catch(console.error);
  }, [ready, netInfo.isConnected]);

  // Block rendering until DB and fonts are ready — native splash covers this gap
  if (!fontsLoaded || !ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UpdateChecker>
      <ToastProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            contentStyle: { backgroundColor: '#FFFFFF' },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="+not-found" />
          <Stack.Screen
            name="(modals)"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
        </Stack>
        <AppTooltip />
      </ToastProvider>
      </UpdateChecker>
    </GestureHandlerRootView>
  );
}
