// app/(tabs)/schedule.tsx
// Schedule screen with weekly grid and list views

import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AnimatedScreen } from '../../components/ui/AnimatedScreen';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonList } from '../../components/ui/Skeleton';
import { ClassCard } from '../../components/schedule/ClassCard';
import { WeeklyGrid } from '../../components/schedule/WeeklyGrid';
import { useScheduleStore } from '../../lib/store/useScheduleStore';
import { Calendar, Plus, LayoutGrid, List, Users } from 'lucide-react-native';
import { FriendManager } from '../../components/schedule/FriendManager';
import { useFriendsStore } from '../../lib/store/useFriendsStore';
import { mergeAndDeduplicateClasses } from '../../lib/store/useScheduleStore';
import * as SecureStore from 'expo-secure-store';
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
  const { classes: myClasses, isLoading, viewMode, setViewMode, loadClasses } = useScheduleStore();
  const { friends, friendClasses, visibleFriendIds, toggleFriendVisibility, loadFriends, loadIncoming, incoming } = useFriendsStore();

  const [showFriends, setShowFriends] = useState(false);
  const [myInitials, setMyInitials] = useState('Me');

  const fabScale = useSharedValue(1);
  const gridOpacity = useSharedValue(1);
  const listOpacity = useSharedValue(0);

  useEffect(() => {
    loadClasses();
    loadFriends();
    loadIncoming();
    SecureStore.getItemAsync('user_fullname').then(name => {
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
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  );
}
