// components/schedule/ClassCard.tsx
// Color-coded class card with press animation and swipe-to-delete

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import { MapPin, Clock, User, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Springs, AnimationConfig } from '../../lib/theme';
import type { ClassItem } from '../../lib/store/useScheduleStore';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ClassCardProps {
  classItem: ClassItem;
  onPress: () => void;
  index?: number;
}

export function ClassCard({ classItem, onPress, index = 0 }: ClassCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
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

  const daysText = classItem.daysOfWeek
    .sort((a, b) => a - b)
    .map((d) => DAYS_SHORT[d])
    .join(', ');

  const timeText = `${classItem.startTime} – ${classItem.endTime}`;

  return (
    <AnimatedPressable
      entering={FadeIn.delay(Math.min(index, 6) * 40).duration(300)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[
        animatedStyle,
        {
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: '#E4E4E4',
          borderRadius: 16,
          padding: 16,
          marginBottom: 12,
          flexDirection: 'row',
          overflow: 'hidden',
        },
      ]}
    >
      {/* Color bar */}
      <View
        style={{
          width: 4,
          borderRadius: 2,
          backgroundColor: classItem.color,
          marginRight: 12,
          alignSelf: 'stretch',
        }}
      />

      {/* Content */}
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            style={{
              fontSize: 18,
              fontFamily: 'Inter_600SemiBold',
              color: '#0A0A0A',
              flex: 1,
            }}
            numberOfLines={1}
          >
            {classItem.name}
          </Text>
          <ChevronRight size={18} color="#A0A0A0" />
        </View>

        {classItem.code && (
          <Text
            style={{
              fontSize: 13,
              fontFamily: 'Inter_500Medium',
              color: '#6E6E6E',
            }}
          >
            {classItem.code}
          </Text>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Clock size={14} color="#A0A0A0" strokeWidth={1.8} />
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>
              {timeText}
            </Text>
          </View>

          {classItem.room && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MapPin size={14} color="#A0A0A0" strokeWidth={1.8} />
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>
                {classItem.room}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#A0A0A0', letterSpacing: 0.8 }}>
            {daysText}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}
