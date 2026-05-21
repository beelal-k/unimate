// components/files/FolderItem.tsx
// Folder list item with press animation and selection support

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import { Folder, ChevronRight, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Springs, AnimationConfig } from '../../lib/theme';
import type { FileNode } from '../../lib/store/useFilesStore';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface FolderItemProps {
  folder: FileNode;
  onPress: () => void;
  onLongPress?: () => void;
  isSelected?: boolean;
  index?: number;
}

export function FolderItem({ folder, onPress, onLongPress, isSelected = false, index = 0 }: FolderItemProps) {
  const scale = useSharedValue(1);
  const iconScale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(AnimationConfig.cardPressScale, Springs.snappy);
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, Springs.snappy);
  }, []);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Brief icon scale bounce
    iconScale.value = withSpring(1.1, Springs.snappy, () => {
      iconScale.value = withSpring(1, Springs.smooth);
    });
    onPress();
  }, [onPress]);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onLongPress();
    }
  }, [onLongPress]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <AnimatedPressable
      entering={FadeIn.delay(Math.min(index, 6) * 40).duration(300)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={[
        pressStyle,
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#F0F0F0',
          backgroundColor: isSelected ? '#F3F3F3' : 'transparent',
        },
      ]}
    >
      <Animated.View style={iconStyle}>
        <Folder size={24} color="#0A0A0A" strokeWidth={1.6} fill={isSelected ? '#E4E4E4' : 'none'} />
      </Animated.View>

      <Text
        style={{
          flex: 1,
          marginLeft: 12,
          fontSize: 15,
          fontFamily: 'Inter_500Medium',
          color: '#0A0A0A',
        }}
        numberOfLines={1}
      >
        {folder.name}
      </Text>

      {isSelected ? (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: '#0A0A0A',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
        </View>
      ) : (
        <ChevronRight size={18} color="#A0A0A0" />
      )}
    </AnimatedPressable>
  );
}
