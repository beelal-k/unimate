import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';
import Constants from 'expo-constants';

function getFallbackUrl(downloadUrl: string): string {
  return (Constants.expoConfig?.extra?.apkFallbackUrl as string | undefined) || downloadUrl;
}

export async function downloadAndInstallApk(
  downloadUrl: string,
  setIsDownloading: (val: boolean) => void,
): Promise<void> {
  setIsDownloading(true);
  try {
    const localUri = `${FileSystem.documentDirectory}app-update.apk`;
    const { uri } = await FileSystem.downloadAsync(downloadUrl, localUri);
    const contentUri = await FileSystem.getContentUriAsync(uri);

    try {
      await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
    } catch {
      Alert.alert(
        'Installation Blocked',
        'Your device settings do not allow direct app installations. Open in browser to download instead?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Browser', onPress: () => Linking.openURL(getFallbackUrl(downloadUrl)) },
        ],
      );
    }
  } catch {
    Alert.alert(
      'Download Failed',
      'Could not download the update. Open in browser to download instead?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Browser', onPress: () => Linking.openURL(getFallbackUrl(downloadUrl)) },
      ],
    );
  } finally {
    setIsDownloading(false);
  }
}
