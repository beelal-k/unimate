// components/ui/EmptyState.tsx
// Minimalist empty state with icon, heading, caption, and optional CTA

import React from 'react';
import { View, Text } from 'react-native';
import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingVertical: 64,
        gap: 16,
      }}
    >
      <View style={{ marginBottom: 8 }}>{icon}</View>
      <Text
        style={{
          fontSize: 18,
          fontFamily: 'Inter_600SemiBold',
          color: '#0A0A0A',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontFamily: 'Inter_400Regular',
          color: '#6E6E6E',
          textAlign: 'center',
          lineHeight: 19.5,
        }}
      >
        {description}
      </Text>
      {actionLabel && onAction && (
        <View style={{ marginTop: 8 }}>
          <Button title={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      )}
    </View>
  );
}
