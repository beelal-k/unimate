// components/files/BreadcrumbBar.tsx
// Breadcrumb navigation for file library

import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Home, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { FileNode } from '../../lib/store/useFilesStore';

interface BreadcrumbBarProps {
  breadcrumbs: FileNode[];
  onNavigate: (folderId: string | null) => void;
}

export function BreadcrumbBar({ breadcrumbs, onNavigate }: BreadcrumbBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{
        maxHeight: 40,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
      }}
      contentContainerStyle={{
        alignItems: 'center',
        paddingHorizontal: 20,
        gap: 4,
      }}
    >
      {/* Root */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onNavigate(null);
        }}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 4,
        }}
      >
        <Home
          size={16}
          color={breadcrumbs.length === 0 ? '#0A0A0A' : '#A0A0A0'}
          strokeWidth={1.8}
        />
      </Pressable>

      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        return (
          <View key={crumb.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ChevronRight size={14} color="#A0A0A0" />
            <Pressable
              onPress={() => {
                if (!isLast) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onNavigate(crumb.id);
                }
              }}
              disabled={isLast}
              style={{ paddingVertical: 8, paddingHorizontal: 4 }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: isLast ? 'Inter_600SemiBold' : 'Inter_400Regular',
                  color: isLast ? '#0A0A0A' : '#A0A0A0',
                }}
                numberOfLines={1}
              >
                {crumb.name}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}
