// components/ui/Input.tsx
// Outlined input with animated floating label, focus/error states

import React, { useState, useCallback, useEffect } from 'react';
import { TextInput, View, Text, TextInputProps, Pressable } from 'react-native';
import * as Icons from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  value: string;
  onChangeText: (text: string) => void;
  rightAccessory?: React.ReactNode;
  rightIcon?: keyof typeof Icons;
  onRightIconPress?: () => void;
}

export function Input({ label, error, value, onChangeText, rightAccessory, rightIcon, onRightIconPress, ...rest }: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const focusAnim = useSharedValue(value ? 1 : 0);
  const borderAnim = useSharedValue(0);

  useEffect(() => {
    if (isFocused || value) {
      focusAnim.value = withTiming(1, { duration: 150 });
    } else {
      focusAnim.value = withTiming(0, { duration: 150 });
    }
  }, [isFocused, value]);

  useEffect(() => {
    borderAnim.value = withTiming(isFocused ? 1 : 0, { duration: 150 });
  }, [isFocused]);

  const labelStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: 14,
    top: interpolate(focusAnim.value, [0, 1], [16, -8]),
    fontSize: interpolate(focusAnim.value, [0, 1], [15, 12]),
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 4,
    zIndex: 1,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    borderWidth: interpolate(borderAnim.value, [0, 1], [1, 1.5]),
    borderColor: error
      ? '#EF4444'
      : interpolateColor(borderAnim.value, [0, 1], ['#E4E4E4', '#C0C0C0']),
  }));

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);

  const RightIconComponent = rightIcon ? (Icons[rightIcon] as React.ElementType) : null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Animated.View
        style={[
          containerStyle,
          {
            height: 52,
            borderRadius: 10,
            justifyContent: 'center',
            flexDirection: 'row',
            alignItems: 'center',
          },
        ]}
      >
        <Animated.Text
          style={[
            labelStyle,
            {
              fontFamily: 'Inter_400Regular',
              color: error ? '#EF4444' : isFocused ? '#0A0A0A' : '#A0A0A0',
            },
          ]}
        >
          {label}
        </Animated.Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{
            flex: 1,
            height: '100%',
            paddingLeft: 14,
          paddingRight: (rightAccessory || rightIcon) ? 8 : 14,
          fontSize: 15,
          fontFamily: 'Inter_400Regular',
          color: '#0A0A0A',
        }}
        placeholderTextColor="#A0A0A0"
        {...rest}
      />
      {rightAccessory && (
        <View style={{ paddingRight: 12 }}>{rightAccessory}</View>
      )}
      {RightIconComponent && (
        <Pressable 
          onPress={onRightIconPress} 
          style={{ paddingRight: 14, paddingLeft: 4, height: '100%', justifyContent: 'center' }}
          hitSlop={8}
        >
          <RightIconComponent size={20} color="#A0A0A0" />
        </Pressable>
      )}
    </Animated.View>
      {error && (
        <Animated.Text
          style={{
            fontSize: 12,
            fontFamily: 'Inter_400Regular',
            color: '#EF4444',
            marginTop: 4,
            marginLeft: 4,
          }}
        >
          {error}
        </Animated.Text>
      )}
    </View>
  );
}
