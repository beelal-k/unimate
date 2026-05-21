// components/ui/Card.tsx
// Card component with 1px border, press animation, optional chevron

import React, { useCallback } from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Springs, AnimationConfig } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  style?: ViewStyle;
}

export function Card({ children, onPress, showChevron = false, style }: CardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (onPress) {
      scale.value = withSpring(AnimationConfig.cardPressScale, Springs.snappy);
    }
  }, [onPress]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, Springs.snappy);
  }, []);

  const handlePress = useCallback(() => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  }, [onPress]);

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={!onPress}
      style={[
        animatedStyle,
        {
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: '#E4E4E4',
          borderRadius: 16,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
        },
        style,
      ]}
    >
      <View style={{ flex: 1 }}>{children}</View>
      {showChevron && onPress && (
        <ChevronRight size={20} color="#A0A0A0" />
      )}
    </AnimatedPressable>
  );
}
