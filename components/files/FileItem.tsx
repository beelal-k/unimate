// components/files/FileItem.tsx
// File list item with icon, metadata, press animation

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import { File, FileText, Image, FileSpreadsheet, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Springs, AnimationConfig } from '../../lib/theme';
import type { FileNode } from '../../lib/store/useFilesStore';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface FileItemProps {
  file: FileNode;
  onPress: () => void;
  onLongPress?: () => void;
  isSelected?: boolean;
  index?: number;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <File size={24} color="#6E6E6E" strokeWidth={1.6} />;
  if (mimeType.startsWith('image/')) return <Image size={24} color="#6E6E6E" strokeWidth={1.6} />;
  if (mimeType.includes('pdf')) return <FileText size={24} color="#6E6E6E" strokeWidth={1.6} />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))
    return <FileSpreadsheet size={24} color="#6E6E6E" strokeWidth={1.6} />;
  return <FileText size={24} color="#6E6E6E" strokeWidth={1.6} />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileItem({ file, onPress, onLongPress, isSelected = false, index = 0 }: FileItemProps) {
  const scale = useSharedValue(1);

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
    onPress();
  }, [onPress]);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onLongPress();
    }
  }, [onLongPress]);

  const ext = file.name.split('.').pop()?.toUpperCase() || '';

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
      {getFileIcon(file.mimeType)}

      <View style={{ flex: 1, marginLeft: 12, gap: 2 }}>
        <Text
          style={{
            fontSize: 15,
            fontFamily: 'Inter_400Regular',
            color: '#0A0A0A',
          }}
          numberOfLines={1}
        >
          {file.name}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontFamily: 'Inter_400Regular',
            color: '#A0A0A0',
          }}
        >
          {[ext, formatFileSize(file.sizeBytes)].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {isSelected && (
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
      )}
    </AnimatedPressable>
  );
}
