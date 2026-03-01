// app/(tabs)/chat.tsx
// AI chat with keyboard-aware input, auto-rename, manual rename

import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, Platform,
  TextInput as RNTextInput, KeyboardAvoidingView, ActivityIndicator, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  MessageSquare, Plus, ArrowLeft, Settings, Sparkles, Send, Edit3, Trash2, Paperclip, X
} from 'lucide-react-native';

import { AnimatedScreen } from '../../components/ui/AnimatedScreen';
import { EmptyState } from '../../components/ui/EmptyState';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useChatStore } from '../../lib/store/useChatStore';
import { useFilesStore } from '../../lib/store/useFilesStore';
import { getGeminiApiKey, setGeminiApiKey, testGeminiApiKey } from '../../lib/api/gemini';
import { useToast } from '../../components/ui/Toast';
import { Springs } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TAB_BAR_HEIGHT = 88;

export default function ChatScreen() {
  const {
    conversations, currentConversationId, messages,
    isLoading, isStreaming, streamingContent,
    loadConversations, loadMessages, createConversation,
    deleteConversation, renameConversation, setCurrentConversation, sendMessage,
  } = useChatStore();

  const { showToast } = useToast();
  const scrollRef = useRef<ScrollView>(null);
  const [showApiKeySheet, setShowApiKeySheet] = useState(false);
  const [apiKey, setApiKeyInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [chatText, setChatText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<{ id: string; name: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { uploadFile } = useFilesStore();

  // Conversation actions bottom sheet
  const [showConvActions, setShowConvActions] = useState(false);
  const [actionConv, setActionConv] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    loadConversations();
    getGeminiApiKey().then((key) => setHasApiKey(!!key));
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length, streamingContent]);

  const handleSend = useCallback(async () => {
    const trimmed = chatText.trim();
    if (!trimmed || isStreaming) return;
    if (!hasApiKey) {
      setShowApiKeySheet(true);
      return;
    }
    setChatText('');
    const filesToAttach = attachedFiles.map(f => f.id);
    setAttachedFiles([]);
    try {
      await sendMessage(trimmed, filesToAttach);
    } catch (error: any) {
      showToast(error.message || 'Failed to send message', 'error');
    }
  }, [chatText, attachedFiles, hasApiKey, isStreaming]);

  const handleAttachFile = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      setIsUploading(true);
      const f = result.assets[0];
      const node = await uploadFile(f.uri, f.name, f.mimeType || 'image/jpeg', f.size || 0, null);
      setAttachedFiles((prev) => [...prev, { id: node.id, name: node.name }]);
    } catch (error: any) {
      showToast(error.message || 'Failed to attach file', 'error');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKey.trim()) {
      showToast('Enter your API key', 'error');
      return;
    }
    setTestingKey(true);
    const valid = await testGeminiApiKey(apiKey.trim());
    if (valid) {
      await setGeminiApiKey(apiKey.trim());
      setHasApiKey(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('API key saved', 'success');
      setShowApiKeySheet(false);
      setApiKeyInput('');
    } else {
      showToast('Invalid API key', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setTestingKey(false);
  }, [apiKey]);

  const handleNewChat = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const conv = await createConversation('New Chat');
      await loadMessages(conv.id);
    } catch (error: any) {
      showToast(error.message || 'Failed to create chat', 'error');
    }
  }, []);

  const handleRename = useCallback((id: string, currentTitle: string) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Rename Chat',
        'Enter a new name:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Rename',
            onPress: async (newTitle?: string) => {
              if (newTitle?.trim()) {
                await renameConversation(id, newTitle.trim());
                showToast('Renamed', 'success');
              }
            },
          },
        ],
        'plain-text',
        currentTitle,
      );
    } else {
      // Android doesn't support Alert.prompt — just show a toast hint
      showToast('Long-press conversation to rename', 'info');
    }
  }, []);

  const handleDeleteConversation = useCallback(
    (id: string, title: string) => {
      Alert.alert('Delete Chat', `Delete "${title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteConversation(id);
            showToast('Chat deleted', 'success');
          },
        },
      ]);
    },
    []
  );

  const canSend = chatText.trim().length > 0 && !isStreaming;

  // ── Chat Conversation View ──────────────────────────────
  if (currentConversationId) {
    const currentTitle = conversations.find((c) => c.id === currentConversationId)?.title || 'New Chat';

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Chat Header */}
          <View
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 16, paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 12,
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCurrentConversation(null);
                setChatText('');
              }}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
            >
              <ArrowLeft size={22} color="#0A0A0A" strokeWidth={1.8} />
            </Pressable>
            <Pressable
              onPress={() => handleRename(currentConversationId, currentTitle)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text
                style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', flex: 1 }}
                numberOfLines={1}
              >
                {currentTitle}
              </Text>
              <Edit3 size={14} color="#A0A0A0" strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 8, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {messages.length === 0 && !isStreaming && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 16,
                  backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 16,
                }}>
                  <Sparkles size={28} color="#A0A0A0" strokeWidth={1.4} />
                </View>
                <Text style={{ fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', textAlign: 'center' }}>
                  How can I help?
                </Text>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0', textAlign: 'center', marginTop: 6, maxWidth: 260 }}>
                  Ask about your courses, assignments, files, or anything academic.
                </Text>
              </View>
            )}

            {messages.map((msg, index) => (
              <MessageBubble key={msg.id} role={msg.role} content={msg.content} index={index} />
            ))}

            {isStreaming && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{
                  alignSelf: 'flex-start', backgroundColor: '#F3F3F3',
                  borderRadius: 16, borderTopLeftRadius: 4,
                  paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
                  Thinking...
                </Text>
              </Animated.View>
            )}
          </ScrollView>

          {/* Input bar — above tab bar */}
          <View style={{
            paddingBottom: TAB_BAR_HEIGHT,
            backgroundColor: '#FFFFFF',
          }}>
            {attachedFiles.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8, paddingTop: 8 }}>
                 {attachedFiles.map(f => (
                   <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F3F3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, gap: 6 }}>
                     <Paperclip size={12} color="#6E6E6E" />
                     <Text style={{ fontSize: 12, color: '#0A0A0A', maxWidth: 120 }} numberOfLines={1}>{f.name}</Text>
                     <Pressable onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setAttachedFiles(prev => prev.filter(a => a.id !== f.id));
                     }}>
                       <X size={14} color="#A0A0A0" />
                     </Pressable>
                   </View>
                 ))}
              </ScrollView>
            )}
            <View style={{
              flexDirection: 'row', alignItems: 'flex-end',
              paddingHorizontal: 16, paddingVertical: 10, gap: 8,
              borderTopWidth: 1, borderTopColor: '#F0F0F0',
            }}>
              <Pressable
                onPress={handleAttachFile}
                disabled={isUploading}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: '#F3F3F3',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color="#0A0A0A" />
                ) : (
                  <Paperclip size={18} color="#0A0A0A" strokeWidth={2} />
                )}
              </Pressable>
              <View style={{
                flex: 1, backgroundColor: '#F3F3F3', borderRadius: 20,
                paddingHorizontal: 16, paddingVertical: 8,
                minHeight: 40, maxHeight: 120, justifyContent: 'center',
              }}>
                <RNTextInput
                  value={chatText}
                  onChangeText={setChatText}
                  placeholder="Ask UniMate..."
                  placeholderTextColor="#A0A0A0"
                  multiline
                  editable={!isStreaming}
                  style={{
                    fontSize: 15, fontFamily: 'Inter_400Regular',
                    color: '#0A0A0A', maxHeight: 100, paddingVertical: 0,
                  }}
                />
              </View>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleSend(); }}
                disabled={!canSend}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: canSend ? '#0A0A0A' : '#E4E4E4',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Send size={18} color={canSend ? '#FFFFFF' : '#A0A0A0'} strokeWidth={2} style={{ marginLeft: 2 }} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Conversation List View ──────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      <AnimatedScreen>
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
            }}
          >
            <Text style={{ fontSize: 32, fontFamily: 'Inter_700Bold', color: '#0A0A0A', letterSpacing: -0.5 }}>
              Chat
            </Text>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowApiKeySheet(true); }}
              style={{
                width: 40, height: 40, borderRadius: 10,
                borderWidth: 1, borderColor: '#E4E4E4',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Settings size={20} color="#0A0A0A" strokeWidth={1.8} />
            </Pressable>
          </View>

          {conversations.length === 0 ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
              <EmptyState
                icon={<Sparkles size={64} color="#A0A0A0" strokeWidth={1.2} />}
                title={hasApiKey ? 'Start a conversation' : 'Set up Gemini AI'}
                description={
                  hasApiKey
                    ? 'Ask UniMate about your courses, files, or anything academic.'
                    : 'Add your Gemini API key to start chatting with your AI study assistant.'
                }
                actionLabel={hasApiKey ? 'New Chat' : 'Add API Key'}
                onAction={hasApiKey ? handleNewChat : () => setShowApiKeySheet(true)}
              />
            </ScrollView>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 108 }}
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              windowSize={5}
              renderItem={({ item: conv, index }) => (
                <ConversationRow
                  conversation={conv}
                  index={index}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); loadMessages(conv.id); }}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setActionConv({ id: conv.id, title: conv.title });
                    setShowConvActions(true);
                  }}
                />
              )}
            />
          )}

          {hasApiKey && (
            <AnimatedPressable
              onPress={handleNewChat}
              style={{
                position: 'absolute', bottom: 108, right: 20,
                width: 56, height: 56, borderRadius: 16,
                backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Plus size={24} color="#FFFFFF" strokeWidth={2} />
            </AnimatedPressable>
          )}

          <BottomSheet visible={showApiKeySheet} onDismiss={() => setShowApiKeySheet(false)} snapPoint={0.4}>
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Gemini API Key</Text>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>
                Get your free API key at ai.google.dev
              </Text>
              <Input label="API Key" value={apiKey} onChangeText={setApiKeyInput} secureTextEntry />
              <Button title="Save & Test" onPress={handleSaveApiKey} loading={testingKey} fullWidth />
            </View>
          </BottomSheet>

          {/* Conversation Actions Sheet */}
          <BottomSheet visible={showConvActions} onDismiss={() => { setShowConvActions(false); setActionConv(null); }} snapPoint={0.3}>
            {actionConv && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', marginBottom: 8 }} numberOfLines={1}>
                  {actionConv.title}
                </Text>
                <Button
                  title="Rename"
                  variant="secondary"
                  fullWidth
                  icon={<Edit3 size={18} color="#0A0A0A" strokeWidth={1.8} />}
                  onPress={() => {
                    setShowConvActions(false);
                    setTimeout(() => handleRename(actionConv.id, actionConv.title), 300);
                  }}
                />
                <Button
                  title="Delete"
                  variant="secondary"
                  fullWidth
                  icon={<Trash2 size={18} color="#EF4444" strokeWidth={1.8} />}
                  onPress={() => {
                    setShowConvActions(false);
                    setTimeout(() => handleDeleteConversation(actionConv.id, actionConv.title), 300);
                  }}
                />
              </View>
            )}
          </BottomSheet>
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  );
}

function ConversationRow({
  conversation, index, onPress, onLongPress,
}: {
  conversation: { id: string; title: string; updatedAt: string };
  index: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      entering={FadeIn.delay(Math.min(index, 6) * 40).duration(300)}
      onPressIn={() => { scale.value = withSpring(0.98, Springs.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, Springs.snappy); }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[pressStyle, {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 12,
      }]}
    >
      <View style={{
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center',
      }}>
        <MessageSquare size={18} color="#6E6E6E" strokeWidth={1.6} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: '#0A0A0A' }} numberOfLines={1}>
          {conversation.title}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#A0A0A0', marginTop: 2 }}>
          {getTimeAgo(conversation.updatedAt)}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
