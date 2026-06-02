import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import {
  X, ClipboardList, Clock, AlertTriangle, CheckCircle, RotateCcw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useQuizStore } from '../../lib/store/useQuizStore';
import { QuestionCard } from '../../components/quiz/QuestionCard';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

type ScreenState = 'loading' | 'info' | 'attempting' | 'submitting' | 'result' | 'error';

export default function QuizAttemptScreen() {
  const router = useRouter();
  const { quizId: quizIdParam } = useLocalSearchParams<{ quizId: string }>();
  const quizId = Number(quizIdParam);
  const { showToast } = useToast();

  const {
    quizzes, attempts, bestGrades, questions, answers, activeAttempt,
    activeQuiz, isLoadingAttempt, isSaving, isSubmitting,
    loadAttemptState, startAttempt, setAnswer, saveProgress,
    submitAttempt, clearAttempt, canAttempt, hasInProgress,
  } = useQuizStore();

  const quiz = quizzes.find((q) => q.id === quizId);
  const quizAttempts = attempts[quizId] ?? [];
  const bestGrade = bestGrades[quizId];
  const finishedAttempts = quizAttempts.filter((a) => a.state === 'finished');
  const inProgressAttempt = quizAttempts.find((a) => a.state === 'inprogress');

  const [screen, setScreen] = useState<ScreenState>('loading');
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Determine initial screen state after quiz + attempts load
  useEffect(() => {
    if (!quiz) return;
    loadAttemptState(quiz).then(() => {
      const { attempts: att } = useQuizStore.getState();
      const list = att[quiz.id] ?? [];
      const ip = list.find((a) => a.state === 'inprogress');
      if (ip) {
        setScreen('attempting');
      } else {
        setScreen('info');
      }
    }).catch((e) => {
      setErrorMsg(e?.message ?? 'Failed to load quiz');
      setScreen('error');
    });
  }, [quiz?.id]);

  // Auto-save every 30s during attempt
  useEffect(() => {
    if (screen !== 'attempting') return;
    autoSaveTimer.current = setInterval(() => {
      saveProgress().catch(() => {});
    }, 30_000);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [screen]);

  const answeredCount = Object.keys(answers).length;
  const totalCount = questions.length;
  const unansweredCount = totalCount - answeredCount;

  const handleStartOrResume = useCallback(async () => {
    if (!quiz) return;
    try {
      if (inProgressAttempt) {
        setScreen('attempting');
      } else {
        await startAttempt(quiz);
        setScreen('attempting');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      showToast(e?.message ?? 'Could not start quiz', 'error');
    }
  }, [quiz, inProgressAttempt]);

  const handleSubmitConfirm = useCallback(async () => {
    setShowConfirm(false);
    setScreen('submitting');
    if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    try {
      await submitAttempt();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScreen('result');
    } catch (e: any) {
      showToast(e?.message ?? 'Submission failed', 'error');
      setScreen('attempting');
    }
  }, []);

  const handleClose = useCallback(() => {
    clearAttempt();
    router.back();
  }, []);

  if (!quiz) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator color="#0A0A0A" />
      </View>
    );
  }

  // ─── Result screen ────────────────────────────────────────────────────────
  if (screen === 'result') {
    const finalAttempt = useQuizStore.getState().activeAttempt;
    const grade = useQuizStore.getState().bestGrades[quizId];
    const raw = finalAttempt?.sumgrades ?? 0;
    const total = quiz.sumgrades;
    const pct = total > 0 ? Math.round((raw / total) * 100) : 0;

    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{
            flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
          }}>
            <Animated.View entering={FadeInDown.springify().damping(20)} style={{ alignItems: 'center', gap: 16 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: pct >= 50 ? '#F0FDF4' : '#FEF2F2',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {pct >= 50
                  ? <CheckCircle size={36} color="#16A34A" strokeWidth={1.5} />
                  : <AlertTriangle size={36} color="#EF4444" strokeWidth={1.5} />
                }
              </View>

              <Text style={{ fontSize: 40, fontFamily: 'Inter_700Bold', color: '#0A0A0A', letterSpacing: -1 }}>
                {pct}%
              </Text>
              <Text style={{ fontSize: 16, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>
                {raw.toFixed(2)} / {total.toFixed(2)} marks
              </Text>
              {grade?.hasgrade && grade.grade != null && (
                <View style={{
                  paddingHorizontal: 16, paddingVertical: 8,
                  backgroundColor: '#F3F4F6', borderRadius: 10,
                }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#374151' }}>
                    Grade: {grade.grade.toFixed(2)} / {quiz.grade.toFixed(2)}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0', textAlign: 'center', marginTop: 4 }}>
                {quiz.name}
              </Text>
            </Animated.View>
          </View>
          <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
            <Button title="Done" onPress={handleClose} fullWidth />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Error screen ─────────────────────────────────────────────────────────
  if (screen === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 16 }}>
            <Pressable onPress={handleClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} color="#0A0A0A" />
            </Pressable>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <AlertTriangle size={48} color="#EF4444" strokeWidth={1.5} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', marginTop: 16, textAlign: 'center' }}>
              {errorMsg || 'Something went wrong'}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (screen === 'loading' || isLoadingAttempt) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#0A0A0A" />
        <Text style={{ marginTop: 12, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
          Loading quiz…
        </Text>
      </View>
    );
  }

  // ─── Info screen (pre-attempt or completed) ───────────────────────────────
  if (screen === 'info') {
    const quizClosed = quiz.timeclose > 0 && quiz.timeclose * 1000 < Date.now();
    const maxAttempts = quiz.attempts;
    const attemptsLeft = maxAttempts === 0 ? null : maxAttempts - finishedAttempts.length;
    const noAttemptsLeft = attemptsLeft !== null && attemptsLeft <= 0;

    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
            borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
          }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Quiz</Text>
            <Pressable onPress={handleClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} color="#0A0A0A" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.springify().damping(20)} style={{ gap: 20 }}>
              {/* Quiz title */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: '#0A0A0A', letterSpacing: -0.5 }}>
                  {quiz.name}
                </Text>
              </View>

              {/* Info grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <InfoChip label="Questions" value={String(quiz.sumgrades)} />
                <InfoChip
                  label="Time Limit"
                  value={quiz.timelimit > 0 ? `${Math.round(quiz.timelimit / 60)} min` : 'None'}
                />
                <InfoChip
                  label="Attempts Allowed"
                  value={maxAttempts === 0 ? 'Unlimited' : String(maxAttempts)}
                />
                {attemptsLeft !== null && (
                  <InfoChip
                    label="Attempts Left"
                    value={String(Math.max(0, attemptsLeft))}
                    highlight={attemptsLeft <= 1 && !noAttemptsLeft}
                  />
                )}
                {bestGrade?.hasgrade && bestGrade.grade != null && (
                  <InfoChip label="Best Grade" value={`${bestGrade.grade.toFixed(1)} / ${quiz.grade.toFixed(1)}`} />
                )}
              </View>

              {/* Past attempts */}
              {finishedAttempts.length > 0 && (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Past Attempts
                  </Text>
                  {finishedAttempts.map((att) => (
                    <View key={att.id} style={{
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                      padding: 14, backgroundColor: '#F9FAFB', borderRadius: 12,
                      borderWidth: 1, borderColor: '#F3F4F6',
                    }}>
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#374151' }}>
                        Attempt {att.attempt}
                      </Text>
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>
                        {att.sumgrades != null
                          ? `${att.sumgrades.toFixed(2)} / ${quiz.sumgrades.toFixed(2)}`
                          : '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          </ScrollView>

          {/* CTA */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 10 }}>
            {inProgressAttempt ? (
              // Resume takes priority over all other states
              <Button
                title="Resume Quiz"
                icon={<RotateCcw size={16} color="#FFFFFF" />}
                onPress={handleStartOrResume}
                loading={isLoadingAttempt}
                fullWidth
              />
            ) : quizClosed ? (
              <View style={{ padding: 14, backgroundColor: '#FEF2F2', borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#EF4444' }}>
                  This quiz is closed
                </Text>
              </View>
            ) : noAttemptsLeft ? (
              <View style={{ padding: 14, backgroundColor: '#F3F4F6', borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#6B7280' }}>
                  No attempts remaining
                </Text>
              </View>
            ) : (
              <Button
                title={finishedAttempts.length > 0 ? 'Retake Quiz' : 'Start Quiz'}
                icon={finishedAttempts.length > 0
                  ? <RotateCcw size={16} color="#FFFFFF" />
                  : <ClipboardList size={16} color="#FFFFFF" />
                }
                onPress={handleStartOrResume}
                loading={isLoadingAttempt}
                fullWidth
              />
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Submitting ───────────────────────────────────────────────────────────
  if (screen === 'submitting' || isSubmitting) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#0A0A0A" />
        <Text style={{ marginTop: 12, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>
          Submitting…
        </Text>
      </View>
    );
  }

  // ─── Attempt screen (main quiz UI) ────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 20, paddingVertical: 12, gap: 12,
          borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
        }}>
          <Pressable
            onPress={handleClose}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} color="#0A0A0A" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }} numberOfLines={1}>
              {quiz.name}
            </Text>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#A0A0A0', marginTop: 1 }}>
              {answeredCount} / {totalCount} answered
            </Text>
          </View>
          {isSaving && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ActivityIndicator size="small" color="#A0A0A0" />
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#A0A0A0' }}>Saving</Text>
            </View>
          )}
        </View>

        {/* Progress bar */}
        <View style={{ height: 3, backgroundColor: '#F0F0F0' }}>
          <Animated.View style={{
            height: '100%', backgroundColor: '#0A0A0A',
            width: `${totalCount > 0 ? (answeredCount / totalCount) * 100 : 0}%`,
          }} />
        </View>

        {/* Questions */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {questions.map((q, i) => (
            <QuestionCard
              key={q.slot}
              question={q}
              selectedValue={answers[q.slot] ?? null}
              onSelect={setAnswer}
              index={i}
            />
          ))}
        </ScrollView>

        {/* Sticky submit bar */}
        <SafeAreaView edges={['bottom']} style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F0F0F0',
          paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
        }}>
          {unansweredCount > 0 && (
            <Text style={{
              fontSize: 12, fontFamily: 'Inter_400Regular', color: '#A0A0A0',
              textAlign: 'center', marginBottom: 8,
            }}>
              {unansweredCount} question{unansweredCount > 1 ? 's' : ''} unanswered
            </Text>
          )}
          <Button
            title="Submit Quiz"
            onPress={() => setShowConfirm(true)}
            fullWidth
          />
        </SafeAreaView>
      </SafeAreaView>

      {/* Submit confirmation sheet */}
      <BottomSheet visible={showConfirm} onDismiss={() => setShowConfirm(false)} snapPoint={0.4}>
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#0A0A0A' }}>Submit Quiz?</Text>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>Answered</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>{answeredCount}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>Unanswered</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: unansweredCount > 0 ? '#EF4444' : '#0A0A0A' }}>
                {unansweredCount}
              </Text>
            </View>
          </View>
          {unansweredCount > 0 && (
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#EF4444' }}>
              Unanswered questions will be marked as incorrect.
            </Text>
          )}
          <View style={{ gap: 10, marginTop: 4 }}>
            <Button title="Submit" onPress={handleSubmitConfirm} fullWidth />
            <Button title="Go Back" variant="secondary" onPress={() => setShowConfirm(false)} fullWidth />
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

function InfoChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{
      paddingHorizontal: 14, paddingVertical: 10,
      backgroundColor: highlight ? '#FEF9C3' : '#F3F4F6',
      borderRadius: 10, minWidth: '44%', flex: 1,
    }}>
      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#6B7280', marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: highlight ? '#92400E' : '#0A0A0A' }}>{value}</Text>
    </View>
  );
}
