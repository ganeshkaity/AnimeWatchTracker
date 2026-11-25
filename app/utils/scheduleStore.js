/**
 * scheduleStore.js — Weekly time-slot watch schedule store for GaneshSpace
 * Persists in localStorage (`watchanime_weekly_schedule_v1`) and broadcasts
 * `weekly_schedule_updated` events so Dashboard and /schedule stay in sync.
 */

export const SCHEDULE_STORAGE_KEY = 'watchanime_weekly_schedule_v1';

export const WEEK_DAYS = [
  { id: 'sun', short: 'SUN', label: 'Sunday', dayIndex: 0 },
  { id: 'mon', short: 'MON', label: 'Monday', dayIndex: 1 },
  { id: 'tue', short: 'TUE', label: 'Tuesday', dayIndex: 2 },
  { id: 'wed', short: 'WED', label: 'Wednesday', dayIndex: 3 },
  { id: 'thu', short: 'THU', label: 'Thursday', dayIndex: 4 },
  { id: 'fri', short: 'FRI', label: 'Friday', dayIndex: 5 },
  { id: 'sat', short: 'SAT', label: 'Saturday', dayIndex: 6 },
];

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

export function getEmptyDaySchedule() {
  const day = {};
  for (const slot of TIME_SLOTS) {
    day[slot.id] = [];
  }
  return day;
}

export function getEmptySchedule() {
  const schedule = {};
  for (const day of WEEK_DAYS) {
    schedule[day.id] = getEmptyDaySchedule();
  }
  return schedule;
}

function normalizeSchedule(raw) {
  const base = getEmptySchedule();
  if (!raw || typeof raw !== 'object') return base;
  for (const day of WEEK_DAYS) {
    const rawDay = raw[day.id];
    if (rawDay && typeof rawDay === 'object') {
      for (const slot of TIME_SLOTS) {
        if (Array.isArray(rawDay[slot.id])) {
          base[day.id][slot.id] = rawDay[slot.id];
        }
      }
    }
  }
  return base;
}

export function getWeeklySchedule() {
  if (typeof window === 'undefined') return getEmptySchedule();
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return getEmptySchedule();
    return normalizeSchedule(JSON.parse(raw));
  } catch {
    return getEmptySchedule();
  }
}

export function saveWeeklySchedule(schedule) {
  if (typeof window === 'undefined') return;
  try {
    const normalized = normalizeSchedule(schedule);
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('weekly_schedule_updated', { detail: normalized }));
  } catch (err) {
    console.warn('[scheduleStore] Failed to save schedule:', err);
  }
}

export function createEntryId() {
  return `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addScheduleItem(dayId, slotId, itemData) {
  const schedule = getWeeklySchedule();
  if (!schedule[dayId] || !Array.isArray(schedule[dayId][slotId])) return schedule;

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

  schedule[dayId][slotId] = [...schedule[dayId][slotId], entry];
  saveWeeklySchedule(schedule);
  return schedule;
}

export function updateScheduleItem(dayId, slotId, entryId, updates, targetDayId = dayId, targetSlotId = slotId) {
  const schedule = getWeeklySchedule();
  const sourceList = schedule[dayId]?.[slotId];
  if (!Array.isArray(sourceList)) return schedule;

  const idx = sourceList.findIndex((item) => item.entryId === entryId);
  if (idx === -1) return schedule;

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

  if (targetDayId === dayId && targetSlotId === slotId) {
    schedule[dayId][slotId] = sourceList.map((item) => (item.entryId === entryId ? updatedEntry : item));
  } else if (schedule[targetDayId]?.[targetSlotId]) {
    schedule[dayId][slotId] = sourceList.filter((item) => item.entryId !== entryId);
    schedule[targetDayId][targetSlotId] = [...schedule[targetDayId][targetSlotId], updatedEntry];
  }

  saveWeeklySchedule(schedule);
  return schedule;
}

export function deleteScheduleItem(dayId, slotId, entryId) {
  const schedule = getWeeklySchedule();
  if (!Array.isArray(schedule[dayId]?.[slotId])) return schedule;
  schedule[dayId][slotId] = schedule[dayId][slotId].filter((item) => item.entryId !== entryId);
  saveWeeklySchedule(schedule);
  return schedule;
}

export function clearScheduleSlot(dayId, slotId) {
  const schedule = getWeeklySchedule();
  if (!schedule[dayId] || !schedule[dayId][slotId]) return schedule;
  schedule[dayId][slotId] = [];
  saveWeeklySchedule(schedule);
  return schedule;
}

export function clearScheduleDay(dayId) {
  const schedule = getWeeklySchedule();
  if (!schedule[dayId]) return schedule;
  schedule[dayId] = getEmptyDaySchedule();
  saveWeeklySchedule(schedule);
  return schedule;
}

export function getSlotEstimatedMinutes(slotItems) {
  if (!Array.isArray(slotItems)) return 0;
  return slotItems.reduce((sum, item) => sum + (Number(item.totalMinutes) || 0), 0);
}

export function getDayEstimatedMinutes(daySchedule) {
  if (!daySchedule || typeof daySchedule !== 'object') return 0;
  return TIME_SLOTS.reduce((sum, slot) => sum + getSlotEstimatedMinutes(daySchedule[slot.id]), 0);
}

export function getWeekEstimatedMinutes(schedule) {
  if (!schedule || typeof schedule !== 'object') return 0;
  return WEEK_DAYS.reduce((sum, day) => sum + getDayEstimatedMinutes(schedule[day.id]), 0);
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

export function getTodayDayId() {
  const dayIdx = new Date().getDay();
  return WEEK_DAYS[dayIdx]?.id || 'sun';
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
