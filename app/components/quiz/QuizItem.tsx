import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  FadeIn, useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { ClipboardList, ChevronRight, Clock, RotateCcw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Springs, AnimationConfig } from '../../lib/theme';
import type { MoodleQuiz, MoodleAttempt } from '../../lib/store/useQuizStore';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface QuizItemProps {
  quiz: MoodleQuiz;
  courseName: string;
  attempts: MoodleAttempt[];
  bestGrade?: { hasgrade: boolean; grade?: number };
  index?: number;
}

function getQuizBadge(
  quiz: MoodleQuiz,
  attempts: MoodleAttempt[],
  bestGrade?: { hasgrade: boolean; grade?: number },
) {
  const finished = attempts.filter((a) => a.state === 'finished').length;
  const inProgress = attempts.some((a) => a.state === 'inprogress');
  const maxAttempts = quiz.attempts;
  const attemptsLeft = maxAttempts === 0 ? null : maxAttempts - finished;
  const isClosed = quiz.timeclose > 0 && quiz.timeclose * 1000 < Date.now();
  const noAttemptsLeft = attemptsLeft !== null && attemptsLeft <= 0;

  if (inProgress) {
    return { label: 'In Progress', bg: '#FEF9C3', text: '#92400E' };
  }
  if (noAttemptsLeft || isClosed) {
    if (bestGrade?.hasgrade && bestGrade.grade != null) {
      return {
        label: `${bestGrade.grade.toFixed(1)} / ${quiz.grade.toFixed(1)}`,
        bg: '#F3F4F6', text: '#374151',
      };
    }
    return { label: 'Completed', bg: '#F3F4F6', text: '#6B7280' };
  }
  if (finished > 0) {
    return {
      label: attemptsLeft !== null ? `${attemptsLeft} left` : 'Retake',
      bg: '#F0FDF4', text: '#166534',
    };
  }
  return { label: 'Available', bg: '#F3F4F6', text: '#6E6E6E' };
}

export function QuizItem({ quiz, courseName, attempts, bestGrade, index = 0 }: QuizItemProps) {
  const router = useRouter();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const badge = getQuizBadge(quiz, attempts, bestGrade);
  const finishedCount = attempts.filter((a) => a.state === 'finished').length;
  const inProgress = attempts.some((a) => a.state === 'inprogress');
  const maxAttempts = quiz.attempts;
  const isClosed = quiz.timeclose > 0 && quiz.timeclose * 1000 < Date.now();
  const noAttemptsLeft = maxAttempts > 0 && finishedCount >= maxAttempts;

  return (
    <Animated.View entering={FadeIn.delay(Math.min(index, 6) * 40).duration(300)}>
      <AnimatedPressable
        onPressIn={() => { scale.value = withSpring(AnimationConfig.cardPressScale, Springs.snappy); }}
        onPressOut={() => { scale.value = withSpring(1, Springs.snappy); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/(modals)/quiz-attempt?quizId=${quiz.id}` as any);
        }}
        style={[pressStyle, {
          paddingVertical: 14, paddingHorizontal: 16,
          borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
          opacity: (noAttemptsLeft && !inProgress) ? 0.7 : 1,
        }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          {/* Icon */}
          <View style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: inProgress ? '#FEF9C3' : '#F3F4F6',
            alignItems: 'center', justifyContent: 'center', marginTop: 2,
          }}>
            {inProgress
              ? <RotateCcw size={16} color="#92400E" strokeWidth={2} />
              : <ClipboardList size={16} color="#6E6E6E" strokeWidth={1.8} />
            }
          </View>

          {/* Text */}
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#0A0A0A' }} numberOfLines={2}>
              {quiz.name}
            </Text>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }} numberOfLines={1}>
              {courseName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              {quiz.timelimit > 0 && (
                <>
                  <Clock size={11} color="#A0A0A0" strokeWidth={1.6} />
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>
                    {Math.round(quiz.timelimit / 60)} min
                  </Text>
                  <Text style={{ fontSize: 11, color: '#E4E4E4' }}>•</Text>
                </>
              )}
              {isClosed ? (
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#EF4444' }}>Closed</Text>
              ) : (
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
                  {maxAttempts === 0
                    ? 'Unlimited attempts'
                    : `${maxAttempts} attempt${maxAttempts > 1 ? 's' : ''} allowed`}
                </Text>
              )}
            </View>
          </View>

          {/* Badge + chevron */}
          <View style={{ alignItems: 'flex-end', gap: 6, paddingTop: 2 }}>
            <View style={{ backgroundColor: badge.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: badge.text }}>
                {badge.label}
              </Text>
            </View>
            <ChevronRight size={16} color="#A0A0A0" strokeWidth={2} />
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}
