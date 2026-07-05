// app/(tabs)/schedule.tsx
// Schedule screen with weekly grid and list views

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AnimatedScreen } from '../../components/ui/AnimatedScreen';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonList } from '../../components/ui/Skeleton';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { ClassCard } from '../../components/schedule/ClassCard';
import { WeeklyGrid } from '../../components/schedule/WeeklyGrid';
import { useScheduleStore } from '../../lib/store/useScheduleStore';
import { Calendar, Plus, LayoutGrid, List, Users, Download, Eye, EyeOff } from 'lucide-react-native';
import { FriendManager } from '../../components/schedule/FriendManager';
import { useFriendsStore } from '../../lib/store/useFriendsStore';
import { mergeAndDeduplicateClasses } from '../../lib/store/useScheduleStore';
import { getFullname } from '../../lib/session';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Springs } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ScheduleScreen() {
  const router = useRouter();
  const { classes: myClasses, isLoading, viewMode, setViewMode, loadClasses, importFromPortal } = useScheduleStore();
  const { friends, friendClasses, visibleFriendIds, toggleFriendVisibility, loadFriends, loadIncoming, incoming } = useFriendsStore();
  const { showToast } = useToast();

  const [showFriends, setShowFriends] = useState(false);
  const [myInitials, setMyInitials] = useState('Me');

  const [showPortalSheet, setShowPortalSheet] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [showPortalPassword, setShowPortalPassword] = useState(false);
  const [isImportingPortal, setIsImportingPortal] = useState(false);
  const [importPhase, setImportPhase] = useState('');
  const portalPasswordRef = useRef<TextInput>(null);

  const fabScale = useSharedValue(1);
  const gridOpacity = useSharedValue(1);
  const listOpacity = useSharedValue(0);

  useEffect(() => {
    loadClasses();
    loadFriends();
    loadIncoming();
    getFullname().then(name => {
      if (name) setMyInitials(name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase());
    });
  }, []);

  const classes = React.useMemo(() => {
    return mergeAndDeduplicateClasses(myClasses, friendClasses, visibleFriendIds, friends, myInitials);
  }, [myClasses, friendClasses, visibleFriendIds, friends, myInitials]);

  useEffect(() => {
    if (viewMode === 'grid') {
      gridOpacity.value = withTiming(1, { duration: 200 });
      listOpacity.value = withTiming(0, { duration: 200 });
    } else {
      gridOpacity.value = withTiming(0, { duration: 200 });
      listOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [viewMode]);

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  const gridStyle = useAnimatedStyle(() => ({
    opacity: gridOpacity.value,
    display: gridOpacity.value === 0 ? 'none' : 'flex',
  }));

  const listStyle = useAnimatedStyle(() => ({
    opacity: listOpacity.value,
  }));

  const handleToggleView = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode(viewMode === 'grid' ? 'list' : 'grid');
  }, [viewMode]);

  const handleClassPress = useCallback(
    (classItem: { id: string }) => {
      router.push({ pathname: '/(modals)/add-class', params: { classId: classItem.id } });
    },
    [router]
  );

  const handleAddClass = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(modals)/add-class');
  }, [router]);

  const handleOpenPortalImport = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPortalSheet(true);
  }, []);

  const handleTogglePortalPasswordVisibility = useCallback(() => {
    // Toggling secureTextEntry while focused causes native flicker/lag on both
    // platforms; blurring first and refocusing after avoids it (only when it was
    // actually focused, so this never steals focus unexpectedly).
    const input = portalPasswordRef.current;
    const wasFocused = input?.isFocused() ?? false;
    if (wasFocused) input?.blur();
    setShowPortalPassword((prev) => !prev);
    if (wasFocused) {
      requestAnimationFrame(() => input?.focus());
    }
  }, []);

  const handleImportFromPortal = useCallback(async () => {
    if (!studentId.trim() || !portalPassword.trim()) {
      showToast('Enter your UMT student ID and password', 'error');
      return;
    }
    setIsImportingPortal(true);
    try {
      const { imported, skipped } = await importFromPortal(
        studentId.trim(),
        portalPassword,
        setImportPhase,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(
        skipped > 0 ? `Imported ${imported} classes, ${skipped} already existed` : `Imported ${imported} classes`,
        'success',
      );
      setShowPortalSheet(false);
      setStudentId('');
      setPortalPassword('');
    } catch (error: any) {
      showToast(error.message || 'Failed to import from UMT portal', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsImportingPortal(false);
      setImportPhase('');
    }
  }, [studentId, portalPassword, importFromPortal]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      <AnimatedScreen>
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 32,
                fontFamily: 'Inter_700Bold',
                color: '#0A0A0A',
                letterSpacing: -0.5,
              }}
            >
              Schedule
            </Text>

            {classes.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={handleOpenPortalImport}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E4E4E4',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Download size={20} color="#0A0A0A" strokeWidth={1.8} />
                </Pressable>

                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowFriends(true);
                  }}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E4E4E4',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                >
                  <Users size={20} color="#0A0A0A" strokeWidth={1.8} />
                  {incoming.length > 0 && (
                    <View style={{ position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444' }} />
                  )}
                </Pressable>
                
                <Pressable
                  onPress={handleToggleView}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E4E4E4',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {viewMode === 'grid' ? (
                    <List size={20} color="#0A0A0A" strokeWidth={1.8} />
                  ) : (
                    <LayoutGrid size={20} color="#0A0A0A" strokeWidth={1.8} />
                  )}
                </Pressable>
              </View>
            )}
          </View>

          {/* Filter Chips */}
          {friends.length > 0 && (
            <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <View style={{ 
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, 
                  backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: '#0A0A0A'
                }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>Me</Text>
                </View>
                {friends.map(f => {
                  const isVis = visibleFriendIds.has(f.userId);
                  return (
                    <Pressable
                      key={f.userId}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleFriendVisibility(f.userId);
                      }}
                      style={{ 
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, 
                        backgroundColor: isVis ? '#0A0A0A' : '#FFF', 
                        borderWidth: 1, borderColor: isVis ? '#0A0A0A' : '#E4E4E4'
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: isVis ? '#FFF' : '#6E6E6E' }}>{f.fullname.split(' ')[0]}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Content */}
          {isLoading ? (
            <View style={{ paddingHorizontal: 20 }}>
              <SkeletonList count={4} />
            </View>
          ) : classes.length === 0 ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 108 }}
              showsVerticalScrollIndicator={false}
            >
              <EmptyState
                icon={<Calendar size={64} color="#A0A0A0" strokeWidth={1.2} />}
                title="No classes added"
                description="Add your class schedule to get reminders and see your weekly timetable."
                actionLabel="Add Your First Class"
                onAction={handleAddClass}
                secondaryActionLabel="Import from UMT Portal"
                onSecondaryAction={handleOpenPortalImport}
              />
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              {/* Grid View */}
              {viewMode === 'grid' && (
                <Animated.View style={[{ flex: 1 }, gridStyle]}>
                  <WeeklyGrid classes={classes} onClassPress={handleClassPress} />
                </Animated.View>
              )}

              {/* List View */}
              {viewMode === 'list' && (
                <Animated.View style={[{ flex: 1 }, listStyle]}>
                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 108 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {classes.map((cls, index) => (
                      <ClassCard
                        key={cls.id}
                        classItem={cls}
                        onPress={() => handleClassPress(cls)}
                        index={index}
                      />
                    ))}
                  </ScrollView>
                </Animated.View>
              )}
            </View>
          )}

          {/* FAB */}
          <AnimatedPressable
            onPressIn={() => {
              fabScale.value = withSpring(0.88, Springs.snappy);
            }}
            onPressOut={() => {
              fabScale.value = withSpring(1, Springs.snappy);
            }}
            onPress={handleAddClass}
            style={[
              {
                position: 'absolute',
                bottom: 108,
                right: 20,
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: '#0A0A0A',
                alignItems: 'center',
                justifyContent: 'center',
              },
              fabAnimatedStyle,
            ]}
          >
            <Plus size={24} color="#FFFFFF" strokeWidth={2} />
          </AnimatedPressable>
          <FriendManager visible={showFriends} onDismiss={() => setShowFriends(false)} />

          {/* Import from UMT Portal Sheet */}
          <BottomSheet
            visible={showPortalSheet}
            onDismiss={() => {
              if (isImportingPortal) return;
              setShowPortalSheet(false);
            }}
            snapPoint={0.55}
          >
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>
                Import from UMT Portal
              </Text>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>
                Log in with your UMT student portal credentials (not your Moodle login) to import your registered courses and timetable.
              </Text>
              <Input
                label="Student ID"
                value={studentId}
                onChangeText={setStudentId}
                placeholder="s2023065086"
                autoCapitalize="none"
                editable={!isImportingPortal}
              />
              <Input
                ref={portalPasswordRef}
                label="Password"
                value={portalPassword}
                onChangeText={setPortalPassword}
                secureTextEntry={!showPortalPassword}
                editable={!isImportingPortal}
                rightAccessory={
                  <Pressable onPress={handleTogglePortalPasswordVisibility} hitSlop={10}>
                    {showPortalPassword ? <EyeOff size={20} color="#A0A0A0" /> : <Eye size={20} color="#6E6E6E" />}
                  </Pressable>
                }
              />
              {isImportingPortal && importPhase ? (
                <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6E6E6E', textAlign: 'center' }}>
                  {importPhase}
                </Text>
              ) : null}
              <Button title="Import" onPress={handleImportFromPortal} loading={isImportingPortal} fullWidth />
            </View>
          </BottomSheet>
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  );
}
