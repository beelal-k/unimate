// app/(tabs)/index.tsx
// Dashboard — polished summary with alerts, next class, deadlines, schedule, quick actions

import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Calendar, BookOpen, FolderOpen, MessageSquare, Plus, Upload,
  Clock, ArrowRight, Sparkles, AlertTriangle, Bell, ChevronRight, FileText,
} from 'lucide-react-native';

import { AnimatedScreen, StaggeredItem } from '../../components/ui/AnimatedScreen';
import { useScheduleStore } from '../../lib/store/useScheduleStore';
import { useLmsStore } from '../../lib/store/useLmsStore';
import { useFilesStore } from '../../lib/store/useFilesStore';
import { useChatStore } from '../../lib/store/useChatStore';
import { Springs } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen() {
  const router = useRouter();
  const { classes, loadClasses } = useScheduleStore();
  const { items: lmsItems, loadItems: loadLms, getUpcomingAssignments, getOverdueAssignments } = useLmsStore();
  const { nodes, loadNodes } = useFilesStore();
  const { conversations, loadConversations } = useChatStore();

  useEffect(() => {
    loadClasses();
    loadLms();
    loadNodes();
    loadConversations();
  }, []);

  const today = new Date();
  const dayOfWeek = today.getDay();

  const todaysClasses = useMemo(() =>
    classes.filter((c) => c.daysOfWeek.includes(dayOfWeek))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  , [classes, dayOfWeek]);

  const now = `${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}`;
  const nextClass = useMemo(() =>
    todaysClasses.find((c) => c.startTime > now) || null
  , [todaysClasses]);

  const upcomingDeadlines = useMemo(() => getUpcomingAssignments().slice(0, 5), [lmsItems]);
  const overdueItems = useMemo(() => getOverdueAssignments(), [lmsItems]);

  // Assignments due within 24 hours
  const urgentDeadlines = useMemo(() => {
    const cutoff = Date.now() + 24 * 60 * 60 * 1000;
    return upcomingDeadlines.filter((i) => i.dueDate && new Date(i.dueDate).getTime() <= cutoff);
  }, [upcomingDeadlines]);

  const recentFiles = useMemo(() =>
    nodes.filter((n) => n.type === 'file')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4)
  , [nodes]);

  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      <AnimatedScreen>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 108 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Greeting */}
          <StaggeredItem index={0}>
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0', letterSpacing: 0.3 }}>
                {dateStr}
              </Text>
              <Text style={{ fontSize: 30, fontFamily: 'Inter_700Bold', color: '#0A0A0A', letterSpacing: -0.5, marginTop: 4 }}>
                {getGreeting()} 👋
              </Text>
            </View>
          </StaggeredItem>

          {/* Alert Banner — Overdue */}
          {overdueItems.length > 0 && (
            <StaggeredItem index={1}>
              <Pressable
                onPress={() => router.push('/(tabs)/lms')}
                style={{
                  marginHorizontal: 20, marginTop: 8, marginBottom: 4,
                  backgroundColor: '#FEE2E2', borderRadius: 14,
                  paddingHorizontal: 16, paddingVertical: 14,
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  borderWidth: 1, borderColor: '#FECACA',
                }}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: '#DC2626',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <AlertTriangle size={18} color="#FFFFFF" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#991B1B' }}>
                    {overdueItems.length} overdue assignment{overdueItems.length > 1 ? 's' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#B91C1C', marginTop: 1 }}>
                    Tap to view in LMS
                  </Text>
                </View>
                <ChevronRight size={18} color="#DC2626" strokeWidth={2} />
              </Pressable>
            </StaggeredItem>
          )}

          {/* Alert Banner — Urgent (due within 24h) */}
          {urgentDeadlines.length > 0 && (
            <StaggeredItem index={overdueItems.length > 0 ? 2 : 1}>
              <Pressable
                onPress={() => router.push('/(tabs)/lms')}
                style={{
                  marginHorizontal: 20, marginTop: 8, marginBottom: 4,
                  backgroundColor: '#FEF3C7', borderRadius: 14,
                  paddingHorizontal: 16, paddingVertical: 14,
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  borderWidth: 1, borderColor: '#FDE68A',
                }}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: '#D97706',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bell size={16} color="#FFFFFF" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#92400E' }}>
                    {urgentDeadlines.length} due within 24 hours
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#B45309', marginTop: 1 }} numberOfLines={1}>
                    {urgentDeadlines.map((d) => d.title).join(', ')}
                  </Text>
                </View>
                <ChevronRight size={18} color="#D97706" strokeWidth={2} />
              </Pressable>
            </StaggeredItem>
          )}

          {/* Next Class Card */}
          {nextClass && (
            <StaggeredItem index={3}>
              <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
                <SectionHeader title="Up Next" />
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/schedule'); }}
                  style={{
                    backgroundColor: '#0A0A0A', borderRadius: 16,
                    padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14,
                  }}
                >
                  <View style={{ width: 4, borderRadius: 2, backgroundColor: nextClass.color === '#0A0A0A' ? '#FFFFFF' : nextClass.color, alignSelf: 'stretch' }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>
                      {nextClass.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Clock size={13} color="#A0A0A0" strokeWidth={1.6} />
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
                          {nextClass.startTime} – {nextClass.endTime}
                        </Text>
                      </View>
                      {nextClass.room && (
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>
                          📍 {nextClass.room}
                        </Text>
                      )}
                    </View>
                  </View>
                  <ArrowRight size={18} color="#6E6E6E" strokeWidth={1.8} />
                </Pressable>
              </View>
            </StaggeredItem>
          )}

          {/* Today's Schedule (when no next class) */}
          {todaysClasses.length > 0 && !nextClass && (
            <StaggeredItem index={3}>
              <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
                <SectionHeader title="Today's Classes" count={todaysClasses.length} onSeeAll={() => router.push('/(tabs)/schedule')} />
                <View style={{ backgroundColor: '#FAFAFA', borderRadius: 14, overflow: 'hidden' }}>
                  {todaysClasses.slice(0, 4).map((cls, i) => (
                    <View
                      key={cls.id}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingVertical: 12, paddingHorizontal: 14,
                        borderBottomWidth: i < Math.min(todaysClasses.length, 4) - 1 ? 1 : 0,
                        borderBottomColor: '#F0F0F0',
                      }}
                    >
                      <View style={{ width: 3, height: 28, borderRadius: 1.5, backgroundColor: cls.color }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#0A0A0A' }}>{cls.name}</Text>
                        {cls.room && <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#A0A0A0', marginTop: 1 }}>{cls.room}</Text>}
                      </View>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#6E6E6E' }}>
                        {cls.startTime}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </StaggeredItem>
          )}

          {/* Upcoming Deadlines */}
          {upcomingDeadlines.length > 0 && (
            <StaggeredItem index={4}>
              <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
                <SectionHeader title="Upcoming Deadlines" count={upcomingDeadlines.length} onSeeAll={() => router.push('/(tabs)/lms')} />
                <View style={{ backgroundColor: '#FAFAFA', borderRadius: 14, overflow: 'hidden' }}>
                  {upcomingDeadlines.map((item, i) => (
                    <Pressable
                      key={item.id}
                      onPress={() => router.push('/(tabs)/lms')}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingVertical: 12, paddingHorizontal: 14,
                        borderBottomWidth: i < upcomingDeadlines.length - 1 ? 1 : 0,
                        borderBottomColor: '#F0F0F0',
                      }}
                    >
                      <View style={{
                        width: 32, height: 32, borderRadius: 8,
                        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1, borderColor: '#E4E4E4',
                      }}>
                        <FileText size={14} color="#6E6E6E" strokeWidth={1.6} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#0A0A0A' }} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#A0A0A0', marginTop: 1 }}>
                          {item.courseName}
                        </Text>
                      </View>
                      {item.dueDate && (
                        <View style={{
                          backgroundColor: '#FFFFFF', borderRadius: 8,
                          paddingHorizontal: 8, paddingVertical: 4,
                          borderWidth: 1, borderColor: '#F0F0F0',
                        }}>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>
                            {formatShortDate(item.dueDate)}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>
            </StaggeredItem>
          )}

          {/* Recent Files */}
          {recentFiles.length > 0 && (
            <StaggeredItem index={5}>
              <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
                <SectionHeader title="Recent Files" onSeeAll={() => router.push('/(tabs)/files')} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {recentFiles.map((file) => (
                    <Pressable
                      key={file.id}
                      onPress={() => router.push('/(tabs)/files')}
                      style={{
                        backgroundColor: '#F9F9F9', borderRadius: 12,
                        paddingVertical: 14, paddingHorizontal: 14,
                        width: 120, alignItems: 'center', gap: 8,
                      }}
                    >
                      <FolderOpen size={20} color="#A0A0A0" strokeWidth={1.4} />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#0A0A0A', textAlign: 'center' }} numberOfLines={2}>
                        {file.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </StaggeredItem>
          )}

          {/* Quick Actions */}
          <StaggeredItem index={6}>
            <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 }}>
              <SectionHeader title="Quick Actions" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <QuickAction icon={<Sparkles size={20} color="#0A0A0A" strokeWidth={1.6} />} label="AI Chat" onPress={() => router.push('/(tabs)/chat')} />
                <QuickAction icon={<Upload size={20} color="#0A0A0A" strokeWidth={1.6} />} label="Upload" onPress={() => router.push('/(tabs)/files')} />
                <QuickAction icon={<Plus size={20} color="#0A0A0A" strokeWidth={1.6} />} label="Add Class" onPress={() => router.push('/(modals)/add-class')} />
              </View>
            </View>
          </StaggeredItem>
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  );
}

function SectionHeader({ title, count, onSeeAll }: { title: string; count?: number; onSeeAll?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>{title}</Text>
        {count !== undefined && (
          <View style={{ backgroundColor: '#F3F3F3', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#6E6E6E' }}>{count}</Text>
          </View>
        )}
      </View>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: '#6E6E6E' }}>See all</Text>
          <ChevronRight size={14} color="#6E6E6E" strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPressIn={() => { scale.value = withSpring(0.92, Springs.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, Springs.snappy); }}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={[style, {
        flex: 1, backgroundColor: '#F3F3F3', borderRadius: 14,
        paddingVertical: 18, alignItems: 'center', gap: 8,
      }]}
    >
      {icon}
      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#0A0A0A' }}>{label}</Text>
    </AnimatedPressable>
  );
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `${days}d left`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
