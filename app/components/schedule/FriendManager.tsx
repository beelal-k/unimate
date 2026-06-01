import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Search, UserPlus, Check, X, Trash2, Users } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { BottomSheet } from '../ui/BottomSheet';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { useFriendsStore } from '../../lib/store/useFriendsStore';
import { useToast } from '../ui/Toast';

export function FriendManager({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { 
    incoming, friends, searchUser, sendRequest, 
    acceptRequest, rejectRequest, unshare, 
    loadIncoming, loadFriends, isLoading 
  } = useFriendsStore();
  
  const { showToast } = useToast();
  const [searchId, setSearchId] = useState('');
  const [searchResult, setSearchResult] = useState<{ id: string; fullname: string; username: string } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [myUsername, setMyUsername] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadIncoming();
      loadFriends();
      SecureStore.getItemAsync('moodle_username').then(u => setMyUsername(u));
    } else {
      setSearchId('');
      setSearchResult(null);
    }
  }, [visible]);

  const handleSearch = async () => {
    if (!searchId.trim()) return;
    if (searchId.trim().toLowerCase() === myUsername?.toLowerCase()) {
      showToast('Cannot add yourself', 'info');
      return;
    }
    
    setIsSearching(true);
    setSearchResult(null);
    try {
      const result = await searchUser(searchId.trim());
      if (result) {
        setSearchResult(result);
      } else {
        showToast('User not found', 'error');
      }
    } catch {
      showToast('Search failed', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!searchResult) return;
    if (friends.some(f => f.userId === searchResult.id)) {
      showToast('Already sharing schedule with this user', 'info');
      return;
    }
    try {
      await sendRequest(searchResult.id, searchResult.fullname);
      showToast('Request sent!', 'success');
      setSearchId('');
      setSearchResult(null);
    } catch (e: any) {
      showToast(e.message || 'Failed to send request', 'error');
    }
  };

  const confirmUnshare = (shareId: string, name: string) => {
    Alert.alert(
      'Unshare Schedule',
      `Stop sharing your schedule with ${name}? They will also lose access to yours.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Unshare', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await unshare(shareId);
              showToast('Schedule unshared', 'success');
            } catch {
              showToast('Failed to unshare', 'error');
            }
          }
        }
      ]
    );
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.65}>
      <View style={{ gap: 24 }}>
        <View>
          <Text style={{ fontSize: 24, fontFamily: 'Inter_700Bold', color: '#0A0A0A' }}>
            Friends
          </Text>
          <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6E6E6E', marginTop: 4 }}>
            Share schedules with classmates
          </Text>
        </View>

        {/* My ID display */}
        <View style={{ backgroundColor: '#F3F3F3', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#6E6E6E' }}>Your Username</Text>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>{myUsername || 'Loading...'}</Text>
          </View>
        </View>

        {/* Search */}
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Add Friend</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input 
                label="" 
                placeholder="Enter Moodle username (e.g. s2023065086)" 
                value={searchId} 
                onChangeText={setSearchId} 
                onSubmitEditing={handleSearch}
                autoCapitalize="none"
              />
            </View>
            <Button 
              title="" 
              icon={isSearching ? <ActivityIndicator size="small" color="#FFF" /> : <Search size={20} color="#FFF" />} 
              onPress={handleSearch} 
              disabled={!searchId.trim() || isSearching}
              style={{ marginTop: 2, height: 50, width: 50, paddingHorizontal: 0 }}
            />
          </View>
          
          {searchResult && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FAFAFA', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F0F0F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 }}>
                <Avatar initials={searchResult.fullname} size={36} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>{searchResult.fullname}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>{searchResult.username}</Text>
                </View>
              </View>
              <Button title="Add" size="sm" icon={<UserPlus size={16} color="#FFF" />} onPress={handleSendRequest} />
            </View>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator color="#0A0A0A" style={{ marginTop: 20 }} />
        ) : (
          <>
            {/* Incoming Requests */}
            {incoming.length > 0 && (
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Incoming Requests</Text>
                {incoming.map(req => (
                  <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 }}>
                      <Avatar initials={req.fromFullname} />
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#0A0A0A' }} numberOfLines={1}>{req.fromFullname}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button title="" variant="secondary" size="sm" icon={<X size={16} color="#0A0A0A" />} onPress={() => rejectRequest(req.id)} />
                      <Button title="" size="sm" icon={<Check size={16} color="#FFF" />} onPress={() => acceptRequest(req.id)} />
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Friends List */}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Shared With</Text>
              {friends.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 20, backgroundColor: '#FAFAFA', borderRadius: 12 }}>
                  <Users size={32} color="#D0D0D0" style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 13, color: '#A0A0A0', fontFamily: 'Inter_500Medium' }}>No friends added yet</Text>
                </View>
              ) : (
                friends.map(friend => (
                  <View key={friend.shareId} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 }}>
                      <Avatar initials={friend.fullname} />
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#0A0A0A' }} numberOfLines={1}>{friend.fullname}</Text>
                    </View>
                    <Button 
                      title="" 
                      variant="secondary" 
                      size="sm" 
                      icon={<Trash2 size={16} color="#EF4444" />} 
                      onPress={() => confirmUnshare(friend.shareId, friend.fullname)} 
                      style={{ borderColor: '#FEE2E2', backgroundColor: '#FEF2F2' }}
                    />
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}
