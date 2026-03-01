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
    loadItems, checkConnection, connectMoodle, disconnectMoodle, syncFromMoodle, toggleCourseVisibility,
    getUpcomingAssignments, getOverdueAssignments, getCompletedAssignments, hiddenCourseIds,
  } = useLmsStore();

  const { showToast } = useToast();
  const [showLoginSheet, setShowLoginSheet] = useState(false);
  const [siteUrl, setSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filter state
  const [showOverdue, setShowOverdue] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null); // null = all
  const [showPassword, setShowPassword] = useState(false);
  const [showCourseSettings, setShowCourseSettings] = useState(false);

  useEffect(() => {
    checkConnection().then((connected) => {
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
  const filterByCourse = useCallback((list: LmsItem[]) => {
    if (!selectedCourse) return list;
    return list.filter((i) => i.courseName === selectedCourse);
  }, [selectedCourse]);

  const upcoming = useMemo(() => filterByCourse(getUpcomingAssignments()), [items, selectedCourse]);
  const overdue = useMemo(() => filterByCourse(getOverdueAssignments()), [items, selectedCourse]);
  const completed = useMemo(() => filterByCourse(getCompletedAssignments()), [items, selectedCourse]);

  // Unique course names for filter
  // Unique course names for filter (excluding hidden unless we want to filter them completely out)
  const courseNames = useMemo(() => {
    const names = [...new Set(items.filter(i => !i.courseId || !hiddenCourseIds.includes(i.courseId)).map((i) => i.courseName).filter(Boolean))];
    return names.sort();
  }, [items, hiddenCourseIds]);

  const sections = useMemo(() => {
    const s = [];
    if (showOverdue && overdue.length > 0) {
      s.push({ title: 'Overdue', icon: <AlertTriangle size={16} color="#0A0A0A" strokeWidth={1.8} />, data: overdue });
    }
    if (upcoming.length > 0) {
      s.push({ title: 'Upcoming', icon: <Clock size={16} color="#6E6E6E" strokeWidth={1.8} />, data: upcoming });
    }
    if (completed.length > 0) {
      s.push({ title: 'Completed', icon: <CheckCircle2 size={16} color="#A0A0A0" strokeWidth={1.8} />, data: completed });
    }
    return s;
  }, [showOverdue, overdue, upcoming, completed]);

  const renderFilterHeader = () => (
    <View style={{ paddingHorizontal: 20, paddingBottom: 8, gap: 10 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
        {courses.length} course{courses.length > 1 ? 's' : ''} · {items.filter((i) => i.type === 'assignment').length} assignments
        {lastSyncAt && ` · ${new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
      </Text>
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
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowOverdue(!showOverdue);
          }}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 20, borderWidth: 1,
            backgroundColor: showOverdue ? '#0A0A0A' : '#FFFFFF',
            borderColor: showOverdue ? '#0A0A0A' : '#E4E4E4',
          }}
        >
          {showOverdue ? <Eye size={14} color="#FFFFFF" strokeWidth={1.8} /> : <EyeOff size={14} color="#6E6E6E" strokeWidth={1.8} />}
          <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: showOverdue ? '#FFFFFF' : '#6E6E6E' }}>Overdue ({overdue.length})</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedCourse(null);
          }}
          style={{
            paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 20, borderWidth: 1,
            backgroundColor: !selectedCourse ? '#0A0A0A' : '#FFFFFF',
            borderColor: !selectedCourse ? '#0A0A0A' : '#E4E4E4',
          }}
        >
          <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: !selectedCourse ? '#FFFFFF' : '#6E6E6E' }}>All</Text>
        </Pressable>
        {courseNames.map((name) => (
          <Pressable
            key={name}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedCourse(name === selectedCourse ? null : name);
            }}
            style={{
              paddingHorizontal: 12, paddingVertical: 6,
              borderRadius: 20, borderWidth: 1,
              backgroundColor: selectedCourse === name ? '#0A0A0A' : '#FFFFFF',
              borderColor: selectedCourse === name ? '#0A0A0A' : '#E4E4E4',
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: selectedCourse === name ? '#FFFFFF' : '#6E6E6E' }} numberOfLines={1}>{name}</Text>
          </Pressable>
        ))}
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
              renderItem={({ item, index }) => <AssignmentItem item={item} index={index} />}
              renderSectionHeader={({ section: { title, icon, data } }) => (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#FAFAFA',
                  marginTop: title === 'Overdue' ? 0 : 8,
                }}>
                  {icon}
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#6E6E6E', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    {title}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>({data.length})</Text>
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
                  {courses.map(course => {
                    const isHidden = hiddenCourseIds.includes(course.id);
                    return (
                      <View key={course.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, paddingRight: 16 }}>
                          <Text style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: isHidden ? '#A0A0A0' : '#0A0A0A' }}>
                            {course.fullname || course.shortname}
                          </Text>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0', marginTop: 2 }}>
                            {isHidden ? 'Hidden' : 'Visible'}
                          </Text>
                        </View>
                        <Switch
                          value={!isHidden}
                          onValueChange={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            toggleCourseVisibility(course.id);
                          }}
                          trackColor={{ false: '#E4E4E4', true: '#0A0A0A' }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </BottomSheet>
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  );
}
