// components/schedule/ColorPicker.tsx
// Monochromatic color swatch picker

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Springs } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Monochromatic swatches from spec — shades from #0A0A0A to #A0A0A0
const COLORS = [
  '#0A0A0A',
  '#1A1A1A',
  '#2A2A2A',
  '#3A3A3A',
  '#4A4A4A',
  '#5A5A5A',
  '#6E6E6E',
  '#808080',
  '#909090',
  '#A0A0A0',
];

interface ColorPickerProps {
  selected: string;
  onChange: (color: string) => void;
}

function ColorSwatch({
  color,
  isSelected,
  onPress,
}: {
  color: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.85, Springs.snappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, Springs.snappy);
      }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[
        animatedStyle,
        {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: isSelected ? 2 : 0,
          borderColor: '#FFFFFF',
          // Outer ring for selected
          ...(isSelected && {
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 2,
          }),
        },
      ]}
    >
      {isSelected && <Check size={18} color="#FFFFFF" strokeWidth={2.5} />}
    </AnimatedPressable>
  );
}

export function ColorPicker({ selected, onChange }: ColorPickerProps) {
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
        Color
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {COLORS.map((color) => (
          <ColorSwatch
            key={color}
            color={color}
            isSelected={selected === color}
            onPress={() => onChange(color)}
          />
        ))}
      </View>
    </View>
  );
}
