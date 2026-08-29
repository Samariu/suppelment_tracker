import { addDays, dateRange, dayDiff, isDue, startOfMonth, weekdayOf } from './schedule';
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

export type DayCell = {
  date: DateKey;
  /** False for the padding days that complete the first and last weeks. */
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  /** Before anything was being tracked, so nothing can be read into it. */
  isBeforeTracking: boolean;
  /** Everything scheduled that day, in list order. */
  due: Supplement[];
  /** The subset actually logged, in the same order — one dot each. */
  taken: Supplement[];
};

export type MonthGrid = {
  /** The first of the displayed month. */
  month: DateKey;
  /** Monday-first rows, padded at both ends to whole weeks. */
  weeks: DayCell[][];
};

/** The earliest day anything was being tracked, or null when nothing is. */
export function trackingStart(supplements: Supplement[]): DateKey | null {
  return supplements.reduce<DateKey | null>(
    (earliest, s) => (earliest === null || dayDiff(s.startDate, earliest) > 0 ? s.startDate : earliest),
    null,
  );
}

/**
 * One calendar month, padded to whole Monday–Sunday weeks. Cells carry the
 * supplements themselves so the dots and the day breakdown can share the work.
 */
export function buildMonth(
  supplements: Supplement[],
  logs: LogEntry[],
  monthAnchor: DateKey,
  today: DateKey,
): MonthGrid {
  const month = startOfMonth(monthAnchor);
  const nextMonth = startOfMonth(addDays(month, 32));
  const lastOfMonth = addDays(nextMonth, -1);
  const started = trackingStart(supplements);
  const takenIds = new Set(logs.map((l) => l.id));

  // Pad back to Monday, forward to Sunday.
  const gridStart = addDays(month, -((weekdayOf(month) + 6) % 7));
  const gridEnd = addDays(lastOfMonth, 6 - ((weekdayOf(lastOfMonth) + 6) % 7));

  const cells: DayCell[] = dateRange(gridStart, gridEnd).map((date) => {
    const isFuture = dayDiff(date, today) < 0;
    const due = supplements.filter((s) => isDue(s, date));
    return {
      date,
      inMonth: startOfMonth(date) === month,
      isToday: date === today,
      isFuture,
      isBeforeTracking: started === null || dayDiff(started, date) < 0,
      due,
      taken: due.filter((s) => takenIds.has(logId(date, s.id))),
    };
  });

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { month, weeks };
}
