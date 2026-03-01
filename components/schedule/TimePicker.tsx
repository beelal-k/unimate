// components/schedule/TimePicker.tsx
// Simple time picker with hour and minute scroll selectors

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';

interface TimePickerProps {
  label: string;
  value: string; // 'HH:MM'
  onChange: (time: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function TimeValue({
  value,
  isSelected,
  onPress,
}: {
  value: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={{
        width: 52,
        height: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isSelected ? '#0A0A0A' : 'transparent',
      }}
    >
      <Text
        style={{
          fontSize: 15,
          fontFamily: isSelected ? 'Inter_600SemiBold' : 'Inter_400Regular',
          color: isSelected ? '#FFFFFF' : '#6E6E6E',
        }}
      >
        {value}
      </Text>
    </Pressable>
  );
}

export function TimePicker({ label, value, onChange }: TimePickerProps) {
  const [hour, minute] = value.split(':').map(Number);
  const [showPicker, setShowPicker] = useState(false);

  const handleHourChange = useCallback(
    (h: number) => {
      onChange(`${pad(h)}:${pad(minute)}`);
    },
    [minute, onChange]
  );

  const handleMinuteChange = useCallback(
    (m: number) => {
      onChange(`${pad(hour)}:${pad(m)}`);
    },
    [hour, onChange]
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
        }}
      >
        {label}
      </Text>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowPicker(!showPicker);
        }}
        style={{
          height: 52,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: showPicker ? '#C0C0C0' : '#E4E4E4',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontFamily: 'Inter_600SemiBold',
            color: '#0A0A0A',
            letterSpacing: 1,
          }}
        >
          {value}
        </Text>
      </Pressable>

      {showPicker && (
        <View
          style={{
            flexDirection: 'row',
            gap: 16,
            backgroundColor: '#F9F9F9',
            borderRadius: 12,
            padding: 12,
          }}
        >
          {/* Hours */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: 'Inter_500Medium',
                color: '#A0A0A0',
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              Hour
            </Text>
            <ScrollView
              style={{ maxHeight: 200 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'center', gap: 2 }}
            >
              {HOURS.map((h) => (
                <TimeValue
                  key={h}
                  value={pad(h)}
                  isSelected={h === hour}
                  onPress={() => handleHourChange(h)}
                />
              ))}
            </ScrollView>
          </View>

          {/* Minutes */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: 'Inter_500Medium',
                color: '#A0A0A0',
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              Minute
            </Text>
            <ScrollView
              style={{ maxHeight: 200 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'center', gap: 2 }}
            >
              {MINUTES.map((m) => (
                <TimeValue
                  key={m}
                  value={pad(m)}
                  isSelected={m === minute}
                  onPress={() => handleMinuteChange(m)}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}
