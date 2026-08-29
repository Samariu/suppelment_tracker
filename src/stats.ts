import { addDays, dateRange, dayDiff, isDue, weekdayOf } from './schedule';
import { logId, type DateKey, type LogEntry, type Supplement } from './types';

export type DayTally = {
  date: DateKey;
  /** How many supplements were expected that day. */
  due: number;
  /** How many of those were actually ticked off. */
  taken: number;
};

export type Adherence = {
  taken: number;
  due: number;
  /** 0–1, or null when nothing was due in the window (no score to give). */
  ratio: number | null;
};

export type SupplementAdherence = Adherence & { supplement: Supplement };

export type HeatCell = DayTally & {
  /** 0 = nothing taken … 4 = everything taken; null when nothing was due. */
  level: number | null;
  isFuture: boolean;
  /** Before anything was being tracked — drawn blank rather than as an off day. */
  isBeforeTracking: boolean;
};

const takenIndex = (logs: LogEntry[]): Set<string> => new Set(logs.map((l) => l.id));

/** Per-day due/taken counts across an inclusive date range. */
export function tallyRange(
  supplements: Supplement[],
  logs: LogEntry[],
  start: DateKey,
  end: DateKey,
): DayTally[] {
  const taken = takenIndex(logs);
  return dateRange(start, end).map((date) => {
    let dueCount = 0;
    let takenCount = 0;
    for (const supplement of supplements) {
      if (!isDue(supplement, date)) continue;
      dueCount += 1;
      if (taken.has(logId(date, supplement.id))) takenCount += 1;
    }
    return { date, due: dueCount, taken: takenCount };
  });
}

const ratioOf = (taken: number, due: number): number | null => (due === 0 ? null : taken / due);

/** Overall adherence across the `days` days ending on `end` (inclusive). */
export function adherence(
  supplements: Supplement[],
  logs: LogEntry[],
  end: DateKey,
  days: number,
): Adherence {
  const tallies = tallyRange(supplements, logs, addDays(end, -(days - 1)), end);
  const due = tallies.reduce((sum, t) => sum + t.due, 0);
  const taken = tallies.reduce((sum, t) => sum + t.taken, 0);
  return { taken, due, ratio: ratioOf(taken, due) };
}

/** Adherence per supplement over the same window, worst first so gaps stand out. */
export function adherenceBySupplement(
  supplements: Supplement[],
  logs: LogEntry[],
  end: DateKey,
  days: number,
): SupplementAdherence[] {
  const taken = takenIndex(logs);
  const dates = dateRange(addDays(end, -(days - 1)), end);
  return supplements
    .map((supplement) => {
      let dueCount = 0;
      let takenCount = 0;
      for (const date of dates) {
        if (!isDue(supplement, date)) continue;
        dueCount += 1;
        if (taken.has(logId(date, supplement.id))) takenCount += 1;
      }
      return { supplement, due: dueCount, taken: takenCount, ratio: ratioOf(takenCount, dueCount) };
    })
    .sort((a, b) => (a.ratio ?? 2) - (b.ratio ?? 2));
}

/** 0–4 shade bucket. Anything short of complete stays below the top level. */
export function levelFor(taken: number, due: number): number | null {
  if (due === 0) return null;
  const ratio = taken / due;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 4;
  if (ratio < 0.5) return 1;
  if (ratio < 0.8) return 2;
  return 3;
}

export type Heatmap = {
  /** Columns of 7 cells, Monday at the top. `null` pads the first and last week. */
  weeks: (HeatCell | null)[][];
  start: DateKey;
  end: DateKey;
};

/**
 * A GitHub-style grid ending on `end`, padded so every column is a full
 * Monday–Sunday week.
 */
export function buildHeatmap(
  supplements: Supplement[],
  logs: LogEntry[],
  end: DateKey,
  weekCount = 12,
): Heatmap {
  // The first day anything was being tracked; earlier cells are simply blank.
  const trackingStart = supplements.reduce<DateKey | null>(
    (earliest, s) => (earliest === null || dayDiff(s.startDate, earliest) > 0 ? s.startDate : earliest),
    null,
  );
  // Walk back to the Monday that starts the earliest displayed week.
  const daysSinceMonday = (weekdayOf(end) + 6) % 7;
  const lastMonday = addDays(end, -daysSinceMonday);
  const start = addDays(lastMonday, -7 * (weekCount - 1));
  const gridEnd = addDays(lastMonday, 6);

  const tallies = tallyRange(supplements, logs, start, gridEnd);
  const weeks: (HeatCell | null)[][] = [];
  for (let w = 0; w < weekCount; w += 1) {
    const column: (HeatCell | null)[] = [];
    for (let d = 0; d < 7; d += 1) {
      const tally = tallies[w * 7 + d];
      if (!tally) {
        column.push(null);
        continue;
      }
      const isFuture = dayDiff(tally.date, end) < 0;
      const isBeforeTracking = trackingStart === null || dayDiff(trackingStart, tally.date) < 0;
      column.push({
        ...tally,
        level: isFuture || isBeforeTracking ? null : levelFor(tally.taken, tally.due),
        isFuture,
        isBeforeTracking,
      });
    }
    weeks.push(column);
  }
  return { weeks, start, end: gridEnd };
}
