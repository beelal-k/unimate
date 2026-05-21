// app/(modals)/settings.tsx
// Profile and configuration settings with Turso integration

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { X, LogOut, RefreshCw, User, Database, ShieldCheck } from 'lucide-react-native';
import { signOutSequence, drainSyncQueue, pullFromTurso } from '../../lib/auth';
import { useToast } from '../../components/ui/Toast';

export default function SettingsModal() {
  const router = useRouter();
  const { showToast } = useToast();
  
  const [profile, setProfile] = useState<{ name: string; username: string; domain: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    async function loadIdentity() {
      const name = await SecureStore.getItemAsync('user_fullname') || 'Student';
      const username = await SecureStore.getItemAsync('moodle_username') || '';
      const domain = await SecureStore.getItemAsync('moodle_domain') || '';
      setProfile({ name, username, domain });
    }
    loadIdentity();
  }, []);

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      const userId = await SecureStore.getItemAsync('user_id');
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 bg-white border-b border-gray-100 shadow-sm z-10">
        <Text className="text-xl font-bold tracking-tight text-gray-900">Settings</Text>
        <TouchableOpacity 
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-gray-50 items-center justify-center"
        >
          <X size={20} color="#4B5563" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 py-6" showsVerticalScrollIndicator={false}>
        
        {/* Profile Card */}
        <View className="bg-white rounded-2xl p-5 mb-6 shadow-sm border border-gray-100 flex-row items-center">
          <View className="w-16 h-16 rounded-full bg-blue-100 items-center justify-center mr-4 border-2 border-blue-50">
            <User size={32} color="#2563EB" strokeWidth={1.5} />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900 mb-1">{profile?.name}</Text>
            <Text className="text-sm font-medium text-gray-500">{profile?.username}</Text>
            <View className="flex-row items-center mt-2 bg-gray-50 self-start px-2 py-1 rounded-md">
              <ShieldCheck size={12} color="#059669" />
              <Text className="text-xs font-semibold text-emerald-700 ml-1 ml-1.5">{profile?.domain}</Text>
            </View>
          </View>
        </View>

        {/* Cloud Sync section */}
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-2">Data & Storage</Text>
        <View className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-6">
          <TouchableOpacity 
            className="flex-row items-center justify-between p-5 border-b border-gray-50 active:bg-gray-50"
            onPress={handleManualSync}
            disabled={isSyncing}
          >
            <View className="flex-row items-center flex-1 pr-4">
              <View className="w-10 h-10 rounded-xl bg-purple-50 items-center justify-center mr-4">
                <Database size={20} color="#9333EA" />
              </View>
              <View>
                <Text className="text-base font-semibold text-gray-900">Sync with cloud</Text>
                <Text className="text-xs text-gray-500 mt-1 pr-4" numberOfLines={2}>
                  Push offline changes and hydrate the SQLite local replica.
                </Text>
              </View>
            </View>
            {isSyncing ? (
              <ActivityIndicator color="#9333EA" size="small" />
            ) : (
              <RefreshCw size={20} color="#9CA3AF" />
            )}
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <Text className="text-xs font-bold text-red-300 uppercase tracking-wider mb-2 ml-2 mt-4">Danger Zone</Text>
        <View className="bg-white rounded-2xl overflow-hidden shadow-sm border border-red-100 mb-12">
           <TouchableOpacity 
             className="flex-row items-center p-5 active:bg-red-50"
             onPress={handleSignOut}
             disabled={isLoggingOut}
           >
             <View className="w-10 h-10 rounded-xl bg-red-50 items-center justify-center mr-4">
               {isLoggingOut ? <ActivityIndicator size="small" color="#DC2626" /> : <LogOut size={20} color="#DC2626" />}
             </View>
             <Text className="text-base font-bold text-red-600">Sign Out</Text>
           </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
