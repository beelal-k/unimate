// app/+not-found.tsx
// Catch-all route for unmatched paths (404s)

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle } from 'lucide-react-native';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!', headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ marginBottom: 24, padding: 20, backgroundColor: '#FEE2E2', borderRadius: 24 }}>
            <AlertCircle size={48} color="#EF4444" strokeWidth={1.5} />
          </View>

          <Text style={{ fontSize: 24, fontFamily: 'Inter_700Bold', color: '#0A0A0A', marginBottom: 12 }}>
            Page not found
          </Text>

          <Text style={{ fontSize: 16, fontFamily: 'Inter_400Regular', color: '#6E6E6E', textAlign: 'center', marginBottom: 32, paddingHorizontal: 20 }}>
            This screen doesn't exist. You might have clicked a broken link or the app was opened from a deep link incorrectly.
          </Text>

          <Pressable
            onPress={() => router.replace('/')}
            style={{
              backgroundColor: '#0A0A0A',
              paddingVertical: 16,
              paddingHorizontal: 32,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter_600SemiBold' }}>
              Go back home
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </>
  );
}
