// components/ui/AnimatedScreen.tsx
// Wrapper that provides staggered fade-up entry animation for screen content

import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { Springs } from '../../lib/theme';

interface AnimatedScreenProps {
  children: React.ReactNode;
  delay?: number;
}

export function AnimatedScreen({ children, delay = 0 }: AnimatedScreenProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withDelay(delay, withSpring(1, Springs.gentle));
    translateY.value = withDelay(delay, withSpring(0, Springs.gentle));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[{ flex: 1 }, animatedStyle]}>{children}</Animated.View>;
}

interface StaggeredItemProps {
  children: React.ReactNode;
  index: number;
  staggerDelay?: number;
}

export function StaggeredItem({ children, index, staggerDelay = 40 }: StaggeredItemProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);
  const delay = Math.min(index, 6) * staggerDelay;

  useEffect(() => {
    opacity.value = withDelay(delay, withSpring(1, Springs.smooth));
    translateY.value = withDelay(delay, withSpring(0, Springs.smooth));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
