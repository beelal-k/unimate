// components/ui/Badge.tsx
// Monochromatic badge with overdue variant

import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';

type BadgeVariant = 'default' | 'overdue' | 'warning' | 'done';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const getStyles = (variant: BadgeVariant): { container: ViewStyle; text: TextStyle } => {
  const base: ViewStyle = {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  };

  const textBase: TextStyle = {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.8,
  };

  switch (variant) {
    case 'overdue':
      return {
        container: { ...base, backgroundColor: 'rgba(239, 68, 68, 0.12)' },
        text: { ...textBase, color: '#EF4444' },
      };
    case 'warning':
      return {
        container: { ...base, backgroundColor: '#F3F3F3' },
        text: { ...textBase, color: '#999999' },
      };
    case 'done':
      return {
        container: { ...base, backgroundColor: '#F3F3F3' },
        text: { ...textBase, color: '#BBBBBB' },
      };
    case 'default':
    default:
      return {
        container: { ...base, backgroundColor: '#F3F3F3' },
        text: { ...textBase, color: '#0A0A0A' },
      };
  }
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  const styles = getStyles(variant);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}
