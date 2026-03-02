// app/(tabs)/_layout.tsx
// Tab layout with custom tab bar

import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { TabBar } from '../../components/ui/TabBar';
import { AppTooltip } from '../../components/ui/AppTooltip';

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="schedule" options={{ title: 'Schedule' }} />
        <Tabs.Screen name="lms" options={{ title: 'LMS' }} />
        <Tabs.Screen name="files" options={{ title: 'Files' }} />
        <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      </Tabs>
      <AppTooltip />
    </View>
  );
}
