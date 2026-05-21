// components/lms/AssignmentItem.tsx
// Assignment list item with status badge, attachments, expandable detail

import React, { useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import { FileText, Clock, Paperclip, Download, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Springs, AnimationConfig } from '../../lib/theme';
import type { LmsItem, LmsAttachment } from '../../lib/store/useLmsStore';
import { useLmsStore } from '../../lib/store/useLmsStore';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface AssignmentItemProps {
  item: LmsItem;
  onPress?: () => void;
  index?: number;
}

function getStatusBadge(status: string) {
  const styles = {
    overdue: { bg: '#0A0A0A', text: '#FFFFFF', label: 'Overdue' },
    upcoming: { bg: '#F3F3F3', text: '#6E6E6E', label: 'Upcoming' },
    submitted: { bg: '#E4E4E4', text: '#0A0A0A', label: 'Submitted' },
    graded: { bg: '#E4E4E4', text: '#0A0A0A', label: 'Graded' },
  };
  const s = styles[status as keyof typeof styles] || styles.upcoming;
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: s.text }}>{s.label}</Text>
    </View>
  );
}

function normalizeDate(d: Date): Date {
  // Returns a date set to midnight local time for pure day comparisons
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return 'No due date';
  const date = new Date(dueDate);
  const now = new Date();
  
  // Calculate raw difference in calendar days
  const todayNormalized = normalizeDate(now);
  const dueNormalized = normalizeDate(date);
  const diffDays = Math.round((dueNormalized.getTime() - todayNormalized.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate exact time format (e.g. "11:59 PM")
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (date.getTime() < now.getTime()) {
    return 'Overdue';
  }
  
  if (diffDays === 0) return `Today, ${timeStr}`;
  if (diffDays === 1) return `Tomorrow, ${timeStr}`;
  if (diffDays <= 7) return `${diffDays} days left, ${timeStr}`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function openAttachment(att: LmsAttachment) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  Linking.openURL(att.fileurl).catch(() => {});
}

export function AssignmentItem({ item, onPress, index = 0 }: AssignmentItemProps) {
  const router = useRouter();
  const { toggleItemDone } = useLmsStore();
  const scale = useSharedValue(1);
  const checkScale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  const hasAttachments = item.attachments && item.attachments.length > 0;

  const handleToggleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    checkScale.value = withSpring(0.8, Springs.snappy, () => {
      checkScale.value = withSpring(1, Springs.snappy);
    });
    toggleItemDone(item.id, !item.isDone);
  };

  return (
    <Animated.View entering={FadeIn.delay(Math.min(index, 6) * 40).duration(300)}>
      <AnimatedPressable
        onPressIn={() => { scale.value = withSpring(AnimationConfig.cardPressScale, Springs.snappy); }}
        onPressOut={() => { scale.value = withSpring(1, Springs.snappy); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (onPress) {
            onPress();
          } else {
            router.push(`/(modals)/assignment?id=${item.id}` as any);
          }
        }}
        style={[pressStyle, {
          paddingVertical: 14, paddingHorizontal: 16,
          borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
        }]}
      >
        {/* Main row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <AnimatedPressable
            onPress={handleToggleDone}
            style={[checkStyle, {
              width: 24, height: 24, borderRadius: 6,
              borderWidth: 2, borderColor: item.isDone ? '#0A0A0A' : '#D4D4D4',
              backgroundColor: item.isDone ? '#0A0A0A' : 'transparent',
              alignItems: 'center', justifyContent: 'center',
              marginTop: 4,
            }]}
          >
            {item.isDone && <Animated.View entering={FadeIn.duration(150)}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' }} /></Animated.View>}
          </AnimatedPressable>

          {/* Text content — takes remaining space */}
          <View style={{ flex: 1, gap: 4, opacity: item.isDone ? 0.6 : 1 }}>
            <Text style={{ 
              fontSize: 14, fontFamily: 'Inter_500Medium', color: '#0A0A0A',
              textDecorationLine: item.isDone ? 'line-through' : 'none'
            }} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }} numberOfLines={1}>
              {item.courseName}
            </Text>
            {/* Due date + attachments row below title */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Clock size={11} color="#A0A0A0" strokeWidth={1.6} />
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>
                {formatDueDate(item.dueDate)}
              </Text>
              {hasAttachments && (
                <>
                  <Text style={{ fontSize: 11, color: '#E4E4E4' }}>•</Text>
                  <Paperclip size={10} color="#A0A0A0" strokeWidth={1.6} />
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
                    {item.attachments.length}
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Status badge + chevron right aligned */}
          <View style={{ alignItems: 'flex-end', gap: 6, paddingTop: 2 }}>
            {item.isDone ? getStatusBadge('submitted') : getStatusBadge(item.status)}
            <ChevronRight size={16} color="#A0A0A0" strokeWidth={2} />
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}
