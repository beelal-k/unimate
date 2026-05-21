// components/chat/ChatInput.tsx
// Chat input bar with attach, text input, and send button

import React, { useState, useCallback, useRef } from 'react';
import { View, TextInput, Pressable, Keyboard } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Send, Paperclip } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Springs } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ChatInputProps {
  onSend: (text: string) => void;
  onAttach?: () => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, onAttach, disabled = false }: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const sendScale = useSharedValue(1);

  const sendStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendScale.value = withSpring(0.85, Springs.snappy, () => {
      sendScale.value = withSpring(1, Springs.smooth);
    });
    onSend(text.trim());
    setText('');
  }, [text, canSend, onSend]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingBottom: 8,
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* Attach button */}
      {onAttach && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAttach();
          }}
          disabled={disabled}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.4 : 1,
          }}
        >
          <Paperclip size={20} color="#6E6E6E" strokeWidth={1.8} />
        </Pressable>
      )}

      {/* Text input */}
      <View
        style={{
          flex: 1,
          backgroundColor: '#F3F3F3',
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 8,
          minHeight: 40,
          maxHeight: 120,
          justifyContent: 'center',
        }}
      >
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder="Ask UniMate..."
          placeholderTextColor="#A0A0A0"
          multiline
          editable={!disabled}
          style={{
            fontSize: 15,
            fontFamily: 'Inter_400Regular',
            color: '#0A0A0A',
            maxHeight: 100,
            paddingVertical: 0,
          }}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
      </View>

      {/* Send button */}
      <AnimatedPressable
        onPress={handleSend}
        disabled={!canSend}
        style={[
          sendStyle,
          {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: canSend ? '#0A0A0A' : '#E4E4E4',
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Send
          size={18}
          color={canSend ? '#FFFFFF' : '#A0A0A0'}
          strokeWidth={2}
          style={{ marginLeft: 2 }}
        />
      </AnimatedPressable>
    </View>
  );
}
