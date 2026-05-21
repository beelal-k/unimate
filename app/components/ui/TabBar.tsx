// components/ui/TabBar.tsx
// Always renders all 5 tabs, navigates using expo-router

import React, { useCallback } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Home, Calendar, BookOpen, FolderOpen, MessageCircle } from 'lucide-react-native';
import { Springs } from '../../lib/theme';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const TABS = [
  { route: 'index', label: 'Home', Icon: Home },
  { route: 'schedule', label: 'Schedule', Icon: Calendar },
  { route: 'lms', label: 'LMS', Icon: BookOpen },
  { route: 'files', label: 'Files', Icon: FolderOpen },
  { route: 'chat', label: 'Chat', Icon: MessageCircle },
] as const;

function TabItem({
  label,
  Icon,
  isActive,
  onPress,
}: {
  label: string;
  Icon: typeof Home;
  isActive: boolean;
  onPress: () => void;
}) {
  const dotScale = useSharedValue(isActive ? 1 : 0);
  const pressScale = useSharedValue(1);

  React.useEffect(() => {
    dotScale.value = withSpring(isActive ? 1 : 0, Springs.snappy);
  }, [isActive]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    opacity: dotScale.value,
  }));

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const color = isActive ? '#0A0A0A' : '#A0A0A0';

  return (
    <Pressable
      onPressIn={() => { pressScale.value = withSpring(0.88, Springs.snappy); }}
      onPressOut={() => { pressScale.value = withSpring(1, Springs.snappy); }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{ flex: 1, alignItems: 'center', paddingTop: 8 }}
    >
      <Animated.View style={[{ alignItems: 'center', gap: 4 }, pressStyle]}>
        <Icon size={24} color={color} strokeWidth={isActive ? 2.2 : 1.8} />
        <Animated.View
          style={[
            { width: 4, height: 4, borderRadius: 2, backgroundColor: '#0A0A0A' },
            dotStyle,
          ]}
        />
        <Text
          style={{
            fontSize: 11,
            fontFamily: isActive ? 'Inter_500Medium' : 'Inter_400Regular',
            color,
            lineHeight: 16.5,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  // Build a set of currently active route names for highlighting
  const activeRouteName = state.routes[state.index]?.name;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 88,
      }}
    >
      <BlurView
        intensity={100}
        tint="systemChromeMaterialLight"
        experimentalBlurMethod="dimezisBlurView"
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.92)' : undefined,
        }}
      />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.06)' }} />
      <View style={{ flex: 1, flexDirection: 'row', paddingBottom: 20 }}>
        {TABS.map((tab) => (
          <TabItem
            key={tab.route}
            label={tab.label}
            Icon={tab.Icon}
            isActive={activeRouteName === tab.route}
            onPress={() => {
              const route = state.routes.find((r) => r.name === tab.route);
              if (route) {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!event.defaultPrevented) {
                  navigation.navigate(tab.route);
                }
              }
              // If route not in state, don't navigate (screen may have failed to load)
            }}
          />
        ))}
      </View>
    </View>
  );
}
