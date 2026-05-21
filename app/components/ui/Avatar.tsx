import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface AvatarProps {
  initials: string;
  size?: number;
  color?: string; // Optional predefined color, otherwise generated from initials
}

// Generate a deterministic color based on the initials string
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  // Ensure exactly 6 hex digits
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

export function Avatar({ initials, size = 24, color }: AvatarProps) {
  const displayInitials = initials.substring(0, 2);
  
  const backgroundColor = useMemo(() => {
    return color || stringToColor(initials);
  }, [initials, color]);

  // Proportional text size — floor prevents text from being too large
  const fontSize = Math.max(8, Math.floor(size * 0.38));

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            fontSize,
          },
        ]}
        numberOfLines={1}
      >
        {displayInitials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)', // Slight border for overlap contrast
  },
  text: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
