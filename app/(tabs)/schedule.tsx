// app/(tabs)/schedule.tsx
// Schedule screen with weekly grid and list views

import React, { useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AnimatedScreen } from '../../components/ui/AnimatedScreen';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonList } from '../../components/ui/Skeleton';
import { ClassCard } from '../../components/schedule/ClassCard';
import { WeeklyGrid } from '../../components/schedule/WeeklyGrid';
import { useScheduleStore } from '../../lib/store/useScheduleStore';
import { Calendar, Plus, LayoutGrid, List } from 'lucide-react-native';
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
  const { classes, isLoading, viewMode, setViewMode, loadClasses } = useScheduleStore();

  const fabScale = useSharedValue(1);
  const gridOpacity = useSharedValue(1);
  const listOpacity = useSharedValue(0);

  useEffect(() => {
    loadClasses();
  }, []);

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
            )}
          </View>

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
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  );
}
