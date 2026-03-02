// components/schedule/WeeklyGrid.tsx
// Weekly grid (Mon-Fri) with time slots, class blocks, and red current-time line

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  FadeIn,
  useAnimatedScrollHandler,
  scrollTo,
  useAnimatedRef,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Springs } from '../../lib/theme';
import type { ClassItem } from '../../lib/store/useScheduleStore';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SCREEN_WIDTH = Dimensions.get('window').width;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];
const HOUR_HEIGHT = 90;
const START_HOUR = 7;
const END_HOUR = 21;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HEADER_HEIGHT = 36;
const TIME_COLUMN_WIDTH = 44;

interface WeeklyGridProps {
  classes: ClassItem[];
  onClassPress: (classItem: ClassItem) => void;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function ClassBlock({
  classItem,
  columnWidth,
  onPress,
  index,
}: {
  classItem: ClassItem;
  columnWidth: number;
  onPress: () => void;
  index: number;
}) {
  const startMin = timeToMinutes(classItem.startTime);
  const endMin = timeToMinutes(classItem.endTime);
  const topOffset = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;

  const scale = useSharedValue(1);
  const borderHeight = useSharedValue(0);

  useEffect(() => {
    borderHeight.value = withDelay(
      index * 60,
      withSpring(height - 8, Springs.smooth)
    );
  }, [height]);

  const borderStyle = useAnimatedStyle(() => ({
    height: borderHeight.value,
  }));

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      entering={FadeIn.delay(index * 60).duration(250)}
      onPressIn={() => { scale.value = withSpring(0.95, Springs.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, Springs.snappy); }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[
        pressStyle,
        {
          position: 'absolute',
          top: topOffset,
          left: 2,
          right: 2,
          height: Math.max(height, 24),
          borderRadius: 8,
          backgroundColor: '#F3F3F3',
          padding: 6,
          flexDirection: 'row',
          overflow: 'hidden',
        },
      ]}
    >
      <Animated.View
        style={[
          {
            width: 3,
            borderRadius: 1.5,
            backgroundColor: classItem.color,
            marginRight: 6,
          },
          borderStyle,
        ]}
      />
      <View style={{ flex: 1, justifyContent: 'flex-start', paddingTop: 2 }}>
        {!!classItem.code && (
          <Text
            numberOfLines={1}
            style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: '#0A0A0A', opacity: 0.8 }}
          >
            {classItem.code}
          </Text>
        )}
        <Text
          numberOfLines={height < 50 ? 1 : height < 70 ? 2 : 3}
          style={{ 
            fontSize: 11, 
            fontFamily: classItem.code ? 'Inter_500Medium' : 'Inter_600SemiBold', 
            color: '#0A0A0A',
            marginTop: classItem.code ? 2 : 0,
            lineHeight: 14,
          }}
        >
          {classItem.name}
        </Text>
        {height > 60 && !!classItem.room && (
          <Text
            numberOfLines={1}
            style={{ fontSize: 9, fontFamily: 'Inter_400Regular', color: '#6E6E6E', marginTop: 4 }}
          >
            {classItem.room}
          </Text>
        )}
      </View>
    </AnimatedPressable>
  );
}

// Current time indicator (red line like Google Calendar)
function NowIndicator({ columnWidth }: { columnWidth: number }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000); // update every minute
    return () => clearInterval(interval);
  }, []);

  const currentDay = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isInRange = currentMinutes >= START_HOUR * 60 && currentMinutes <= END_HOUR * 60;

  if (!isInRange) return null;

  const topOffset = ((currentMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const dayIndex = currentDay === 0 ? 6 : currentDay - 1; // Mon=0, Sun=6

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, elevation: 10 }}>
      {/* Red line spanning all day columns */}
      <View
        style={{
          position: 'absolute',
          top: topOffset,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: '#FF3B30',
        }}
      />
      {/* Red dot on the current day column */}
      <View
        style={{
          position: 'absolute',
          top: topOffset - 4,
          left: dayIndex * columnWidth - 1,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: '#FF3B30',
        }}
      />
    </View>
  );
}

export function WeeklyGrid({ classes, onClassPress }: WeeklyGridProps) {
  const columnWidth = 120; // Fixed width for comfortable reading

  const headerRef = useAnimatedRef<Animated.ScrollView>();
  
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollTo(headerRef, event.contentOffset.x, 0, false);
    },
  });

  const classesByDay = useMemo(() => {
    const map = new Map<number, ClassItem[]>();
    DAY_VALUES.forEach((d) => map.set(d, []));
    classes.forEach((cls) => {
      cls.daysOfWeek.forEach((day) => {
        if (DAY_VALUES.includes(day)) {
          const existing = map.get(day) || [];
          map.set(day, [...existing, cls]);
        }
      });
    });
    return map;
  }, [classes]);

  // Highlight today's column
  const today = new Date().getDay();
  const todayIndex = today === 0 ? 6 : today - 1;

  return (
    <View style={{ flex: 1 }}>
      {/* Day headers */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: HEADER_HEIGHT,
          borderBottomWidth: 1,
          borderBottomColor: '#F0F0F0',
        }}
      >
        <View style={{ width: TIME_COLUMN_WIDTH + 20 }} />
        <Animated.ScrollView
          ref={headerRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false} // Synced via the grid's horizontal scroll
          style={{ flex: 1 }}
        >
          {DAYS.map((day, i) => (
            <View key={day} style={{ width: columnWidth, alignItems: 'center', paddingRight: 4 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: i === todayIndex ? 'Inter_700Bold' : 'Inter_500Medium',
                  color: i === todayIndex ? '#0A0A0A' : '#6E6E6E',
                  letterSpacing: 0.8,
                }}
              >
                {day}
              </Text>
            </View>
          ))}
        </Animated.ScrollView>
      </View>

      {/* Grid body */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', position: 'relative' }}>
          {/* Time labels locked to the left side */}
          <View style={{ width: TIME_COLUMN_WIDTH + 20, paddingLeft: 20 }}>
            {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => {
              const hour = START_HOUR + i;
              return (
                <View key={hour} style={{ height: HOUR_HEIGHT, justifyContent: 'flex-start' }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: 'Inter_400Regular',
                      color: '#A0A0A0',
                      marginTop: -6,
                    }}
                  >
                    {`${hour.toString().padStart(2, '0')}:00`}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Horizontally scrolling columns */}
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            style={{ flex: 1 }}
          >
            <View style={{ flexDirection: 'row', position: 'relative', width: columnWidth * 7, paddingRight: 20 }}>
              {/* Day columns */}
              {DAY_VALUES.map((dayValue, dayIndex) => (
                <View
                  key={dayValue}
                  style={{
                    width: columnWidth,
                    position: 'relative',
                    backgroundColor: dayIndex === todayIndex ? '#FAFAFA' : 'transparent',
                  }}
                >
                  {/* Hour lines */}
                  {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => (
                    <View
                      key={i}
                      style={{
                        position: 'absolute',
                        top: i * HOUR_HEIGHT,
                        left: 0,
                        right: 0,
                        height: 1,
                        backgroundColor: '#F0F0F0',
                      }}
                    />
                  ))}

                  {/* Class blocks */}
                  {(classesByDay.get(dayValue) || []).map((cls, blockIndex) => (
                    <ClassBlock
                      key={cls.id}
                      classItem={cls}
                      columnWidth={columnWidth}
                      onPress={() => onClassPress(cls)}
                      index={dayIndex * 2 + blockIndex}
                    />
                  ))}
                </View>
              ))}

              {/* Current time indicator — rendered LAST so it's on top */}
              <NowIndicator columnWidth={columnWidth} />
            </View>
          </Animated.ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}
