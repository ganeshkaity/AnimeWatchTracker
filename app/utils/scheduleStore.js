/**
 * scheduleStore.js — Upcoming 7-Day time-slot watch schedule store for GaneshSpace
 *
 * - Uses IndexedDB (`weekly_schedule` store in `watchanime_offline_db`) for unlimited local storage
 *   (no localStorage 5MB limit).
 * - Automatically syncs every change to Firestore (`users/{userId}/weeklySchedule/{dateKey}`).
 * - Uses real-time `onSnapshot` listener so changes on one device appear on other devices.
 * - Uses local date keys (`YYYY-MM-DD`) so only Today + the next 6 upcoming days are shown (no past days).
 */

import { collection, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { idbGetAll, idbPut } from './mediaIndexedDB';
import { getUserId } from './localStore';

const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const TIME_SLOTS = [
  { id: 'midnight', label: 'Midnight', timeRange: '12:00 AM – 4:00 AM' },
  { id: 'early_morning', label: 'Early Morning', timeRange: '4:00 AM – 7:00 AM' },
  { id: 'morning', label: 'Morning', timeRange: '7:00 AM – 10:00 AM' },
  { id: 'day', label: 'Day', timeRange: '10:00 AM – 12:00 PM' },
  { id: 'noon', label: 'Noon', timeRange: '12:00 PM – 2:00 PM' },
  { id: 'afternoon', label: 'Afternoon', timeRange: '2:00 PM – 5:00 PM' },
  { id: 'evening', label: 'Evening', timeRange: '5:00 PM – 9:00 PM' },
  { id: 'night', label: 'Night', timeRange: '9:00 PM – 12:00 AM' },
];

// In-memory cache hydrated from IndexedDB + Firestore for 0ms synchronous reads
let scheduleMemory = {};
let hydrationPromise = null;
let activeUnsubscribe = null;
let activeSubscribedUid = null;
let subscriberCount = 0;

export function toLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayDayId() {
  return toLocalDateKey(new Date());
}

/**
 * Returns the upcoming 7 days starting from Today (no past days).
 */
export function getUpcoming7Days() {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const days = [];
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    const dayIdx = d.getDay();
    const id = toLocalDateKey(d);
    days.push({
      id,
      short: WEEKDAY_SHORT[dayIdx],
      label: WEEKDAY_FULL[dayIdx],
      dateLabel: `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`,
      isToday: offset === 0,
      dayIndex: dayIdx,
    });
  }
  return days;
}

export function getEmptyDaySlots() {
  const slots = {};
  for (const slot of TIME_SLOTS) {
    slots[slot.id] = [];
  }
  return slots;
}

function normalizeDaySlots(rawSlots) {
  const base = getEmptyDaySlots();
  if (!rawSlots || typeof rawSlots !== 'object') return base;
  for (const slot of TIME_SLOTS) {
    if (Array.isArray(rawSlots[slot.id])) {
      base[slot.id] = rawSlots[slot.id];
    }
  }
  return base;
}

function broadcastScheduleUpdate() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('weekly_schedule_updated', { detail: { ...scheduleMemory } }));
}

export function getWeeklySchedule() {
  return { ...scheduleMemory };
}

async function applyRemoteDocs(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return;
  const idbRecords = await idbGetAll('weekly_schedule').catch(() => []);
  const idbMap = new Map((idbRecords || []).map((r) => [r.id, r]));
  const nextMem = { ...scheduleMemory };
  let changed = false;

  for (const d of docs) {
    const remote = typeof d.data === 'function' ? d.data() : d;
    const dateKey = remote?.id || d.id;
    if (!dateKey) continue;
    const localRec = idbMap.get(dateKey);
    const remoteUpdated = Number(remote?.updatedAt) || 0;
    const localUpdated = Number(localRec?.updatedAt) || 0;

    if (!localRec || remoteUpdated >= localUpdated) {
      const normalized = normalizeDaySlots(remote?.slots);
      nextMem[dateKey] = normalized;
      changed = true;
      await idbPut('weekly_schedule', {
        id: dateKey,
        slots: normalized,
        updatedAt: remoteUpdated || Date.now(),
      }).catch(() => {});
    }
  }

  if (changed) {
    scheduleMemory = nextMem;
    broadcastScheduleUpdate();
  }
}

async function persistDayToDB(dateKey, slots, explicitUserId = null) {
  const normalizedSlots = normalizeDaySlots(slots);
  // Strip any undefined values so Firestore setDoc never rejects the payload
  const cleanRecord = JSON.parse(
    JSON.stringify({
      id: dateKey,
      slots: normalizedSlots,
      updatedAt: Date.now(),
    })
  );

  scheduleMemory = {
    ...scheduleMemory,
    [dateKey]: cleanRecord.slots,
  };
  broadcastScheduleUpdate();

  // 1. Save to IndexedDB (unlimited quota)
  try {
    await idbPut('weekly_schedule', cleanRecord);
  } catch (err) {
    console.warn('[scheduleStore] IndexedDB write failed:', err);
  }

  // 2. Upload to Firestore DB
  try {
    const uid = explicitUserId || getUserId();
    if (db && uid) {
      const ref = doc(db, 'users', uid, 'weeklySchedule', dateKey);
      await setDoc(ref, cleanRecord);
    }
  } catch (err) {
    console.error('[scheduleStore] Firestore upload failed:', err);
  }
}

/**
 * Hydrates schedule from IndexedDB first, then fetches from Firestore.
 */
export async function hydrateScheduleFromDB(explicitUserId = null) {
  if (typeof window === 'undefined') return scheduleMemory;

  if (hydrationPromise) {
    await hydrationPromise;
  }

  hydrationPromise = (async () => {
    // 1. Load from IndexedDB
    try {
      const idbRecords = await idbGetAll('weekly_schedule');
      if (Array.isArray(idbRecords) && idbRecords.length > 0) {
        const nextMem = { ...scheduleMemory };
        for (const rec of idbRecords) {
          if (rec?.id && rec?.slots) {
            nextMem[rec.id] = normalizeDaySlots(rec.slots);
          }
        }
        scheduleMemory = nextMem;
        broadcastScheduleUpdate();
      }
    } catch (err) {
      console.warn('[scheduleStore] IndexedDB read failed:', err);
    }

    // 2. Fetch from Firestore and merge
    try {
      const uid = explicitUserId || getUserId();
      if (db && uid) {
        const snap = await getDocs(collection(db, 'users', uid, 'weeklySchedule'));
        if (!snap.empty) {
          await applyRemoteDocs(snap.docs);
        }
      }
    } catch (err) {
      console.warn('[scheduleStore] Firestore fetch failed:', err);
    }
  })();

  try {
    await hydrationPromise;
  } finally {
    hydrationPromise = null;
  }

  return { ...scheduleMemory };
}

/**
 * Real-time Firestore listener so schedule updates sync automatically across devices.
 * Returns an unsubscribe function.
 */
export function subscribeSchedule(explicitUserId = null) {
  if (typeof window === 'undefined') return () => {};
  const uid = explicitUserId || getUserId();
  subscriberCount += 1;

  void hydrateScheduleFromDB(uid);

  if (db && uid && (!activeUnsubscribe || activeSubscribedUid !== uid)) {
    if (activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
    }
    activeSubscribedUid = uid;
    activeUnsubscribe = onSnapshot(
      collection(db, 'users', uid, 'weeklySchedule'),
      (snap) => {
        if (!snap.empty) {
          void applyRemoteDocs(snap.docs);
        }
      },
      (err) => {
        console.warn('[scheduleStore] Firestore onSnapshot error:', err);
      }
    );
  }

  return () => {
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
      activeSubscribedUid = null;
    }
  };
}

export function createEntryId() {
  return `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addScheduleItem(dateKey, slotId, itemData, userId = null) {
  const daySlots = normalizeDaySlots(scheduleMemory[dateKey]);
  if (!Array.isArray(daySlots[slotId])) return scheduleMemory;

  const count = Math.max(1, Number(itemData.episodeCount) || 1);
  const perUnit = Math.max(1, Number(itemData.durationPerUnitMin) || 24);
  const totalMinutes = Math.max(1, Number(itemData.totalMinutes) || count * perUnit);

  const entry = {
    entryId: createEntryId(),
    mediaId: itemData.mediaId || '',
    mediaType: itemData.mediaType || 'anime',
    title: itemData.title || 'Untitled',
    poster: itemData.poster || '',
    episodeCount: count,
    durationPerUnitMin: perUnit,
    totalMinutes,
    note: (itemData.note || '').trim(),
    addedAt: Date.now(),
  };

  daySlots[slotId] = [...daySlots[slotId], entry];
  void persistDayToDB(dateKey, daySlots, userId);
  return { ...scheduleMemory };
}

export function updateScheduleItem(
  dateKey,
  slotId,
  entryId,
  updates,
  targetDateKey = dateKey,
  targetSlotId = slotId,
  userId = null
) {
  const sourceDaySlots = normalizeDaySlots(scheduleMemory[dateKey]);
  const sourceList = sourceDaySlots[slotId];
  if (!Array.isArray(sourceList)) return scheduleMemory;

  const idx = sourceList.findIndex((item) => item.entryId === entryId);
  if (idx === -1) return scheduleMemory;

  const existing = sourceList[idx];
  const nextCount = updates.episodeCount !== undefined ? Math.max(1, Number(updates.episodeCount) || 1) : existing.episodeCount;
  const nextPerUnit = updates.durationPerUnitMin !== undefined ? Math.max(1, Number(updates.durationPerUnitMin) || 1) : existing.durationPerUnitMin;
  const nextTotal = updates.totalMinutes !== undefined
    ? Math.max(1, Number(updates.totalMinutes) || nextCount * nextPerUnit)
    : nextCount * nextPerUnit;

  const updatedEntry = {
    ...existing,
    ...updates,
    episodeCount: nextCount,
    durationPerUnitMin: nextPerUnit,
    totalMinutes: nextTotal,
    note: updates.note !== undefined ? String(updates.note).trim() : existing.note,
  };

  if (targetDateKey === dateKey && targetSlotId === slotId) {
    sourceDaySlots[slotId] = sourceList.map((item) => (item.entryId === entryId ? updatedEntry : item));
    void persistDayToDB(dateKey, sourceDaySlots, userId);
  } else if (targetDateKey === dateKey) {
    sourceDaySlots[slotId] = sourceList.filter((item) => item.entryId !== entryId);
    sourceDaySlots[targetSlotId] = [...(sourceDaySlots[targetSlotId] || []), updatedEntry];
    void persistDayToDB(dateKey, sourceDaySlots, userId);
  } else {
    sourceDaySlots[slotId] = sourceList.filter((item) => item.entryId !== entryId);
    const targetDaySlots = normalizeDaySlots(scheduleMemory[targetDateKey]);
    targetDaySlots[targetSlotId] = [...(targetDaySlots[targetSlotId] || []), updatedEntry];
    void persistDayToDB(dateKey, sourceDaySlots, userId);
    void persistDayToDB(targetDateKey, targetDaySlots, userId);
  }

  return { ...scheduleMemory };
}

export function deleteScheduleItem(dateKey, slotId, entryId, userId = null) {
  const daySlots = normalizeDaySlots(scheduleMemory[dateKey]);
  if (!Array.isArray(daySlots[slotId])) return scheduleMemory;
  daySlots[slotId] = daySlots[slotId].filter((item) => item.entryId !== entryId);
  void persistDayToDB(dateKey, daySlots, userId);
  return { ...scheduleMemory };
}

export function clearScheduleSlot(dateKey, slotId, userId = null) {
  const daySlots = normalizeDaySlots(scheduleMemory[dateKey]);
  if (!Array.isArray(daySlots[slotId])) return scheduleMemory;
  daySlots[slotId] = [];
  void persistDayToDB(dateKey, daySlots, userId);
  return { ...scheduleMemory };
}

export function clearScheduleDay(dateKey, userId = null) {
  const emptySlots = getEmptyDaySlots();
  void persistDayToDB(dateKey, emptySlots, userId);
  return { ...scheduleMemory };
}

export function getSlotEstimatedMinutes(slotItems) {
  if (!Array.isArray(slotItems)) return 0;
  return slotItems.reduce((sum, item) => sum + (Number(item.totalMinutes) || 0), 0);
}

export function getDayEstimatedMinutes(daySchedule) {
  if (!daySchedule || typeof daySchedule !== 'object') return 0;
  return TIME_SLOTS.reduce((sum, slot) => sum + getSlotEstimatedMinutes(daySchedule[slot.id]), 0);
}

export function getUpcoming7DaysEstimatedMinutes(schedule) {
  if (!schedule || typeof schedule !== 'object') return 0;
  return getUpcoming7Days().reduce((sum, day) => sum + getDayEstimatedMinutes(schedule[day.id]), 0);
}

export function getDayAllItems(daySchedule) {
  if (!daySchedule || typeof daySchedule !== 'object') return [];
  const items = [];
  for (const slot of TIME_SLOTS) {
    const slotList = daySchedule[slot.id];
    if (Array.isArray(slotList)) {
      for (const item of slotList) {
        items.push({ ...item, slotId: slot.id, slotLabel: slot.label });
      }
    }
  }
  return items;
}

export function formatDurationMinutes(totalMinutes) {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (mins === 0) return '0m';
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours === 0) return `${rem}m`;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}m`;
}

export function estimateMediaUnitMinutes(item, mediaType) {
  if (!item) return 24;
  if (typeof item.runtime === 'number' && item.runtime > 0) return Math.round(item.runtime);
  if (typeof item.duration === 'number' && item.duration > 0) {
    return item.duration > 300 ? Math.round(item.duration / 60) : Math.round(item.duration);
  }
  if (typeof item.durationSeconds === 'number' && item.durationSeconds > 0) {
    return Math.max(1, Math.round(item.durationSeconds / 60));
  }
  if (typeof item.duration === 'string') {
    const hMatch = item.duration.match(/(\d+)\s*h/i);
    const mMatch = item.duration.match(/(\d+)\s*m/i);
    const parsed = (hMatch ? parseInt(hMatch[1], 10) * 60 : 0) + (mMatch ? parseInt(mMatch[1], 10) : 0);
    if (parsed > 0) return parsed;
  }

  switch (mediaType) {
    case 'movie':
      return 120;
    case 'webseries':
      return 45;
    case 'watchlist':
      return 40;
    case 'manga':
      return 15;
    case 'audiostory':
      return 30;
    case 'anime':
    default:
      return 24;
  }
}
