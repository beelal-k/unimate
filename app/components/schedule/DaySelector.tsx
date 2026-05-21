// components/schedule/DaySelector.tsx
// Multi-select day-of-week buttons

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Springs } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

interface DaySelectorProps {
  selected: number[];
  onChange: (days: number[]) => void;
}

function DayButton({
  day,
  isSelected,
  onToggle,
}: {
  day: { label: string; value: number };
  isSelected: boolean;
  onToggle: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.9, Springs.snappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, Springs.snappy);
      }}
      onPress={() => {
        Haptics.selectionAsync();
        onToggle();
      }}
      style={[
        animatedStyle,
        {
          width: 44,
          height: 44,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isSelected ? '#0A0A0A' : 'transparent',
          borderWidth: isSelected ? 0 : 1,
          borderColor: '#E4E4E4',
        },
      ]}
    >
      <Text
        style={{
          fontSize: 13,
          fontFamily: isSelected ? 'Inter_600SemiBold' : 'Inter_400Regular',
          color: isSelected ? '#FFFFFF' : '#6E6E6E',
        }}
      >
        {day.label}
      </Text>
    </AnimatedPressable>
  );
}

export function DaySelector({ selected, onChange }: DaySelectorProps) {
  const handleToggle = useCallback(
    (value: number) => {
      if (selected.includes(value)) {
        onChange(selected.filter((d) => d !== value));
      } else {
        onChange([...selected, value]);
      }
    },
    [selected, onChange]
  );

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 12,
          fontFamily: 'Inter_500Medium',
          color: '#6E6E6E',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        Days of Week
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {DAYS.map((day) => (
          <DayButton
            key={day.value}
            day={day}
            isSelected={selected.includes(day.value)}
            onToggle={() => handleToggle(day.value)}
          />
        ))}
      </View>
    </View>
  );
}
