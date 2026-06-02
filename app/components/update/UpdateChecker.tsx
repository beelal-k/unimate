import React, { useEffect } from 'react';
import { Alert, View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { PostHogProvider, useFeatureFlagWithPayload } from 'posthog-react-native';
import { compareVersions } from 'compare-versions';
import Constants from 'expo-constants';
import { useUpdateStore } from '../../lib/store/useUpdateStore';
import { downloadAndInstallApk } from '../../lib/services/updateService';

type UpdatePayload = {
  latest_version: string;
  download_url: string;
  release_notes: string;
};

function UpdateFlagListener() {
  const [isFlagActive, payload] = useFeatureFlagWithPayload('app-latest-version') as [boolean | string | undefined, UpdatePayload | undefined];
  const { setUpdateInfo, dismissUpdate, loadDismissedVersion, dismissedVersion, setIsDownloading, isDownloading } =
    useUpdateStore();

  const localVersion = Constants.expoConfig?.version ?? '0.0.0';

  useEffect(() => {
    loadDismissedVersion();
  }, []);

  useEffect(() => {
    if (!isFlagActive || !payload?.latest_version || !payload?.download_url) return;

    let isNewer = false;
    try {
      isNewer = compareVersions(payload.latest_version, localVersion) > 0;
    } catch {
      return;
    }

    if (!isNewer) return;

    setUpdateInfo({
      latestVersion: payload.latest_version,
      downloadUrl: payload.download_url,
      releaseNotes: payload.release_notes ?? '',
    });

    // Only show modal if the user hasn't dismissed this exact version
    if (dismissedVersion === payload.latest_version) return;

    Alert.alert(
      'Update Available',
      `Version ${payload.latest_version} is ready.\n\n${payload.release_notes ?? ''}`.trim(),
      [
        {
          text: 'Not Now',
          style: 'cancel',
          onPress: () => dismissUpdate(payload.latest_version),
        },
        {
          text: 'Update Now',
          onPress: () => downloadAndInstallApk(payload.download_url, setIsDownloading),
        },
      ],
      { cancelable: false },
    );
  }, [payload, isFlagActive, dismissedVersion]);

  if (!isDownloading) return null;

  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color="#ffffff" />
      <Text style={styles.overlayText}>Downloading update...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  overlayText: {
    color: '#ffffff',
    marginTop: 12,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
});

export function UpdateChecker({ children }: { children: React.ReactNode }) {
  const posthogKey = Constants.expoConfig?.extra?.posthogKey as string | undefined;

  if (!posthogKey) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider apiKey={posthogKey} options={{ host: 'https://us.i.posthog.com' }}>
      <View style={{ flex: 1 }}>
        {children}
        <UpdateFlagListener />
      </View>
    </PostHogProvider>
  );
}
