// components/ui/Button.tsx
// Primary, Secondary, Ghost, Destructive button variants with Reanimated press animation

import React, { useCallback } from 'react';
import { Text, ActivityIndicator, Pressable, ViewStyle, TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Springs, AnimationConfig } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const getStyles = (variant: ButtonVariant, disabled: boolean) => {
  const base: ViewStyle = {
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  };

  const text: TextStyle = {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  };

  switch (variant) {
    case 'primary':
      return {
        container: { ...base, backgroundColor: disabled ? '#A0A0A0' : '#0A0A0A' },
        text: { ...text, color: '#FFFFFF' },
      };
    case 'secondary':
      return {
        container: { ...base, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#E4E4E4' },
        text: { ...text, color: disabled ? '#A0A0A0' : '#0A0A0A' },
      };
    case 'ghost':
      return {
        container: { ...base, backgroundColor: 'transparent' },
        text: { ...text, color: disabled ? '#A0A0A0' : '#0A0A0A' },
      };
    case 'destructive':
      return {
        container: { ...base, backgroundColor: disabled ? '#A0A0A0' : '#EF4444' },
        text: { ...text, color: '#FFFFFF' },
      };
  }
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const styles = getStyles(variant, disabled || loading);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(AnimationConfig.pressScale, Springs.snappy);
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, Springs.snappy);
  }, []);

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [disabled, loading, onPress]);

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[
        animatedStyle,
        styles.container,
        fullWidth && { width: '100%' },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'secondary' || variant === 'ghost' ? '#0A0A0A' : '#FFFFFF'}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={styles.text}>{title}</Text>
        </>
      )}
    </AnimatedPressable>
  );
}
