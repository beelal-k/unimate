// app/(modals)/add-class.tsx
// Add/Edit class modal with full form

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { DaySelector } from '../../components/schedule/DaySelector';
import { TimePicker } from '../../components/schedule/TimePicker';
import { ColorPicker } from '../../components/schedule/ColorPicker';
import { useScheduleStore } from '../../lib/store/useScheduleStore';
import { useToast } from '../../components/ui/Toast';
import { Springs } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AddClassModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ classId?: string }>();
  const { showToast } = useToast();
  const { classes, addClass, updateClass, deleteClass } = useScheduleStore();

  const isEditing = !!params.classId;
  const existingClass = isEditing
    ? classes.find((c) => c.id === params.classId)
    : null;

  const [name, setName] = useState(existingClass?.name || '');
  const [code, setCode] = useState(existingClass?.code || '');
  const [room, setRoom] = useState(existingClass?.room || '');
  const [instructor, setInstructor] = useState(existingClass?.instructor || '');
  const [selectedDays, setSelectedDays] = useState<number[]>(
    existingClass?.daysOfWeek || []
  );
  const [startTime, setStartTime] = useState(existingClass?.startTime || '09:00');
  const [endTime, setEndTime] = useState(existingClass?.endTime || '10:00');
  const [color, setColor] = useState(existingClass?.color || '#0A0A0A');
  const [notifyMinutes, setNotifyMinutes] = useState(
    existingClass?.notifyMinutesBefore?.toString() || '15'
  );
  const [isLoading, setIsLoading] = useState(false);

  const closeScale = useSharedValue(1);
  const closeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: closeScale.value }],
  }));

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      showToast('Please enter a class name', 'error');
      return;
    }
    if (selectedDays.length === 0) {
      showToast('Please select at least one day', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const data = {
        name: name.trim(),
        code: code.trim() || null,
        room: room.trim() || null,
        instructor: instructor.trim() || null,
        color,
        daysOfWeek: selectedDays,
        startTime,
        endTime,
        notifyMinutesBefore: parseInt(notifyMinutes) || 15,
        semesterStart: null,
        semesterEnd: null,
        isActive: true,
      };

      if (isEditing && params.classId) {
        await updateClass(params.classId, data);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('Class updated', 'success');
      } else {
        await addClass(data);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('Class added', 'success');
      }
      router.back();
    } catch (error) {
      showToast('Failed to save class', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  }, [
    name, code, room, instructor, color, selectedDays,
    startTime, endTime, notifyMinutes, isEditing, params.classId,
  ]);

  const handleDelete = useCallback(() => {
    if (!params.classId) return;

    Alert.alert(
      'Delete Class',
      `Are you sure you want to delete "${name}"? This will cancel all reminders.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClass(params.classId!);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast('Class deleted', 'success');
              router.back();
            } catch {
              showToast('Failed to delete class', 'error');
            }
          },
        },
      ]
    );
  }, [params.classId, name]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#F0F0F0',
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontFamily: 'Inter_600SemiBold',
            color: '#0A0A0A',
            letterSpacing: -0.5,
          }}
        >
          {isEditing ? 'Edit Class' : 'Add Class'}
        </Text>
        <AnimatedPressable
          onPressIn={() => {
            closeScale.value = withSpring(0.88, Springs.snappy);
          }}
          onPressOut={() => {
            closeScale.value = withSpring(1, Springs.snappy);
          }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={[
            closeStyle,
            {
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: '#F3F3F3',
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <X size={20} color="#0A0A0A" strokeWidth={2} />
        </AnimatedPressable>
      </View>

      {/* Form */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Input label="Class Name" value={name} onChangeText={setName} />
        <Input label="Course Code (optional)" value={code} onChangeText={setCode} />
        <Input label="Room / Location (optional)" value={room} onChangeText={setRoom} />
        <Input label="Instructor (optional)" value={instructor} onChangeText={setInstructor} />

        <DaySelector selected={selectedDays} onChange={setSelectedDays} />

        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <TimePicker label="Start Time" value={startTime} onChange={setStartTime} />
          </View>
          <View style={{ flex: 1 }}>
            <TimePicker label="End Time" value={endTime} onChange={setEndTime} />
          </View>
        </View>

        <ColorPicker selected={color} onChange={setColor} />

        <Input
          label="Remind (minutes before)"
          value={notifyMinutes}
          onChangeText={setNotifyMinutes}
          keyboardType="number-pad"
        />

        {/* Save Button */}
        <View style={{ marginTop: 12 }}>
          <Button
            title={isEditing ? 'Save Changes' : 'Add Class'}
            onPress={handleSave}
            loading={isLoading}
            fullWidth
          />
        </View>

        {/* Delete Button (edit mode only) */}
        {isEditing && (
          <View style={{ marginTop: 8 }}>
            <Button
              title="Delete Class"
              onPress={handleDelete}
              variant="destructive"
              fullWidth
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
