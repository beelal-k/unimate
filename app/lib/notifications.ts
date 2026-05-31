// lib/notifications.ts
// Schedule & manage push notifications for class reminders and LMS deadlines

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useLmsStore, isAssignmentRelevant } from './store/useLmsStore';
import type { ClassItem } from './store/useScheduleStore';

// Configure foreground notification display
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Read global reminder preferences (set on the Notifications settings screen).
 * Falls back to sensible defaults if unset or unreadable.
 */
async function getReminderPrefs(): Promise<{
  enabled: boolean;
  assignmentMode: 'default' | 'daily' | 'off';
  classLead: number | null;
}> {
  try {
    const { readSetting } = require('./db/settings') as typeof import('./db/settings');
    const [enabled, mode, lead] = await Promise.all([
      readSetting('notif_reminders_enabled'),
      readSetting('notif_assignment_default'),
      readSetting('notif_class_lead'),
    ]);
    return {
      enabled: enabled !== 'false',
      assignmentMode: mode === 'daily' || mode === 'off' ? mode : 'default',
      classLead: lead ? Number(lead) : null,
    };
  } catch {
    return { enabled: true, assignmentMode: 'default', classLead: null };
  }
}

/**
 * Re-apply global reminder preferences across all upcoming assignments.
 * Called when the user changes a setting on the Notifications screen.
 */
export async function applyReminderPreferences(): Promise<void> {
  const prefs = await getReminderPrefs();

  if (!prefs.enabled) {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {}
    return;
  }

  const { items, isCourseEnabled } = useLmsStore.getState();
  for (const item of items) {
    if (item.type !== 'assignment' || item.isDone || item.status !== 'upcoming' || !item.dueDate) continue;
    if (item.courseId && (!isCourseEnabled(item.courseId) || !isAssignmentRelevant(item.dueDate, item.status))) continue;
    await scheduleAssignmentReminders(
      item.id, item.title, item.courseId ?? undefined, item.courseName, item.dueDate,
    ).catch(() => {});
  }
}

/**
 * Setup Android notification channels
 */
export async function setupNotificationChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('class-reminders', {
      name: 'Class Reminders',
      description: 'Notifications for upcoming classes',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      enableVibrate: true,
      bypassDnd: true,
    });

    await Notifications.setNotificationChannelAsync('assignment-deadlines', {
      name: 'Assignment Deadlines',
      description: 'Notifications for upcoming assignment submissions',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
      sound: 'default',
      enableVibrate: true,
    });

    await Notifications.setNotificationChannelAsync('new-assignments', {
      name: 'New Assignments',
      description: 'Alerts when new assignments are posted on Moodle',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400],
      sound: 'default',
      enableVibrate: true,
    });

    // Alarm channel — routes through the device alarm audio stream.
    // Plays at alarm volume, ignores ringer, bypasses DnD.
    await Notifications.setNotificationChannelAsync('alarms', {
      name: 'Alarms',
      description: 'Alarm alerts for new assignments and approaching deadlines',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 300, 500, 300, 500],
      sound: 'default',
      enableVibrate: true,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        flags: {
          enforceAudibility: true,
          requestHardwareAudioVideoSynchronization: false,
        },
      },
    });
  }
}

/**
 * Builds notification content with alarm-level urgency.
 * Android: routes through alarm audio stream, bypasses DnD.
 * iOS: uses device ringtone sound, breaks through Focus mode.
 */
function alarmContent(
  title: string,
  body: string,
  data: Record<string, unknown>,
): Notifications.NotificationContentInput {
  return {
    title,
    body,
    data,
    sound: 'defaultRingtone' as 'default', // device ringtone on iOS; 'default' fallback
    priority: Notifications.AndroidNotificationPriority.MAX,
    interruptionLevel: 'timeSensitive', // iOS: breaks through Focus mode without special entitlement
    ...(Platform.OS === 'android' && { channelId: 'alarms' }),
  };
}

/**
 * Register notification action categories.
 * Call once at app startup. Safe to call multiple times.
 */
export async function setupNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync('new-assignment', [
    {
      identifier: 'generate-draft',
      buttonTitle: 'Generate Draft',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'view',
      buttonTitle: 'View',
      options: { opensAppToForeground: true },
    },
  ]);
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

/**
 * Generate a unique notification identifier for a class + day combination
 */
function getClassNotificationId(classId: string, dayOfWeek: number): string {
  return `class-${classId}-day-${dayOfWeek}`;
}

/**
 * Schedule recurring weekly notifications for a class.
 */
export async function scheduleClassReminders(classItem: ClassItem): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await cancelClassReminders(classItem.id);

  const prefs = await getReminderPrefs();
  if (!prefs.enabled) return;

  const [hours, minutes] = classItem.startTime.split(':').map(Number);
  const notifyMinutes = prefs.classLead ?? classItem.notifyMinutesBefore ?? 15;

  let notifyHour = hours;
  let notifyMinute = minutes - notifyMinutes;

  if (notifyMinute < 0) {
    notifyMinute += 60;
    notifyHour -= 1;
    if (notifyHour < 0) notifyHour += 24;
  }

  // `classItem.daysOfWeek` is an array of numbers, but due to earlier DB storage it 
  // might come out of the SQLite layer as a parsed array OR a string depending on 
  // how the row mapping handles it. Ensure we have an array:
  const daysOfWeek: number[] = Array.isArray(classItem.daysOfWeek) 
    ? classItem.daysOfWeek 
    : JSON.parse((classItem.daysOfWeek as unknown as string) || '[]');

  for (const day of daysOfWeek) {
    const triggerWeekday = day + 1; // expo uses 1=Sun

    await Notifications.scheduleNotificationAsync({
      identifier: getClassNotificationId(classItem.id, day),
      content: {
        title: `📚 ${classItem.name}`,
        body: classItem.room
          ? `Class in ${notifyMinutes} minutes • ${classItem.room}`
          : `Class in ${notifyMinutes} minutes`,
        data: { classId: classItem.id, type: 'class-reminder' },
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'class-reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: triggerWeekday,
        hour: notifyHour,
        minute: notifyMinute,
      },
    });
  }
}

/**
 * Cancel all notifications for a specific class
 */
export async function cancelClassReminders(classId: string): Promise<void> {
  for (let day = 0; day <= 6; day++) {
    await Notifications.cancelScheduledNotificationAsync(
      getClassNotificationId(classId, day)
    ).catch(() => {});
  }
}

/**
 * Schedule a one-time notification for an assignment deadline.
 * Fires 1 hour and 24 hours before the due date.
 */
export async function scheduleAssignmentReminders(
  assignmentId: string,
  title: string,
  courseId: number | undefined,
  courseName: string,
  dueDate: string,
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const prefs = await getReminderPrefs();
  if (!prefs.enabled) {
    await cancelAssignmentReminders(assignmentId);
    return;
  }

  const { isCourseEnabled } = useLmsStore.getState();

  if (courseId && !isCourseEnabled(courseId)) {
    return; // Do not schedule for archived/disabled courses
  }

  // Also verify assignment relevance directly (e.g. > 85 days old)
  const due = new Date(dueDate);
  if (!isAssignmentRelevant(dueDate, 'upcoming')) {
    return;
  }

  // Cancel existing reminders for this assignment
  await cancelAssignmentReminders(assignmentId);

  const now = new Date();

  // Load the item to check its reminder settings
  const { items } = useLmsStore.getState();
  const item = items.find((i) => i.id === assignmentId);

  // A per-assignment override (daily / custom JSON) takes precedence over the
  // global default. When there's no override, fall back to the global mode.
  const hasPerItemOverride = !!item?.reminderSettings;
  if (!hasPerItemOverride && prefs.assignmentMode === 'off') {
    return; // already cancelled above; user disabled the global default
  }

  const isDaily =
    item?.reminderSettings === 'daily' ||
    (!hasPerItemOverride && prefs.assignmentMode === 'daily');
  let isCustom = false;
  let customSettings: any = null;

  try {
    if (item?.reminderSettings?.startsWith('{')) {
      customSettings = JSON.parse(item.reminderSettings);
      if (customSettings.type === 'custom') isCustom = true;
    }
  } catch (e) {}

  // Schedule notifications
  if (isDaily) {
    // Schedule a notification at 9:00 AM every day until the due date.
    // Capped at 7 days to stay well under iOS's 64-pending-notification limit
    // when "Daily" is applied as the global default across many assignments.
    for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
      const triggerDate = new Date();
      triggerDate.setDate(now.getDate() + dayOffset);
      triggerDate.setHours(9, 0, 0, 0); // 9:00 AM

      // Stop scheduling if the trigger date is past the due date
      if (triggerDate.getTime() > due.getTime()) {
        break;
      }

      const secondsFromNow = Math.floor((triggerDate.getTime() - now.getTime()) / 1000);
      if (secondsFromNow < 10) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: `assignment-${assignmentId}-daily-${dayOffset}`,
        content: {
          title: `📝 Daily Assignment Reminder`,
          body: `${title} is due on ${due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
          data: { assignmentId, type: 'assignment-deadline' },
          sound: 'default',
          ...(Platform.OS === 'android' && { channelId: 'assignment-deadlines' }),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsFromNow,
          repeats: false,
        },
      });
    }
  } else if (isCustom && customSettings) {
    // Schedule exact designated time
    const { daysBefore, hour, minute } = customSettings;
    const triggerDate = new Date(due.getTime());
    
    // First, go back X days from the actual due date
    triggerDate.setDate(triggerDate.getDate() - daysBefore);
    // Then set the exact hour/minute specified
    triggerDate.setHours(hour, minute, 0, 0);

    const secondsFromNow = Math.floor((triggerDate.getTime() - now.getTime()) / 1000);
    
    if (secondsFromNow >= 10) {
      // Add it to the cancel list mapping (we'll just use "-custom-1" key)
      await Notifications.scheduleNotificationAsync({
        identifier: `assignment-${assignmentId}-custom`,
        content: {
          title: `📝 Custom Reminder`,
          body: `${title} is due in ${daysBefore} days (${due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`,
          data: { assignmentId, type: 'assignment-deadline' },
          sound: 'default',
          ...(Platform.OS === 'android' && { channelId: 'assignment-deadlines' }),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsFromNow,
          repeats: false,
        },
      });
    }
  }

  // Always schedule 24h warning + 1h alarm as fail-safe
  const offsets = [
    { id: '24h', ms: 24 * 60 * 60 * 1000, label: '24 hours', alarm: false },
    { id: '1h',  ms: 60 * 60 * 1000,       label: '1 hour',   alarm: true  },
  ];

  for (const offset of offsets) {
    const fireAt = new Date(due.getTime() - offset.ms);
    if (fireAt.getTime() <= now.getTime()) continue;

    const secondsFromNow = Math.floor((fireAt.getTime() - now.getTime()) / 1000);
    if (secondsFromNow < 10) continue;

    const content: Notifications.NotificationContentInput = offset.alarm
      ? alarmContent(
          `⏰ Assignment due in ${offset.label}`,
          `${title} • ${courseName}`,
          { assignmentId, type: 'assignment-deadline' },
        )
      : {
          title: `📝 Assignment due in ${offset.label}`,
          body: `${title} • ${courseName}`,
          data: { assignmentId, type: 'assignment-deadline' },
          sound: 'default',
          ...(Platform.OS === 'android' && { channelId: 'assignment-deadlines' }),
        };

    await Notifications.scheduleNotificationAsync({
      identifier: `assignment-${assignmentId}-${offset.id}`,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsFromNow,
        repeats: false,
      },
    });
  }
}

/**
 * Cancel all notifications for a specific assignment
 */
export async function cancelAssignmentReminders(assignmentId: string): Promise<void> {
  const cancelPromises: Promise<void>[] = [];
  for (const offset of ['24h', '1h', 'custom']) {
    cancelPromises.push(
      Notifications.cancelScheduledNotificationAsync(`assignment-${assignmentId}-${offset}`).catch(() => {})
    );
  }
  for (let i = 1; i <= 14; i++) {
    cancelPromises.push(
      Notifications.cancelScheduledNotificationAsync(`assignment-${assignmentId}-daily-${i}`).catch(() => {})
    );
  }
  await Promise.all(cancelPromises);
}

/**
 * Trigger an immediate notification when a new assignment is found during an LMS sync.
 * Includes "Generate Draft" and "View" action buttons.
 */
export async function notifyNewAssignment(
  title: string,
  courseName: string,
  courseId?: number,
  lmsItemId?: string,
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  if (courseId) {
    const { isCourseEnabled } = useLmsStore.getState();
    if (!isCourseEnabled(courseId)) return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: `new-assignment-${Date.now()}`,
    content: {
      ...alarmContent(
        '📋 New Assignment Posted',
        `${title} • ${courseName}`,
        { type: 'new-assignment', lmsItemId, assignmentTitle: title },
      ),
      categoryIdentifier: 'new-assignment',
    },
    trigger: null as any,
  });
}

/**
 * Fire an immediate local "Draft Ready" notification.
 * Used when an AI assignment-draft job finishes (replaces the old server push).
 */
export async function notifyDraftReady(
  assignmentTitle: string,
  lmsItemId?: string,
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '✨ Draft Ready',
      body: `Your draft for "${assignmentTitle}" is ready in Files › AI Drafts`,
      data: { type: 'draft-ready', lmsItemId },
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: 'new-assignments' }),
    },
    trigger: null as any, // immediate
  });
}

/**
 * Send an immediate test notification
 */
export async function sendTestNotification(): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 UniMate',
      body: 'Notifications are working! You will receive alerts for classes and assignments.',
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: 'class-reminders' }),
    },
    trigger: null as any, // Immediate notification (null is valid at runtime in expo-notifications v55)
  });
}
