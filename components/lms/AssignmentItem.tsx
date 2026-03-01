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
import { FileText, Clock, Paperclip, Download, ChevronDown, ChevronUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Springs, AnimationConfig } from '../../lib/theme';
import type { LmsItem, LmsAttachment } from '../../lib/store/useLmsStore';

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

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return 'No due date';
  const date = new Date(dueDate);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `${days}d left`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const [expanded, setExpanded] = useState(false);
  const hasAttachments = item.attachments && item.attachments.length > 0;

  return (
    <Animated.View entering={FadeIn.delay(Math.min(index, 6) * 40).duration(300)}>
      <AnimatedPressable
        onPressIn={() => { scale.value = withSpring(AnimationConfig.cardPressScale, Springs.snappy); }}
        onPressOut={() => { scale.value = withSpring(1, Springs.snappy); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (hasAttachments || item.description) {
            setExpanded(!expanded);
          } else if (onPress) {
            onPress();
          }
        }}
        style={[pressStyle, {
          paddingVertical: 14, paddingHorizontal: 16,
          borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
        }]}
      >
        {/* Main row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center',
            marginTop: 2,
          }}>
            <FileText size={16} color="#6E6E6E" strokeWidth={1.6} />
          </View>

          {/* Text content — takes remaining space */}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#0A0A0A' }} numberOfLines={2}>
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

          {/* Status badge + expand aligned to right, stacked vertically */}
          <View style={{ alignItems: 'flex-end', gap: 6, paddingTop: 2 }}>
            {getStatusBadge(item.status)}
            {(hasAttachments || item.description) && (
              expanded
                ? <ChevronUp size={14} color="#A0A0A0" strokeWidth={2} />
                : <ChevronDown size={14} color="#A0A0A0" strokeWidth={2} />
            )}
          </View>
        </View>

        {/* Expanded section */}
        {expanded && (
          <View style={{ marginTop: 12, marginLeft: 48, gap: 8 }}>
            {item.description && (
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6E6E6E', lineHeight: 18 }} numberOfLines={4}>
                {item.description}
              </Text>
            )}
            {hasAttachments && (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Attachments
                </Text>
                {item.attachments.map((att, i) => (
                  <Pressable
                    key={i}
                    onPress={() => openAttachment(att)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: '#F9F9F9', borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 8,
                    }}
                  >
                    <Download size={14} color="#0A0A0A" strokeWidth={1.8} />
                    <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#0A0A0A' }} numberOfLines={1}>
                      {att.filename}
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
                      {formatFileSize(att.filesize)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </AnimatedPressable>
    </Animated.View>
  );
}
