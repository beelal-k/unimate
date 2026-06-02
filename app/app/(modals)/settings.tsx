// app/(modals)/settings.tsx
// Profile and configuration settings with Turso integration

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getUserId, getFullname, getMoodleUsername, getMoodleDomain } from '../../lib/session';
import { X, LogOut, RefreshCw, User, Database, ShieldCheck, Bell, ChevronRight, Download, CheckCircle } from 'lucide-react-native';
import { signOutSequence, drainSyncQueue, pullFromTurso } from '../../lib/auth';
import { useToast } from '../../components/ui/Toast';
import { useUpdateStore } from '../../lib/store/useUpdateStore';
import { downloadAndInstallApk } from '../../lib/services/updateService';
import Constants from 'expo-constants';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function SettingsModal() {
  const router = useRouter();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<{ name: string; username: string; domain: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { hasUpdate, latestVersion, downloadUrl, releaseNotes, isDownloading, setIsDownloading } = useUpdateStore();
  const localVersion = Constants.expoConfig?.version ?? '—';

  useEffect(() => {
    async function loadIdentity() {
      const name = (await getFullname()) || 'Student';
      const username = (await getMoodleUsername()) || '';
      const domain = (await getMoodleDomain()) || '';
      setProfile({ name, username, domain });
    }
    loadIdentity();
  }, []);

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      const userId = await getUserId();
      if (userId) {
        await drainSyncQueue();
        await pullFromTurso(userId);
        showToast('Synced with cloud', 'success');
      } else {
        showToast('Auth error: missing identity hook', 'error');
      }
    } catch (err: any) {
      console.error('[Settings] Sync error:', err);
      showToast('Cloud sync failed. Check connection.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out of UniMate?',
      'This will remove all your downloaded course files and local data. Ensure your data is synced first.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
             try {
               setIsLoggingOut(true);
               await signOutSequence();
               router.replace('/(auth)/login');
             } catch (err) {
               showToast('Error during sign out', 'error');
               setIsLoggingOut(false);
             }
          }
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-2 pb-4 bg-[#F9FAFB]">
        <Text className="text-2xl font-bold tracking-tight text-gray-900">Settings</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full bg-gray-200/70 items-center justify-center"
        >
          <X size={18} color="#374151" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View className="bg-white rounded-3xl p-5 mb-7 shadow-sm border border-gray-100 items-center">
          <View className="w-20 h-20 rounded-full bg-gray-900 items-center justify-center mb-3">
            <Text className="text-2xl font-bold text-white">{getInitials(profile?.name ?? '')}</Text>
          </View>
          <Text className="text-xl font-bold text-gray-900">{profile?.name ?? 'Student'}</Text>
          {!!profile?.username && (
            <Text className="text-sm font-medium text-gray-500 mt-0.5">{profile.username}</Text>
          )}
          {!!profile?.domain && (
            <View className="flex-row items-center mt-3 bg-emerald-50 px-3 py-1.5 rounded-full">
              <ShieldCheck size={13} color="#059669" />
              <Text className="text-xs font-semibold text-emerald-700 ml-1.5" numberOfLines={1}>
                {profile.domain}
              </Text>
            </View>
          )}
        </View>

        {/* App Update */}
        <SectionLabel text="App" />
        <Card>
          {hasUpdate ? (
            <SettingRow
              icon={isDownloading
                ? <ActivityIndicator size="small" color="#F97316" />
                : <Download size={20} color="#F97316" />}
              iconBg="bg-orange-50"
              title="Update Available"
              subtitle={`v${latestVersion} ready${releaseNotes ? ` · ${releaseNotes}` : ''}`}
              onPress={() => downloadUrl && downloadAndInstallApk(downloadUrl, setIsDownloading)}
              disabled={isDownloading}
              trailing={isDownloading
                ? <ActivityIndicator color="#F97316" size="small" />
                : <ChevronRight size={20} color="#F97316" />}
            />
          ) : (
            <SettingRow
              icon={<CheckCircle size={20} color="#059669" />}
              iconBg="bg-emerald-50"
              title="Up to date"
              subtitle={`You're on the latest version (v${localVersion})`}
            />
          )}
        </Card>

        {/* Preferences */}
        <SectionLabel text="Preferences" />
        <Card>
          <SettingRow
            icon={<Bell size={20} color="#2563EB" />}
            iconBg="bg-blue-50"
            title="Notifications & Alarms"
            subtitle="Class reminders and assignment deadlines"
            onPress={() => router.push('/(modals)/notifications')}
            showChevron
          />
        </Card>

        {/* Data & Storage */}
        <SectionLabel text="Data & Storage" />
        <Card>
          <SettingRow
            icon={<Database size={20} color="#9333EA" />}
            iconBg="bg-purple-50"
            title="Sync with cloud"
            subtitle="Push offline changes and refresh local data"
            onPress={handleManualSync}
            disabled={isSyncing}
            trailing={isSyncing
              ? <ActivityIndicator color="#9333EA" size="small" />
              : <RefreshCw size={20} color="#9CA3AF" />}
          />
        </Card>

        {/* Danger Zone */}
        <SectionLabel text="Account" />
        <Card>
          <SettingRow
            icon={isLoggingOut
              ? <ActivityIndicator size="small" color="#DC2626" />
              : <LogOut size={20} color="#DC2626" />}
            iconBg="bg-red-50"
            title="Sign Out"
            titleClassName="text-red-600 font-bold"
            subtitle="Removes downloaded files and local data"
            onPress={handleSignOut}
            disabled={isLoggingOut}
          />
        </Card>

        <Text className="text-center text-xs text-gray-400 mt-8">UniMate v{localVersion}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
      {text}
    </Text>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-6">
      {children}
    </View>
  );
}

function SettingRow({
  icon, iconBg, title, subtitle, onPress, disabled, trailing, showChevron, titleClassName,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  titleClassName?: string;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center p-4 active:bg-gray-50"
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View className={`w-10 h-10 rounded-xl ${iconBg} items-center justify-center mr-4`}>
        {icon}
      </View>
      <View className="flex-1 pr-2">
        <Text className={`text-base font-semibold text-gray-900 ${titleClassName ?? ''}`}>{title}</Text>
        {!!subtitle && (
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>{subtitle}</Text>
        )}
      </View>
      {trailing ?? (showChevron ? <ChevronRight size={20} color="#C0C0C0" /> : null)}
    </TouchableOpacity>
  );
}
