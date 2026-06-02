import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Springs } from '../../lib/theme';
import type { ParsedQuestion } from '../../lib/store/useQuizStore';

interface QuestionCardProps {
  question: ParsedQuestion;
  selectedValue: string | null;
  onSelect: (slot: number, value: string) => void;
  index?: number;
}

export function QuestionCard({ question, selectedValue, onSelect, index = 0 }: QuestionCardProps) {
  const isSupported = question.type === 'multichoice' || question.type === 'truefalse';

  return (
    <Animated.View
      entering={FadeIn.delay(Math.min(index, 10) * 30).duration(250)}
      style={{
        marginHorizontal: 20, marginBottom: 12,
        backgroundColor: '#FAFAFA', borderRadius: 16,
        borderWidth: 1, borderColor: '#F0F0F0', overflow: 'hidden',
      }}
    >
      {/* Question header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
        borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
      }}>
        <View style={{
          width: 26, height: 26, borderRadius: 8,
          backgroundColor: selectedValue !== null ? '#0A0A0A' : '#EBEBEB',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{
            fontSize: 11, fontFamily: 'Inter_700Bold',
            color: selectedValue !== null ? '#FFFFFF' : '#A0A0A0',
          }}>
            {question.number}
          </Text>
        </View>
        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
          {question.maxMark} mark{question.maxMark !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Question text */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 }}>
        <Text style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: '#0A0A0A', lineHeight: 22 }}>
          {question.text}
        </Text>
      </View>

      {/* Options */}
      {isSupported ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 6 }}>
          {question.options.map((opt) => (
            <OptionRow
              key={opt.value}
              label={opt.label}
              selected={selectedValue === opt.value}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(question.slot, opt.value);
              }}
            />
          ))}
        </View>
      ) : (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
            This question type ({question.type}) is not supported in-app.
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

  return (
    <AnimatedPressable
      style={[style, {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 14, paddingVertical: 12,
        borderRadius: 12, borderWidth: 1.5,
        backgroundColor: selected ? '#0A0A0A' : '#FFFFFF',
        borderColor: selected ? '#0A0A0A' : '#E4E4E4',
      }]}
      onPressIn={() => { scale.value = withSpring(0.97, Springs.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, Springs.snappy); }}
      onPress={onPress}
    >
      <View style={{
        width: 18, height: 18, borderRadius: 9, borderWidth: 2,
        borderColor: selected ? '#FFFFFF' : '#D4D4D4',
        backgroundColor: selected ? '#FFFFFF' : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#0A0A0A' }} />}
      </View>
      <Text style={{
        flex: 1, fontSize: 14, fontFamily: selected ? 'Inter_500Medium' : 'Inter_400Regular',
        color: selected ? '#FFFFFF' : '#374151', lineHeight: 20,
      }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
