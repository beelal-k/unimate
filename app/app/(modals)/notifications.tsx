// app/(modals)/notifications.tsx
// Notifications & Alarms preferences — global controls for class & assignment reminders

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  X, Bell, BellOff, BellRing, Clock, CalendarClock, CheckCircle2, Send,
} from 'lucide-react-native';
import { readSetting, saveSetting } from '../../lib/db/settings';
import { useToast } from '../../components/ui/Toast';

function getNotifications() {
  try {
    return require('../../lib/notifications') as typeof import('../../lib/notifications');
  } catch {
    return null;
  }
}

type AssignmentMode = 'default' | 'daily' | 'off';
const ASSIGNMENT_MODES: { key: AssignmentMode; label: string; desc: string }[] = [
  { key: 'default', label: 'Smart', desc: 'A heads-up 24 hours before, then an alarm 1 hour before each deadline.' },
  { key: 'daily', label: 'Daily', desc: 'A reminder every morning at 9:00 AM until the assignment is due.' },
  { key: 'off', label: 'Off', desc: 'No automatic assignment reminders. You can still set them per assignment.' },
];

const LEAD_OPTIONS = [5, 10, 15, 30];

export default function NotificationsModal() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('default');
  const [classLead, setClassLead] = useState(15);
  const [sendingTest, setSendingTest] = useState(false);

  const refreshPermission = useCallback(async () => {
    const N = getNotifications();
    if (!N) { setPermission('denied'); return; }
    try {
      const Notifications = require('expo-notifications') as typeof import('expo-notifications');
      const { status } = await Notifications.getPermissionsAsync();
      setPermission(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
    } catch {
      setPermission('denied');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [enabled, mode, lead] = await Promise.all([
          readSetting('notif_reminders_enabled'),
          readSetting('notif_assignment_default'),
          readSetting('notif_class_lead'),
        ]);
        setRemindersEnabled(enabled !== 'false');
        if (mode === 'default' || mode === 'daily' || mode === 'off') setAssignmentMode(mode);
        if (lead && LEAD_OPTIONS.includes(Number(lead))) setClassLead(Number(lead));
      } catch (err) {
        console.warn('[Notifications] Failed to load prefs:', err);
      } finally {
        await refreshPermission();
        setLoading(false);
      }
    })();
  }, [refreshPermission]);

  const handleEnablePermission = useCallback(async () => {
    const N = getNotifications();
    if (!N) return;
    if (permission === 'denied') {
      // Already denied at OS level — must go to system settings
      Linking.openSettings().catch(() => {});
      return;
    }
    const granted = await N.requestNotificationPermissions();
    await refreshPermission();
    if (granted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Notifications enabled', 'success');
    } else {
      showToast('Permission not granted', 'error');
    }
  }, [permission, refreshPermission, showToast]);

  const handleToggleReminders = useCallback(async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRemindersEnabled(value);
    await saveSetting('notif_reminders_enabled', value ? 'true' : 'false');
    await getNotifications()?.applyReminderPreferences().catch(() => {});
  }, []);

  const handleSelectMode = useCallback(async (mode: AssignmentMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAssignmentMode(mode);
    await saveSetting('notif_assignment_default', mode);
    await getNotifications()?.applyReminderPreferences().catch(() => {});
  }, []);

  const handleSelectLead = useCallback(async (lead: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setClassLead(lead);
    await saveSetting('notif_class_lead', String(lead));
  }, []);

  const handleTest = useCallback(async () => {
    const N = getNotifications();
    if (!N) { showToast('Not available on this device', 'error'); return; }
    setSendingTest(true);
    try {
      const granted = await N.requestNotificationPermissions();
      await refreshPermission();
      if (!granted) { showToast('Enable notifications first', 'error'); return; }
      await N.sendTestNotification();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Test notification sent', 'success');
    } catch {
      showToast('Failed to send test', 'error');
    } finally {
      setSendingTest(false);
    }
  }, [refreshPermission, showToast]);

  const controlsDisabled = !remindersEnabled || permission !== 'granted';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-2 pb-4 bg-[#F9FAFB]">
        <Text className="text-2xl font-bold tracking-tight text-gray-900">Notifications</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full bg-gray-200/70 items-center justify-center"
        >
          <X size={18} color="#374151" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0A0A0A" />
        </View>
      ) : (
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Permission banner */}
          {permission !== 'granted' && (
            <TouchableOpacity
              onPress={handleEnablePermission}
              activeOpacity={0.85}
              className="bg-gray-900 rounded-2xl p-4 mb-6 flex-row items-center"
            >
              <View className="w-10 h-10 rounded-xl bg-white/10 items-center justify-center mr-4">
                <BellOff size={20} color="#FFFFFF" />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-base font-semibold text-white">
                  {permission === 'denied' ? 'Notifications are blocked' : 'Turn on notifications'}
                </Text>
                <Text className="text-xs text-gray-300 mt-0.5">
                  {permission === 'denied'
                    ? 'Tap to open system settings and allow them.'
                    : 'Tap to allow class and assignment alerts.'}
                </Text>
              </View>
              <Bell size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          {/* Master toggle */}
          <SectionLabel text="Reminders" />
          <View className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-6">
            <View className="flex-row items-center p-4">
              <View className="w-10 h-10 rounded-xl bg-gray-900 items-center justify-center mr-4">
                <BellRing size={20} color="#FFFFFF" />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-base font-semibold text-gray-900">Reminders & alarms</Text>
                <Text className="text-xs text-gray-500 mt-0.5">Master switch for all scheduled alerts</Text>
              </View>
              <Switch
                value={remindersEnabled && permission === 'granted'}
                onValueChange={handleToggleReminders}
                disabled={permission !== 'granted'}
                trackColor={{ false: '#E5E7EB', true: '#0A0A0A' }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E5E7EB"
              />
            </View>
          </View>

          {/* Assignment reminder mode */}
          <SectionLabel text="Assignment Deadlines" />
          <View className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-2 ${controlsDisabled ? 'opacity-50' : ''}`}>
            {ASSIGNMENT_MODES.map((m, i) => {
              const selected = assignmentMode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => handleSelectMode(m.key)}
                  disabled={controlsDisabled}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-4 ${i < ASSIGNMENT_MODES.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-semibold text-gray-900">{m.label}</Text>
                    <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>{m.desc}</Text>
                  </View>
                  {selected
                    ? <CheckCircle2 size={22} color="#0A0A0A" />
                    : <View className="w-[22px] h-[22px] rounded-full border-2 border-gray-200" />}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text className="text-xs text-gray-400 ml-1 mb-6">
            This is the default for new assignments. You can still override any single assignment from its detail screen.
          </Text>

          {/* Class reminder lead time */}
          <SectionLabel text="Class Reminders" />
          <View className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 ${controlsDisabled ? 'opacity-50' : ''}`}>
            <View className="flex-row items-center mb-3">
              <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center mr-4">
                <Clock size={20} color="#2563EB" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-900">Notify before class</Text>
                <Text className="text-xs text-gray-500 mt-0.5">How early to remind you</Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              {LEAD_OPTIONS.map((opt) => {
                const selected = classLead === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => handleSelectLead(opt)}
                    disabled={controlsDisabled}
                    activeOpacity={0.7}
                    className={`flex-1 py-2.5 rounded-xl items-center ${selected ? 'bg-gray-900' : 'bg-gray-100'}`}
                  >
                    <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>{opt}m</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Test */}
          <SectionLabel text="Test" />
          <TouchableOpacity
            onPress={handleTest}
            disabled={sendingTest}
            activeOpacity={0.7}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-row items-center p-4 mb-6"
          >
            <View className="w-10 h-10 rounded-xl bg-emerald-50 items-center justify-center mr-4">
              {sendingTest ? <ActivityIndicator size="small" color="#059669" /> : <Send size={20} color="#059669" />}
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-gray-900">Send a test notification</Text>
              <Text className="text-xs text-gray-500 mt-0.5">Check that alerts come through on this device</Text>
            </View>
          </TouchableOpacity>

          <View className="flex-row items-start px-1">
            <CalendarClock size={14} color="#9CA3AF" style={{ marginTop: 1 }} />
            <Text className="text-xs text-gray-400 ml-2 flex-1">
              Reminders are scheduled on your device and work even offline. {Platform.OS === 'ios' ? 'iOS' : 'Android'} may need the app opened occasionally to refresh upcoming alerts.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">{text}</Text>
  );
}
