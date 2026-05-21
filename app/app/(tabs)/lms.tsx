// app/(tabs)/lms.tsx
// LMS screen with overdue filter, course filter, assignment groups, attachments

import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, SectionList, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  BookOpen, RefreshCw, LogOut, AlertTriangle, Clock, CheckCircle2, Wifi,
  Eye, EyeOff, Filter, Settings2,
} from 'lucide-react-native';
import { ChevronDown, ChevronRight, Pin, PinOff } from 'lucide-react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';

import { AnimatedScreen } from '../../components/ui/AnimatedScreen';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonList } from '../../components/ui/Skeleton';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { AssignmentItem } from '../../components/lms/AssignmentItem';
import { useLmsStore, type LmsItem } from '../../lib/store/useLmsStore';
import { useToast } from '../../components/ui/Toast';

export default function LmsScreen() {
  const {
    items, courses, isLoading, isSyncing, isConnected, lastSyncAt,
    loadItems, checkConnection, connectMoodle, disconnectMoodle, syncFromMoodle, toggleCoursePin, toggleCourseDisable,
    getUpcomingAssignments, getOverdueAssignments, getCompletedAssignments, getArchivedCourseItems,
    manuallyDisabledCourseIds, manuallyPinnedCourseIds, courseCategories, isCourseEnabled
  } = useLmsStore();

  const { showToast } = useToast();
  const [showLoginSheet, setShowLoginSheet] = useState(false);
  const [siteUrl, setSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filter state
  type FilterMode = 'all' | 'overdue' | 'old';
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showCourseSettings, setShowCourseSettings] = useState(false);
  const [oldCoursesExpanded, setOldCoursesExpanded] = useState(false);

  useEffect(() => {
    checkConnection().then((connected: boolean) => {
      if (connected) loadItems();
    });
  }, []);

  const handleConnect = useCallback(async () => {
    if (!siteUrl.trim() || !username.trim() || !password.trim()) {
      showToast('Fill in all fields', 'error');
      return;
    }
    let normalizedUrl = siteUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    setConnecting(true);
    try {
      await connectMoodle(normalizedUrl, username.trim(), password.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Connected to Moodle!', 'success');
      setShowLoginSheet(false);
      setSiteUrl(''); setUsername(''); setPassword('');
      await syncFromMoodle();
      showToast('Synced assignments', 'success');
    } catch (error: any) {
      showToast(error.message || 'Connection failed', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setConnecting(false);
    }
  }, [siteUrl, username, password]);

  const handleSync = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await syncFromMoodle();
      showToast('Synced!', 'success');
    } catch (error: any) {
      showToast(error.message || 'Sync failed', 'error');
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await syncFromMoodle(); } catch {}
    setRefreshing(false);
  }, []);

  // Filtered data
  const upcoming = useMemo(() => getUpcomingAssignments(), [items, manuallyDisabledCourseIds, manuallyPinnedCourseIds]);
  const overdue = useMemo(() => getOverdueAssignments(), [items, manuallyDisabledCourseIds, manuallyPinnedCourseIds]);
  const completed = useMemo(() => getCompletedAssignments(), [items, manuallyDisabledCourseIds, manuallyPinnedCourseIds]);
  const archivedItems = useMemo(() => getArchivedCourseItems(), [items, manuallyDisabledCourseIds, manuallyPinnedCourseIds, courseCategories]);

  const sections = useMemo(() => {
    const s = [];
    if (filterMode === 'all') {
      if (upcoming.length > 0) s.push({ title: 'Upcoming', icon: <Clock size={16} color="#6E6E6E" strokeWidth={1.8} />, data: upcoming });
      if (completed.length > 0) s.push({ title: 'Completed', icon: <CheckCircle2 size={16} color="#A0A0A0" strokeWidth={1.8} />, data: completed });
    } else if (filterMode === 'overdue') {
      if (overdue.length > 0) s.push({ title: 'Overdue', icon: <AlertTriangle size={16} color="#EF4444" strokeWidth={1.8} />, data: overdue });
    } else if (filterMode === 'old') {
      Object.entries(archivedItems).forEach(([courseName, list]) => {
        const course = courses.find((c: any) => c.fullname === courseName || c.shortname === courseName);
        s.push({ 
          title: courseName, 
          icon: <BookOpen size={16} color="#A0A0A0" strokeWidth={1.8} />, 
          data: list,
          isArchivedCourse: true,
          courseObj: course
        });
      });
    }
    return s;
  }, [filterMode, upcoming, completed, overdue, archivedItems, courses]);

  const heightValue = useSharedValue(0);
  const opacityValue = useSharedValue(0);

  useEffect(() => {
    heightValue.value = withSpring(oldCoursesExpanded ? 1 : 0, { damping: 15, stiffness: 100 });
    opacityValue.value = withSpring(oldCoursesExpanded ? 1 : 0, { damping: 15, stiffness: 100 });
  }, [oldCoursesExpanded]);

  const expandedStyle = useAnimatedStyle(() => ({
    height: oldCoursesExpanded ? 'auto' : 0,
    opacity: opacityValue.value,
    overflow: 'hidden'
  }));

  const renderFilterHeader = () => (
    <View style={{ paddingHorizontal: 20, paddingBottom: 8, gap: 10 }}>
      {filterMode === 'all' && (
      <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
        {courses.length} course{courses.length > 1 ? 's' : ''} · {items.filter((i: any) => i.type === 'assignment').length} assignments
        {lastSyncAt && ` · ${new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
      </Text>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCourseSettings(true);
          }}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 20, borderWidth: 1, backgroundColor: '#FFFFFF', borderColor: '#E4E4E4',
          }}
        >
          <Settings2 size={14} color="#6E6E6E" strokeWidth={1.8} />
          <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#6E6E6E' }}>Courses</Text>
        </Pressable>
        
        {/* Chips */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFilterMode('all');
          }}
          style={{
            paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 20, borderWidth: 1,
            backgroundColor: filterMode === 'all' ? '#0A0A0A' : '#FAFAFA',
            borderColor: filterMode === 'all' ? '#0A0A0A' : '#E4E4E4',
          }}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: filterMode === 'all' ? '#FFFFFF' : '#6E6E6E' }}>All</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFilterMode('overdue');
          }}
          style={{
            paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 20, borderWidth: 1,
            backgroundColor: filterMode === 'overdue' ? '#0A0A0A' : '#FAFAFA',
            borderColor: filterMode === 'overdue' ? '#0A0A0A' : '#E4E4E4',
          }}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: filterMode === 'overdue' ? '#FFFFFF' : '#6E6E6E' }}>Overdue ({overdue.length})</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFilterMode('old');
          }}
          style={{
            paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 20, borderWidth: 1,
            backgroundColor: filterMode === 'old' ? '#0A0A0A' : '#FAFAFA',
            borderColor: filterMode === 'old' ? '#0A0A0A' : '#E4E4E4',
          }}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: filterMode === 'old' ? '#FFFFFF' : '#6E6E6E' }}>Old Courses</Text>
        </Pressable>
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      <AnimatedScreen>
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
          }}>
            <Text style={{ fontSize: 32, fontFamily: 'Inter_700Bold', color: '#0A0A0A', letterSpacing: -0.5 }}>
              LMS
            </Text>
            {isConnected && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={handleSync}
                  disabled={isSyncing}
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    borderWidth: 1, borderColor: '#E4E4E4',
                    alignItems: 'center', justifyContent: 'center',
                    opacity: isSyncing ? 0.5 : 1,
                  }}
                >
                  <RefreshCw size={18} color="#0A0A0A" strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  onPress={() => disconnectMoodle().then(() => showToast('Disconnected', 'info'))}
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    borderWidth: 1, borderColor: '#E4E4E4',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <LogOut size={18} color="#0A0A0A" strokeWidth={1.8} />
                </Pressable>
              </View>
            )}
          </View>

          {!isConnected ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
              <EmptyState
                icon={<Wifi size={64} color="#A0A0A0" strokeWidth={1.2} />}
                title="Connect to Moodle"
                description="Link your university's Moodle LMS to sync courses, assignments, and grades."
                actionLabel="Connect Moodle"
                onAction={() => setShowLoginSheet(true)}
              />
            </ScrollView>
          ) : isLoading || isSyncing ? (
            <View style={{ paddingHorizontal: 20 }}><SkeletonList count={5} /></View>
          ) : items.length === 0 ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0A0A0A" />}>
              <EmptyState
                icon={<BookOpen size={64} color="#A0A0A0" strokeWidth={1.2} />}
                title="No assignments"
                description="Pull down to sync from Moodle."
                actionLabel="Sync Now"
                onAction={handleSync}
              />
            </ScrollView>
          ) : (
            <SectionList
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 108 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0A0A0A" />}
              ListHeaderComponent={renderFilterHeader}
              sections={sections}
              keyExtractor={(item) => item.id}
              initialNumToRender={5}
              windowSize={3}
              maxToRenderPerBatch={5}
              updateCellsBatchingPeriod={50}
              renderItem={({ item, index, section }) => (
                <View style={{ opacity: (section as any).isArchivedCourse ? 0.6 : 1 }}>
                  <AssignmentItem item={item as any} index={index} />
                </View>
              )}
              renderSectionHeader={({ section }) => (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#FAFAFA',
                  marginTop: section.title === 'Overdue' ? 0 : 8,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    {section.icon}
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#6E6E6E', letterSpacing: 0.5, textTransform: 'uppercase' }} numberOfLines={1}>
                      {section.title}
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>({section.data.length})</Text>
                  </View>
                  {(section as any).isArchivedCourse && (section as any).courseObj && (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleCoursePin((section as any).courseObj.id);
                        showToast(`Pinned ${(section as any).courseObj.shortname || 'course'} as active`, 'success');
                      }}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#F0F0F0', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Pin size={12} color="#6E6E6E" />
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: '#6E6E6E' }}>Pin active</Text>
                    </Pressable>
                  )}
                </View>
              )}
              ListEmptyComponent={() => (
                <View style={{ paddingHorizontal: 20, paddingTop: 40, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
                    No assignments match filters
                  </Text>
                </View>
              )}
            />
          )}

          {/* Login Sheet */}
          <BottomSheet visible={showLoginSheet} onDismiss={() => setShowLoginSheet(false)} snapPoint={0.55}>
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Connect to Moodle</Text>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>
                Enter your Moodle URL and credentials.
              </Text>
              <Input label="Moodle Domain" value={siteUrl} onChangeText={setSiteUrl} placeholder="moodle.university.edu" autoCapitalize="none" keyboardType="url" />
              <Input label="Username/ID" value={username} onChangeText={setUsername} autoCapitalize="none" />
              <Input 
                label="Password" 
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry={!showPassword}
                rightAccessory={
                  <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                    {showPassword ? <EyeOff size={20} color="#A0A0A0" /> : <Eye size={20} color="#6E6E6E" />}
                  </Pressable>
                }
              />
              <Button title="Connect" onPress={handleConnect} loading={connecting} fullWidth />
            </View>
          </BottomSheet>

          {/* Course Visibility Settings Sheet */}
          <BottomSheet visible={showCourseSettings} onDismiss={() => setShowCourseSettings(false)} snapPoint={0.6}>
            <View style={{ flex: 1, paddingBottom: 20 }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', marginBottom: 16 }}>Manage Courses</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ gap: 16 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#A0A0A0', marginBottom: 16 }}>CURRENT SEMESTER</Text>
                  {courses.filter((c: any) => courseCategories[String(c.id)] === 'active' || manuallyPinnedCourseIds.includes(String(c.id))).map((course: any) => {
                    const isEnabled = isCourseEnabled(course.id);
                    return (
                      <View key={`active-${course.id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <View style={{ flex: 1, paddingRight: 16, opacity: isEnabled ? 1 : 0.5 }}>
                          <Text style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: '#0A0A0A' }}>
                            {course.fullname || course.shortname}
                          </Text>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0', marginTop: 2 }}>
                            {isEnabled ? 'Active' : 'Muted'}
                          </Text>
                        </View>
                        <Switch
                          value={isEnabled}
                          onValueChange={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (courseCategories[String(course.id)] === 'archived') toggleCoursePin(course.id); // Was pinned to active
                            else toggleCourseDisable(course.id); // Toggle active off
                          }}
                          trackColor={{ false: '#E4E4E4', true: '#0A0A0A' }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                    );
                  })}

                  <Pressable 
                    onPress={() => setOldCoursesExpanded(!oldCoursesExpanded)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}
                  >
                    <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#A0A0A0' }}>
                      OLD COURSES ({courses.filter((c: any) => courseCategories[String(c.id)] === 'archived' && !manuallyPinnedCourseIds.includes(String(c.id))).length})
                    </Text>
                    {oldCoursesExpanded ? <ChevronDown size={18} color="#A0A0A0" /> : <ChevronRight size={18} color="#A0A0A0" />}
                  </Pressable>

                  <Animated.View style={expandedStyle}>
                    <View style={{ gap: 16, paddingTop: 12 }}>
                      {courses.filter((c: any) => courseCategories[String(c.id)] === 'archived' && !manuallyPinnedCourseIds.includes(String(c.id))).map((course: any) => {
                        return (
                          <View key={`old-${course.id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                            <View style={{ flex: 1, paddingRight: 16, opacity: 0.5 }}>
                              <Text style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: '#A0A0A0' }}>
                                {course.fullname || course.shortname}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                <PinOff size={11} color="#A0A0A0" />
                                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
                                  Archived
                                </Text>
                              </View>
                            </View>
                            <Switch
                              value={false}
                              onValueChange={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                toggleCoursePin(course.id);
                              }}
                              trackColor={{ false: '#E4E4E4', true: '#0A0A0A' }}
                              thumbColor="#FFFFFF"
                            />
                          </View>
                        );
                      })}
                    </View>
                  </Animated.View>
                </View>
              </ScrollView>
            </View>
          </BottomSheet>
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  );
}
