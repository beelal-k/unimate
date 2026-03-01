// components/chat/MessageBubble.tsx
// Chat message bubble with user/AI styling and simple markdown

import React, { memo } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

interface MessageBubbleProps {
  role: 'user' | 'model';
  content: string;
  isStreaming?: boolean;
  index?: number;
}

function parseSimpleMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split('\n');

  lines.forEach((line, lineIdx) => {
    // Bold
    const boldParts = line.split(/\*\*(.*?)\*\*/g);
    const lineNodes: React.ReactNode[] = [];

    boldParts.forEach((part, partIdx) => {
      if (partIdx % 2 === 1) {
        // Bold text
        lineNodes.push(
          <Text key={`${lineIdx}-b-${partIdx}`} style={{ fontFamily: 'Inter_700Bold' }}>
            {part}
          </Text>
        );
      } else if (part) {
        // Check for inline code
        const codeParts = part.split(/`([^`]+)`/g);
        codeParts.forEach((codePart, codeIdx) => {
          if (codeIdx % 2 === 1) {
            lineNodes.push(
              <Text
                key={`${lineIdx}-c-${partIdx}-${codeIdx}`}
                style={{
                  fontFamily: 'Inter_400Regular',
                  backgroundColor: '#F3F3F3',
                  paddingHorizontal: 4,
                  fontSize: 13,
                }}
              >
                {codePart}
              </Text>
            );
          } else if (codePart) {
            lineNodes.push(
              <Text key={`${lineIdx}-t-${partIdx}-${codeIdx}`}>{codePart}</Text>
            );
          }
        });
      }
    });

    if (lineIdx > 0) nodes.push(<Text key={`nl-${lineIdx}`}>{'\n'}</Text>);

    // Headers
    if (line.startsWith('### ')) {
      nodes.push(
        <Text key={`h3-${lineIdx}`} style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
          {line.slice(4)}
        </Text>
      );
    } else if (line.startsWith('## ')) {
      nodes.push(
        <Text key={`h2-${lineIdx}`} style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
          {line.slice(3)}
        </Text>
      );
    } else if (line.startsWith('# ')) {
      nodes.push(
        <Text key={`h1-${lineIdx}`} style={{ fontFamily: 'Inter_700Bold', fontSize: 16 }}>
          {line.slice(2)}
        </Text>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push(
        <Text key={`li-${lineIdx}`}>
          {'  • '}
          {lineNodes.length > 0 ? lineNodes : line.slice(2)}
        </Text>
      );
    } else {
      nodes.push(...lineNodes);
    }
  });

  return nodes;
}

export const MessageBubble = memo(function MessageBubble({
  role,
  content,
  isStreaming = false,
  index = 0,
}: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <Animated.View
      entering={SlideInDown.delay(Math.min(index, 3) * 30).duration(200).springify()}
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        marginBottom: 12,
      }}
    >
      <View
        style={{
          backgroundColor: isUser ? '#0A0A0A' : '#F3F3F3',
          borderRadius: 16,
          borderTopRightRadius: isUser ? 4 : 16,
          borderTopLeftRadius: isUser ? 16 : 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontFamily: 'Inter_400Regular',
            color: isUser ? '#FFFFFF' : '#0A0A0A',
            lineHeight: 20,
          }}
        >
          {isUser ? content : parseSimpleMarkdown(content)}
          {isStreaming && (
            <Text style={{ color: '#A0A0A0' }}> ▍</Text>
          )}
        </Text>
      </View>
    </Animated.View>
  );
});
