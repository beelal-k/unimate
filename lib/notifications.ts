// lib/notifications.ts
// Schedule & manage push notifications for class reminders and LMS deadlines

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
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
    });

    await Notifications.setNotificationChannelAsync('assignment-deadlines', {
      name: 'Assignment Deadlines',
      description: 'Notifications for upcoming assignment submissions',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
      sound: 'default',
      enableVibrate: true,
    });
  }
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

  const [hours, minutes] = classItem.startTime.split(':').map(Number);
  const notifyMinutes = classItem.notifyMinutesBefore || 15;

  let notifyHour = hours;
  let notifyMinute = minutes - notifyMinutes;

  if (notifyMinute < 0) {
    notifyMinute += 60;
    notifyHour -= 1;
    if (notifyHour < 0) notifyHour += 24;
  }

  const daysOfWeek: number[] = JSON.parse(classItem.daysOfWeek as unknown as string || '[]');

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
  courseName: string,
  dueDate: string,
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  // Cancel existing reminders for this assignment
  await cancelAssignmentReminders(assignmentId);

  const due = new Date(dueDate);
  const now = new Date();

  // Schedule notifications at 24h and 1h before due
  const offsets = [
    { id: '24h', ms: 24 * 60 * 60 * 1000, label: '24 hours' },
    { id: '1h', ms: 60 * 60 * 1000, label: '1 hour' },
  ];

  for (const offset of offsets) {
    const fireAt = new Date(due.getTime() - offset.ms);
    if (fireAt.getTime() <= now.getTime()) continue; // Already past

    const secondsFromNow = Math.floor((fireAt.getTime() - now.getTime()) / 1000);
    if (secondsFromNow < 10) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: `assignment-${assignmentId}-${offset.id}`,
      content: {
        title: `📝 Assignment due in ${offset.label}`,
        body: `${title} • ${courseName}`,
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

/**
 * Cancel all notifications for a specific assignment
 */
export async function cancelAssignmentReminders(assignmentId: string): Promise<void> {
  for (const offset of ['24h', '1h']) {
    await Notifications.cancelScheduledNotificationAsync(
      `assignment-${assignmentId}-${offset}`
    ).catch(() => {});
  }
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
    trigger: null, // Immediate
  });
}
