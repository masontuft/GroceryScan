import { Platform, Share } from 'react-native';
import * as Calendar from 'expo-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackError } from './analytics';
import type { BasketItem } from '../types/basket';

// iOS only — expo-calendar's Reminders entity type has no Android analog.
export const REMINDERS_SUPPORTED = Platform.OS === 'ios';

const REMINDER_MAP_KEY = 'reminders-product-map';

// Maps productId -> EKReminder id for the list the basket was last synced to,
// so re-syncing updates existing reminders instead of duplicating them.
type ReminderMap = Record<string, string>;

async function loadReminderMap(): Promise<ReminderMap> {
  const raw = await AsyncStorage.getItem(REMINDER_MAP_KEY);
  return raw ? (JSON.parse(raw) as ReminderMap) : {};
}

async function saveReminderMap(map: ReminderMap): Promise<void> {
  await AsyncStorage.setItem(REMINDER_MAP_KEY, JSON.stringify(map));
}

export async function requestRemindersPermission(): Promise<boolean> {
  if (!REMINDERS_SUPPORTED) return false;
  const { status } = await Calendar.requestRemindersPermissionsAsync();
  return status === 'granted';
}

export interface ReminderList {
  id: string;
  title: string;
}

export async function getReminderLists(): Promise<ReminderList[]> {
  if (!REMINDERS_SUPPORTED) return [];
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
  return calendars.map((c) => ({ id: c.id, title: c.title }));
}

function formatReminderTitle(item: BasketItem): string {
  const qty = item.unit === 'each' ? `${item.quantity}` : `${item.quantity} ${item.unit}`;
  return `${qty} x ${item.name}`;
}

// Creates/updates a reminder per basket item on the given list, and marks
// reminders complete for items that were synced before but have since left
// the basket. Idempotent across repeated calls via the productId -> reminder
// id map persisted locally (EKReminder has no field to key off of).
export async function syncBasketToReminders(listId: string, items: BasketItem[]): Promise<void> {
  if (!REMINDERS_SUPPORTED) return;
  const map = await loadReminderMap();
  const currentProductIds = new Set(items.map((i) => i.productId));

  for (const item of items) {
    const title = formatReminderTitle(item);
    const existingId = map[item.productId];
    try {
      if (existingId) {
        await Calendar.updateReminderAsync(existingId, { title, completed: false });
      } else {
        map[item.productId] = await Calendar.createReminderAsync(listId, { title, completed: false });
      }
    } catch (err) {
      trackError('reminders:sync', err, { productId: item.productId });
    }
  }

  for (const [productId, reminderId] of Object.entries(map)) {
    if (currentProductIds.has(productId)) continue;
    try {
      await Calendar.updateReminderAsync(reminderId, { completed: true });
    } catch (err) {
      trackError('reminders:complete', err, { productId });
    } finally {
      delete map[productId];
    }
  }

  await saveReminderMap(map);
}

export interface SyncedReminder {
  id: string;
  title: string;
  completed: boolean;
}

// Read-only fetch of a list's current reminders, for the in-app reference
// view — does not touch the basket or the productId -> reminder id map.
// status:null + startDate/endDate:null returns every reminder regardless of
// completion state (EventKit only requires a date range when a status filter
// is also given).
export async function getRemindersForList(listId: string): Promise<SyncedReminder[]> {
  if (!REMINDERS_SUPPORTED) return [];
  const reminders = await Calendar.getRemindersAsync([listId], null, null, null);
  return reminders
    .filter((r): r is Calendar.Reminder & { id: string; title: string } => Boolean(r.id && r.title))
    .map((r) => ({ id: r.id, title: r.title, completed: Boolean(r.completed) }));
}

export async function shareBasketAsText(items: BasketItem[]): Promise<void> {
  const lines = items.map((item) => {
    const qty = item.unit === 'each' ? `${item.quantity}` : `${item.quantity} ${item.unit}`;
    return `- ${qty} x ${item.name}`;
  });
  await Share.share({ message: lines.join('\n') });
}
