import type { DateKey, Frequency, Supplement } from './types';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local-time calendar day of a Date, as `YYYY-MM-DD`. */
export function toKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

export function parseKey(key: DateKey): { year: number; month: number; day: number } {
  const parts = key.split('-');
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
}

/** A Date at local midnight — safe for display and weekday maths. */
export function keyToDate(key: DateKey): Date {
  const { year, month, day } = parseKey(key);
  return new Date(year, month - 1, day);
}

/**
 * Whole days from `from` to `to` (negative if `to` is earlier). Computed in UTC
 * so a daylight-saving shift can never round a day away.
 */
export function dayDiff(from: DateKey, to: DateKey): number {
  const a = parseKey(from);
  const b = parseKey(to);
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

export function addDays(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseKey(key);
  return toKey(new Date(year, month - 1, day + days));
}

/** The first day of the month a date falls in. */
export function startOfMonth(key: DateKey): DateKey {
  const { year, month } = parseKey(key);
  return toKey(new Date(year, month - 1, 1));
}

/**
 * Move whole months from the first of the month `key` is in. Navigation always
 * starts from day 1, so there is no short-month clamping to worry about.
 */
export function addMonths(key: DateKey, months: number): DateKey {
  const { year, month } = parseKey(key);
  return toKey(new Date(year, month - 1 + months, 1));
}

/** True when both dates fall in the same calendar month. */
export function sameMonth(a: DateKey, b: DateKey): boolean {
  return startOfMonth(a) === startOfMonth(b);
}

export function formatMonthLabel(key: DateKey): string {
  return keyToDate(key).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: DateKey): number {
  return keyToDate(key).getDay();
}

/** Every day from `start` to `end` inclusive. */
export function dateRange(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let cursor = start; dayDiff(cursor, end) >= 0; cursor = addDays(cursor, 1)) out.push(cursor);
  return out;
}

/** Does this frequency rule land on this day, ignoring start/archive dates? */
export function frequencyMatches(frequency: Frequency, date: DateKey): boolean {
  switch (frequency.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return frequency.days.includes(weekdayOf(date));
    case 'interval': {
      const n = Math.max(1, Math.floor(frequency.everyNDays));
      const offset = dayDiff(frequency.anchor, date);
      // Before the anchor day the rule simply hasn't started.
      return offset >= 0 && offset % n === 0;
    }
  }
}

/** Is this supplement expected to be taken on this day? */
export function isDue(supplement: Supplement, date: DateKey): boolean {
  if (dayDiff(supplement.startDate, date) < 0) return false;
  if (supplement.archivedAt && dayDiff(toKey(new Date(supplement.archivedAt)), date) > 0) return false;
  return frequencyMatches(supplement.frequency, date);
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const ordinal = (n: number): string => {
  if (n === 2) return 'second';
  if (n === 3) return 'third';
  return `${n}th`;
};

/** Human-readable summary of a rule, e.g. "Every second day". */
export function describeFrequency(frequency: Frequency): string {
  switch (frequency.kind) {
    case 'daily':
      return 'Every day';
    case 'interval':
      return frequency.everyNDays <= 1 ? 'Every day' : `Every ${ordinal(frequency.everyNDays)} day`;
    case 'weekdays': {
      if (frequency.days.length === 0) return 'Never';
      if (frequency.days.length === 7) return 'Every day';
      // Order the week Monday-first, the way the picker shows it.
      const sorted = [...frequency.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return sorted.map((d) => WEEKDAY_LABELS[d] ?? '?').join(', ');
    }
  }
}

export function formatDateLabel(key: DateKey, today: DateKey = todayKey()): string {
  const diff = dayDiff(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return keyToDate(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatDateFull(key: DateKey): string {
  return keyToDate(key).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
