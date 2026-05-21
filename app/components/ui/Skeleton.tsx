// components/ui/Skeleton.tsx
// Shimmer skeleton loader using Reanimated

import React, { useEffect } from 'react';
import { View, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.7, 0.3]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: '#F0F0F0',
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

// Pre-built skeleton patterns
export function SkeletonCard() {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#F0F0F0',
        borderRadius: 16,
        padding: 16,
        gap: 12,
        marginBottom: 12,
      }}
    >
      <Skeleton width="60%" height={18} />
      <Skeleton width="40%" height={14} />
      <Skeleton width="100%" height={14} />
    </View>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}
