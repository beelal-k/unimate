// app/(modals)/assignment.tsx
// Assignment Details + AI Analysis Screen

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Linking, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  X, FileText, Download, Clock, BookOpen, CheckCircle,
  Bell, BellRing, Settings, ExternalLink, Link,
  Upload, Award, Paperclip, AlertCircle, CheckCircle2,
} from 'lucide-react-native';
import { randomUUID } from 'expo-crypto';

import { useLmsStore, type LmsAttachment } from '../../lib/store/useLmsStore';
import { useFilesStore } from '../../lib/store/useFilesStore';
import { submitAnalyzeAssignmentJob, getJobStatus, getJobResult } from '../../lib/api/server';
import { Button } from '../../components/ui/Button';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import {
  getMoodleCredentials,
  getSiteInfo,
  getUnusedDraftItemId,
  uploadFileToDraft,
  saveSubmission,
  submitForGrading,
  removeSubmission,
} from '../../lib/api/moodle';

const DRAFT_SEEN_KEY = 'unimate_draft_explanation_shown';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return 'No due date';
  return new Date(dueDate).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

async function saveAIDraft(
  pdfBase64: string,
  assignmentName: string,
  filesStore: ReturnType<typeof useFilesStore.getState>,
): Promise<string | null> {
  await filesStore.loadNodes();

  // Find or create "AI Drafts" folder at root
  const existing = filesStore.nodes.find(
    (n) => n.type === 'folder' && n.name === 'AI Drafts' && n.parentId === null,
  );
  let folderId: string;
  if (existing) {
    folderId = existing.id;
  } else {
    const folder = await filesStore.createFolder('AI Drafts', null);
    folderId = folder.id;
  }

  // Write PDF to cache dir then hand off to uploadFile which copies it to permanent storage
  const tempUri = `${FileSystem.cacheDirectory}draft_${randomUUID()}.pdf`;
  await FileSystem.writeAsStringAsync(tempUri, pdfBase64, {
    encoding: 'base64' as any,
  });

  const sizeBytes = Math.floor(pdfBase64.length * 0.75);
  const safeName = assignmentName.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Assignment';
  const fileNode = await filesStore.uploadFile(tempUri, `${safeName} Draft.pdf`, 'application/pdf', sizeBytes, folderId);

  // Clean up temp file
  FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});

  return fileNode?.localUri ?? null;
}

export default function AssignmentDetailModal() {
  const router = useRouter();
  const { id, autoGenerate } = useLocalSearchParams<{ id: string; autoGenerate?: string }>();
  const { items, toggleItemDone, updateReminderSettings, markAsSubmitted, markAsUnsubmitted } = useLmsStore();
  const filesStore = useFilesStore();
  const { showToast } = useToast();

  const item = items.find((i) => i.id === id && i.type === 'assignment');

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const pollInterval = useRef<NodeJS.Timeout | null>(null);
  const jobStatusRef = useRef(jobStatus);
  jobStatusRef.current = jobStatus;

  // Pre-flight form
  const [showPreflightSheet, setShowPreflightSheet] = useState(false);
  const [assignmentNumber, setAssignmentNumber] = useState('');
  const [teacherName, setTeacherName] = useState('');

  // One-time explanation sheet (shown after first successful draft)
  const [showExplanationSheet, setShowExplanationSheet] = useState(false);
  const [savedPdfUri, setSavedPdfUri] = useState<string | null>(null);

  // Submission state
  const [showSubmitSheet, setShowSubmitSheet] = useState(false);
  const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; mimeType: string; size: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [submitStep, setSubmitStep] = useState<'idle' | 'uploading' | 'saving' | 'done' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reminders state
  const [showRemindersSheet, setShowRemindersSheet] = useState(false);
  const [customDaysBefore, setCustomDaysBefore] = useState('1');
  const [customHourStr, setCustomHourStr] = useState('17');
  const [customMinuteStr, setCustomMinuteStr] = useState('00');

  // Auto-open pre-flight when launched via "Generate Draft" notification action.
  // NOTE: `handleGenerateDraft` is intentionally omitted from deps — it is declared
  // later with useCallback, and referencing it in the dep array here would hit the
  // temporal dead zone and throw on render. The body reference runs post-mount, so
  // it resolves fine at call time.
  useEffect(() => {
    if (autoGenerate === 'true' && item && jobStatus === 'idle') {
      const t = setTimeout(() => handleGenerateDraft(), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, item?.id]);

  // Poll job status — only restarts when jobId changes
  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      if (jobStatusRef.current === 'done' || jobStatusRef.current === 'failed') {
        if (pollInterval.current) clearInterval(pollInterval.current);
        return;
      }
      try {
        const res = await getJobStatus(jobId);
        setJobStatus(res.status);
        setProgress(res.progress || 0);
        setProgressMessage(res.progressMessage || 'Processing...');

        if (res.status === 'done') {
          if (pollInterval.current) clearInterval(pollInterval.current);
          const raw = await getJobResult(jobId);
          const result = {
            ...raw,
            deliverables: typeof raw.deliverables === 'string'
              ? JSON.parse(raw.deliverables)
              : (raw.deliverables ?? []),
            sourcesUsed: typeof raw.sourcesUsed === 'string'
              ? JSON.parse(raw.sourcesUsed)
              : (raw.sourcesUsed ?? []),
          };
          setAnalysisResult(result);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          // Local "Draft Ready" notification (replaces the removed server push)
          if (item) {
            try {
              const N = require('../../lib/notifications') as typeof import('../../lib/notifications');
              N.notifyDraftReady(item.title, item.id).catch(() => {});
            } catch {}
          }

          // Save PDF to AI Drafts folder
          if (result.pdfBase64 && item) {
            saveAIDraft(result.pdfBase64, item.title, useFilesStore.getState())
              .then((uri) => { if (uri) setSavedPdfUri(uri); })
              .catch((err) => { console.warn('[Assignment] PDF save failed:', err); });
          }

          // Show explanation sheet only on first ever successful draft
          const seen = await SecureStore.getItemAsync(DRAFT_SEEN_KEY);
          if (!seen) {
            await SecureStore.setItemAsync(DRAFT_SEEN_KEY, '1');
            setShowExplanationSheet(true);
          }
        } else if (res.status === 'failed') {
          if (pollInterval.current) clearInterval(pollInterval.current);
          showToast('Analysis failed', 'error');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch (err) {
        console.warn('[Assignment] Poll error:', err);
      }
    };

    pollInterval.current = setInterval(poll, 3000);
    poll();
    return () => { if (pollInterval.current) clearInterval(pollInterval.current); };
  }, [jobId]);

  const handleGenerateDraft = useCallback(async () => {
    if (!item) {
      showToast('Assignment not found', 'error');
      return;
    }
    if (!item.moodleId || !item.courseId) {
      showToast('Sync your LMS to enable draft generation', 'error');
      return;
    }
    setShowPreflightSheet(true);
  }, [item]);

  const handleSubmitPreflight = useCallback(async () => {
    if (!item) return;
    setShowPreflightSheet(false);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setJobStatus('processing');
      setProgress(5);
      setProgressMessage('Initializing analysis...');
      const response = await submitAnalyzeAssignmentJob({
        assignmentId: String(item.moodleId),
        courseId: String(item.courseId),
        courseName: item.courseName,
        assignmentName: item.title,
        dueDate: item.dueDate,
        assignmentNumber: assignmentNumber.trim() || undefined,
        teacherName: teacherName.trim() || undefined,
      });
      setJobId(response.jobId);
    } catch (err: any) {
      console.warn('[Draft] Submit failed:', err);
      showToast(err.message || 'Failed to start analysis', 'error');
      setJobStatus('idle');
    }
  }, [item, assignmentNumber, teacherName]);

  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setPickedFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? 0,
      });
      setSubmitStep('idle');
      setSubmitError(null);
    } catch {
      showToast('Failed to pick file', 'error');
    }
  }, []);

  const handleSubmitAssignment = useCallback(async () => {
    if (!item?.moodleId || !pickedFile) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const creds = await getMoodleCredentials();
      if (!creds) throw new Error('Not connected to Moodle');

      setSubmitStep('uploading');
      const draftId = await getUnusedDraftItemId(creds);
      await uploadFileToDraft(creds, draftId, pickedFile.uri, pickedFile.name, pickedFile.mimeType);

      setSubmitStep('saving');
      await saveSubmission(creds, item.moodleId, draftId);
      // Best-effort: submit for grading (not all assignments require this)
      try { await submitForGrading(creds, item.moodleId); } catch {}

      setSubmitStep('done');
      await markAsSubmitted(item.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Submitted successfully', 'success');
    } catch (err: any) {
      setSubmitStep('error');
      setSubmitError(err.message || 'Submission failed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  }, [item, pickedFile]);

  const handleRemoveSubmission = useCallback(async () => {
    if (!item?.moodleId) return;
    setIsRemoving(true);
    setSubmitError(null);
    try {
      const creds = await getMoodleCredentials();
      if (!creds) throw new Error('Not connected to Moodle');
      const siteInfo = await getSiteInfo(creds);
      await removeSubmission(creds, item.moodleId, siteInfo.userid);
      await markAsUnsubmitted(item.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Submission removed', 'success');
      setShowSubmitSheet(false);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to remove submission');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsRemoving(false);
    }
  }, [item]);

  const openAttachment = (att: LmsAttachment) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(att.fileurl).catch(() => showToast('Failed to open file', 'error'));
  };

  const currentReminderType = item?.reminderSettings === 'daily'
    ? 'daily'
    : (item?.reminderSettings?.startsWith('{') ? 'custom' : 'default');

  const handleApplyCustomReminder = () => {
    if (!item) return;
    const days = parseInt(customDaysBefore) || 1;
    let hr = parseInt(customHourStr) || 17;
    let min = parseInt(customMinuteStr) || 0;
    if (hr < 0 || hr > 23) hr = 17;
    if (min < 0 || min > 59) min = 0;
    const payload = JSON.stringify({ type: 'custom', daysBefore: days, hour: hr, minute: min });
    updateReminderSettings(item.id, payload);
    setShowRemindersSheet(false);
    showToast(`Reminders set: ${days} day(s) before at ${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`, 'success');
  };

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => router.back()} />

      <Animated.View
        entering={FadeInDown.springify().damping(20).stiffness(200)}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          height: '85%', overflow: 'hidden',
        }}
      >
        <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
            borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
          }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>
              Assignment Details
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={18} color="#0A0A0A" />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {/* Title & Course */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: '#0A0A0A', letterSpacing: -0.5, marginBottom: 8 }}>
                {item.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <BookOpen size={14} color="#6E6E6E" />
                <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#6E6E6E' }}>{item.courseName}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Clock size={14} color="#6E6E6E" />
                <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6E6E6E' }}>{formatDueDate(item.dueDate)}</Text>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              <Button
                title={item.isDone ? "Done" : "Mark as Done"}
                variant={item.isDone ? "secondary" : "primary"}
                icon={<CheckCircle size={16} color={item.isDone ? "#0A0A0A" : "#FFFFFF"} />}
                onPress={() => toggleItemDone(item.id, !item.isDone)}
                style={{ flex: 1 }}
              />
              <Button
                title={
                  currentReminderType === 'daily' ? "Daily"
                  : currentReminderType === 'custom' ? "Custom"
                  : "Default"
                }
                variant="secondary"
                icon={<Bell size={16} color="#0A0A0A" />}
                onPress={() => setShowRemindersSheet(true)}
                style={{ flex: 1 }}
              />
            </View>

            {/* AI Analysis Section */}
            {/*
            <View style={{
              backgroundColor: jobStatus === 'idle' ? '#F9FAFB' : jobStatus === 'failed' ? '#FEF2F2' : '#F5F3FF',
              borderRadius: 16, padding: 16, marginBottom: 24,
              borderWidth: 1, borderColor: jobStatus === 'idle' ? '#F3F4F6' : jobStatus === 'failed' ? '#FECACA' : '#EDE9FE',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: jobId || analysisResult ? 16 : 0 }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: jobStatus === 'idle' ? '#F3F4F6' : jobStatus === 'failed' ? '#FEE2E2' : '#8B5CF6',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sparkles size={16} color={jobStatus === 'idle' ? '#6B7280' : jobStatus === 'failed' ? '#DC2626' : '#FFFFFF'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: jobStatus === 'failed' ? '#991B1B' : '#111827' }}>
                    AI Analysis & Draft
                  </Text>
                  {jobStatus === 'idle' && (
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6B7280', marginTop: 2 }}>
                      Generate a draft based on your course materials.
                    </Text>
                  )}
                  {(jobStatus === 'pending' || jobStatus === 'processing') && (
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6D28D9', marginTop: 2 }}>
                      {jobStatus === 'pending' ? 'Queued...' : progressMessage}
                    </Text>
                  )}
                  {jobStatus === 'done' && (
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6D28D9', marginTop: 2 }}>
                      Analysis complete - PDF saved to Files
                    </Text>
                  )}
                </View>
              </View>

              {jobStatus === 'idle' && (
                <Button title="Generate Draft" icon={<Sparkles size={16} color="#FFFFFF" />} onPress={handleGenerateDraft} style={{ marginTop: 16 }} />
              )}

              {(jobStatus === 'pending' || jobStatus === 'processing') && (
                <View style={{ gap: 8 }}>
                  <View style={{ height: 6, backgroundColor: '#DDD6FE', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: '100%', backgroundColor: '#8B5CF6', borderRadius: 3, width: jobStatus === 'pending' ? '5%' : `${progress}%` }} />
                  </View>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: '#6D28D9', textAlign: 'right' }}>
                    {jobStatus === 'pending' ? 'Queued' : `${progress}%`}
                  </Text>
                </View>
              )}

              {jobStatus === 'failed' && (
                <Button title="Retry" variant="secondary" icon={<RefreshCw size={16} color="#0A0A0A" />} onPress={handleGenerateDraft} style={{ marginTop: 8 }} />
              )}

              {jobStatus === 'done' && analysisResult && (
                <View style={{ gap: 16, marginTop: 8 }}>
                  {analysisResult.summary && (
                    <View>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#4C1D95', textTransform: 'uppercase', marginBottom: 4 }}>Summary</Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#111827', lineHeight: 20 }}>{analysisResult.summary}</Text>
                    </View>
                  )}
                  {analysisResult.deliverables?.length > 0 && (
                    <View>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#4C1D95', textTransform: 'uppercase', marginBottom: 4 }}>Deliverables</Text>
                      {analysisResult.deliverables.map((d: string, i: number) => (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                          <CheckCircle size={14} color="#8B5CF6" style={{ marginTop: 2 }} />
                          <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#111827', lineHeight: 18 }}>{d}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {savedPdfUri && (
                    <Button
                      title="Open Draft PDF"
                      variant="secondary"
                      icon={<ExternalLink size={16} color="#0A0A0A" />}
                      onPress={() => Sharing.shareAsync(savedPdfUri)}
                      style={{ marginTop: 4 }}
                    />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: savedPdfUri ? 8 : 0 }}>
                    <FileDown size={14} color="#6D28D9" />
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: '#6D28D9' }}>
                      PDF saved to Files &gt; AI Drafts
                    </Text>
                  </View>
                </View>
              )}
            </View>
            */}

            {/* Grade */}
            {(item.status === 'graded' || item.grade !== null) && (
              <View style={{
                backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 24,
                borderWidth: 1, borderColor: '#BBF7D0',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10, backgroundColor: '#DCFCE7',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Award size={18} color="#16A34A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: '#15803D' }}>Grade Received</Text>
                    <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: '#15803D', marginTop: 2 }}>
                      {item.grade ?? '—'}
                      {item.maxGrade ? (
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#16A34A' }}>
                          {' '}/ {item.maxGrade}
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                  {item.grade !== null && item.maxGrade !== null && (
                    <View style={{ backgroundColor: '#16A34A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>
                        {Math.round((parseFloat(item.grade) / parseFloat(item.maxGrade)) * 100)}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Submit Assignment */}
            {item.submissionConfig && item.status !== 'graded' && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', marginBottom: 12 }}>
                  Submit Assignment
                </Text>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowSubmitSheet(true); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: item.status === 'submitted' ? '#F0FDF4' : '#F9FAFB',
                    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                    borderWidth: 1.5, borderColor: item.status === 'submitted' ? '#BBF7D0' : '#E5E7EB',
                  }}
                >
                  <View style={{
                    width: 38, height: 38, borderRadius: 10,
                    backgroundColor: item.status === 'submitted' ? '#DCFCE7' : '#F3F4F6',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {item.status === 'submitted'
                      ? <CheckCircle2 size={18} color="#16A34A" />
                      : <Upload size={18} color="#6B7280" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#111827' }}>
                      {item.status === 'submitted' ? 'Submitted' : 'Attach & Submit'}
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6B7280', marginTop: 2 }}>
                      {item.submissionConfig.allowedTypes.length > 0
                        ? item.submissionConfig.allowedTypes.join(', ')
                        : 'Any file type'}{item.submissionConfig.maxSizeBytes > 0
                        ? ` · max ${formatFileSize(item.submissionConfig.maxSizeBytes)}`
                        : ''}
                    </Text>
                  </View>
                  <ExternalLink size={16} color="#9CA3AF" />
                </Pressable>
              </View>
            )}

            {/* Description */}
            {item.description && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', marginBottom: 8 }}>Instructions</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#374151', lineHeight: 22 }}>{item.description}</Text>
              </View>
            )}

            {/* Attachments & Links */}
            {item.attachments?.length > 0 && (
              <View>
                <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', marginBottom: 12 }}>Attachments</Text>
                <View style={{ gap: 8 }}>
                  {item.attachments.map((att, i) => {
                    const isLink = att.type === 'link' || att.mimetype === 'link';
                    let subtitle = isLink ? att.fileurl : formatFileSize(att.filesize);
                    try {
                      if (isLink) subtitle = new URL(att.fileurl).hostname;
                    } catch {}
                    return (
                      <Pressable
                        key={i}
                        onPress={() => openAttachment(att)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          backgroundColor: '#F9FAFB', borderRadius: 12,
                          paddingHorizontal: 16, paddingVertical: 14,
                          borderWidth: 1, borderColor: '#F3F4F6',
                        }}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F3F4F6' }}>
                          {isLink ? <Link size={16} color="#6B7280" /> : <FileText size={16} color="#6B7280" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#111827' }} numberOfLines={1}>{att.filename}</Text>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6B7280', marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>
                        </View>
                        {isLink ? <ExternalLink size={18} color="#6B7280" /> : <Download size={18} color="#6B7280" />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Animated.View>

      {/* Pre-flight Sheet — assignment number + teacher name */}
      {/*
      <BottomSheet visible={showPreflightSheet} onDismiss={() => setShowPreflightSheet(false)} snapPoint={0.55}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={18} color="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0A0A0A' }}>
            Generate Draft
          </Text>
        </View>
        <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6B7280', marginBottom: 24, lineHeight: 20 }}>
          Add a few details to personalise your PDF cover page. You can leave these blank.
        </Text>

        <View style={{ gap: 16, marginBottom: 28 }}>
          <Input
            label="Assignment Number"
            placeholder="e.g. Assignment 1, HW-3"
            value={assignmentNumber}
            onChangeText={setAssignmentNumber}
          />
          <Input
            label="Course Teacher"
            placeholder="e.g. Dr. Ahmed Khan"
            value={teacherName}
            onChangeText={setTeacherName}
          />
        </View>

        <Button
          title="Generate Draft"
          icon={<Sparkles size={16} color="#FFFFFF" />}
          onPress={handleSubmitPreflight}
        />
      </BottomSheet>
      */}

      {/* One-time Explanation Sheet */}
      {/*
      <BottomSheet visible={showExplanationSheet} onDismiss={() => setShowExplanationSheet(false)} snapPoint={0.65}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' }}>
            <Info size={18} color="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0A0A0A' }}>
            Your Draft is Ready
          </Text>
        </View>

        <View style={{ gap: 16, marginTop: 16, marginBottom: 28 }}>
          {[
            {
              icon: <Sparkles size={18} color="#8B5CF6" />,
              title: 'AI-Powered Drafts',
              body: 'Unimate uses your course materials and past writing style to generate assignment drafts grounded in actual lecture content.',
            },
            {
              icon: <FileDown size={18} color="#8B5CF6" />,
              title: 'Saved to Files',
              body: 'Every draft is saved as a PDF in your Files > AI Drafts folder with a cover page, summary, and full draft.',
            },
            {
              icon: <Info size={18} color="#8B5CF6" />,
              title: 'Use Responsibly',
              body: 'AI drafts are a starting point. Review, edit, and make them your own before submitting.',
            },
          ].map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
                {item.icon}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#111827', marginBottom: 2 }}>{item.title}</Text>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6B7280', lineHeight: 19 }}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Button title="Got it" onPress={() => setShowExplanationSheet(false)} />
      </BottomSheet>
      */}

      {/* Submit Assignment Sheet */}
      <BottomSheet visible={showSubmitSheet} onDismiss={() => { if (!isSubmitting) { setShowSubmitSheet(false); setPickedFile(null); setSubmitStep('idle'); setSubmitError(null); } }} snapPoint={0.55}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
            <Upload size={18} color="#374151" />
          </View>
          <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0A0A0A' }}>Submit Assignment</Text>
        </View>

        {item.submissionConfig && (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 10, marginBottom: 20 }}>
            {item.submissionConfig.allowedTypes.length > 0 && (
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#374151' }}>
                  {item.submissionConfig.allowedTypes.join(', ')}
                </Text>
              </View>
            )}
            {item.submissionConfig.maxSizeBytes > 0 && (
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#374151' }}>
                  Max {formatFileSize(item.submissionConfig.maxSizeBytes)}
                </Text>
              </View>
            )}
            {item.submissionConfig.maxFiles > 1 && (
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#374151' }}>
                  Up to {item.submissionConfig.maxFiles} files
                </Text>
              </View>
            )}
          </View>
        )}

        {item.status === 'submitted' && submitStep !== 'done' ? (
          /* ── Already submitted view ── */
          <View style={{ gap: 16 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: '#F0FDF4', borderRadius: 14,
              paddingHorizontal: 16, paddingVertical: 16,
              borderWidth: 1.5, borderColor: '#BBF7D0',
            }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={18} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#15803D' }}>Submission received</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#16A34A', marginTop: 2 }}>
                  Your file has been submitted to Moodle.
                </Text>
              </View>
            </View>

            {submitError && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12 }}>
                <AlertCircle size={16} color="#DC2626" style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#DC2626', lineHeight: 18 }}>{submitError}</Text>
              </View>
            )}

            {isRemoving && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color="#6B7280" />
                <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6B7280' }}>Removing submission...</Text>
              </View>
            )}

            <Button
              title={isRemoving ? 'Removing...' : 'Remove Submission'}
              variant="secondary"
              onPress={handleRemoveSubmission}
              disabled={isRemoving}
              style={{ opacity: isRemoving ? 0.5 : 1 }}
            />
          </View>
        ) : submitStep === 'done' ? (
          /* ── Just submitted success view ── */
          <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={28} color="#16A34A" />
            </View>
            <Text style={{ fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#15803D' }}>Submitted!</Text>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6B7280', textAlign: 'center' }}>
              Your file has been submitted successfully.
            </Text>
            <Button title="Done" onPress={() => { setShowSubmitSheet(false); setPickedFile(null); setSubmitStep('idle'); }} style={{ marginTop: 8, width: '100%' }} />
          </View>
        ) : (
          /* ── Upload view ── */
          <View style={{ gap: 16 }}>
            <Pressable
              onPress={handlePickFile}
              disabled={isSubmitting}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: pickedFile ? '#F0FDF4' : '#F9FAFB',
                borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16,
                borderWidth: 1.5, borderColor: pickedFile ? '#BBF7D0' : '#E5E7EB',
                borderStyle: pickedFile ? 'solid' : 'dashed',
              }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: pickedFile ? '#DCFCE7' : '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                <Paperclip size={18} color={pickedFile ? '#16A34A' : '#6B7280'} />
              </View>
              <View style={{ flex: 1 }}>
                {pickedFile ? (
                  <>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#111827' }} numberOfLines={1}>{pickedFile.name}</Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6B7280', marginTop: 2 }}>{formatFileSize(pickedFile.size)}</Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#6B7280' }}>Tap to choose a file</Text>
                )}
              </View>
              {pickedFile && <CheckCircle2 size={18} color="#16A34A" />}
            </Pressable>

            {submitError && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12 }}>
                <AlertCircle size={16} color="#DC2626" style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#DC2626', lineHeight: 18 }}>{submitError}</Text>
              </View>
            )}

            {(submitStep === 'uploading' || submitStep === 'saving') && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color="#6B7280" />
                <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6B7280' }}>
                  {submitStep === 'uploading' ? 'Uploading file...' : 'Saving submission...'}
                </Text>
              </View>
            )}

            <Button
              title={isSubmitting ? 'Submitting...' : 'Submit'}
              onPress={handleSubmitAssignment}
              disabled={!pickedFile || isSubmitting}
              style={{ opacity: (!pickedFile || isSubmitting) ? 0.5 : 1 }}
            />
          </View>
        )}
      </BottomSheet>

      {/* Reminder Config Bottom Sheet */}
      <BottomSheet visible={showRemindersSheet} onDismiss={() => setShowRemindersSheet(false)} snapPoint={0.65}>
        <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0A0A0A', marginBottom: 20 }}>
          Reminder Options
        </Text>

        <View style={{ gap: 12, marginBottom: 24 }}>
          <Pressable
            onPress={() => {
              updateReminderSettings(item.id, null);
              setShowRemindersSheet(false);
              showToast('Switched back to Default reminders', 'success');
            }}
            style={{
              padding: 16, borderRadius: 12, borderWidth: 2,
              borderColor: currentReminderType === 'default' ? '#0A0A0A' : '#F0F0F0',
              backgroundColor: currentReminderType === 'default' ? '#FAFAFA' : '#FFFFFF',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <Bell size={18} color={currentReminderType === 'default' ? '#0A0A0A' : '#6E6E6E'} />
              <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Default</Text>
            </View>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6E6E6E', marginLeft: 30 }}>
              Notifies you 24 hours and 1 hour before the exact deadline.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              updateReminderSettings(item.id, 'daily');
              setShowRemindersSheet(false);
              showToast('Switched to Daily reminders', 'success');
            }}
            style={{
              padding: 16, borderRadius: 12, borderWidth: 2,
              borderColor: currentReminderType === 'daily' ? '#0A0A0A' : '#F0F0F0',
              backgroundColor: currentReminderType === 'daily' ? '#FAFAFA' : '#FFFFFF',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <BellRing size={18} color={currentReminderType === 'daily' ? '#0A0A0A' : '#6E6E6E'} />
              <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Daily Nag</Text>
            </View>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6E6E6E', marginLeft: 30 }}>
              Notifies you at 9:00 AM every single day until the deadline passes.
            </Text>
          </Pressable>

          <View style={{
            padding: 16, borderRadius: 12, borderWidth: 2,
            borderColor: currentReminderType === 'custom' ? '#0A0A0A' : '#F0F0F0',
            backgroundColor: currentReminderType === 'custom' ? '#FAFAFA' : '#FFFFFF',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Settings size={18} color={currentReminderType === 'custom' ? '#0A0A0A' : '#6E6E6E'} />
              <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Custom Time</Text>
            </View>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6E6E6E', marginBottom: 16 }}>
              Set a specific number of days before the deadline, and the exact hour to receive the reminder.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Input label="Days Before" value={customDaysBefore} onChangeText={setCustomDaysBefore} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Hour (0-23)" value={customHourStr} onChangeText={setCustomHourStr} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Minute (0-59)" value={customMinuteStr} onChangeText={setCustomMinuteStr} keyboardType="number-pad" />
              </View>
            </View>
            <Button title="Apply Custom" variant="primary" onPress={handleApplyCustomReminder} size="sm" />
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}
