import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

export default function Index() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync('moodle_token').then((token) => {
      setHasToken(!!token);
    });
  }, []);

  useEffect(() => {
    if (hasToken === null) return;
    if (hasToken) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/login');
    }
  }, [hasToken]);

  // Blank — native splash covers this while _layout.tsx is initialising the DB.
  // By the time this mounts, DB is guaranteed ready (see _layout.tsx guard).
  return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
}
