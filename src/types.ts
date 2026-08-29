import type { ColorKey } from './palette';

/** A calendar day in local time, formatted `YYYY-MM-DD`. */
export type DateKey = string;

export type Frequency =
  | { kind: 'daily' }
  /** Due every `everyNDays` days counting from `anchor`. `everyNDays: 2` = every second day. */
  | { kind: 'interval'; everyNDays: number; anchor: DateKey }
  /** Due on the listed weekdays, 0 = Sunday … 6 = Saturday. */
  | { kind: 'weekdays'; days: number[] };

export type Supplement = {
  id: string;
  /** Free text, dose included by convention, e.g. "Magnesium 200mg". */
  name: string;
  frequency: Frequency;
  /** Which palette slot its dots wear on the calendar. */
  color: ColorKey;
  /** Nothing counts as due before this day. */
  startDate: DateKey;
  /** ISO timestamp once archived; archived supplements stop being due but keep their history. */
  archivedAt: string | null;
  sortIndex: number;
};

export type LogEntry = {
  /** `${date}|${supplementId}` — makes ticking the same dose twice a no-op. */
  id: string;
  date: DateKey;
  supplementId: string;
  /** ISO timestamp of when it was actually ticked off. */
  takenAt: string;
};

export const logId = (date: DateKey, supplementId: string): string => `${date}|${supplementId}`;
