import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dateRange,
  dayDiff,
  describeFrequency,
  formatDateLabel,
  formatMonthLabel,
  isDue,
  sameMonth,
  startOfMonth,
  toKey,
  weekdayOf,
} from '../src/schedule';
import type { Frequency, Supplement } from '../src/types';

const supplement = (frequency: Frequency, overrides: Partial<Supplement> = {}): Supplement => ({
  id: 's1',
  name: 'Test',
  frequency,
  color: 'blue',
  startDate: '2026-01-01',
  archivedAt: null,
  sortIndex: 0,
  ...overrides,
});

describe('date helpers', () => {
  it('formats a local date without drifting to the previous day', () => {
    expect(toKey(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(toKey(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
  });

  it('counts whole days across month and year boundaries', () => {
    expect(dayDiff('2026-01-31', '2026-02-01')).toBe(1);
    expect(dayDiff('2026-12-31', '2027-01-01')).toBe(1);
    expect(dayDiff('2026-03-10', '2026-03-01')).toBe(-9);
    expect(dayDiff('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('counts whole days across a daylight-saving transition', () => {
    // European DST starts 2026-03-29 and ends 2026-10-25.
    expect(dayDiff('2026-03-28', '2026-03-30')).toBe(2);
    expect(dayDiff('2026-10-24', '2026-10-26')).toBe(2);
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('adds days across leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('builds inclusive ranges', () => {
    expect(dateRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
    expect(dateRange('2026-01-01', '2026-01-01')).toEqual(['2026-01-01']);
  });

  it('reports weekdays with Sunday as 0', () => {
    expect(weekdayOf('2026-08-30')).toBe(0); // Sunday
    expect(weekdayOf('2026-08-31')).toBe(1); // Monday
  });
});

describe('month helpers', () => {
  it('snaps to the first of the month', () => {
    expect(startOfMonth('2026-09-17')).toBe('2026-09-01');
    expect(startOfMonth('2026-09-01')).toBe('2026-09-01');
  });

  it('steps whole months without landing on a short-month gap', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
    expect(addMonths('2026-03-15', -14)).toBe('2025-01-01');
  });

  it('compares months, not days', () => {
    expect(sameMonth('2026-09-01', '2026-09-30')).toBe(true);
    expect(sameMonth('2026-09-30', '2026-10-01')).toBe(false);
  });

  it('labels a month with its year', () => {
    expect(formatMonthLabel('2026-09-17')).toMatch(/2026/);
  });
});

describe('isDue', () => {
  it('is due every day for a daily rule', () => {
    const s = supplement({ kind: 'daily' });
    expect(isDue(s, '2026-01-01')).toBe(true);
    expect(isDue(s, '2026-06-15')).toBe(true);
  });

  it('alternates for an every-second-day rule, all month long', () => {
    const s = supplement({ kind: 'interval', everyNDays: 2, anchor: '2026-01-01' });
    const due = dateRange('2026-01-01', '2026-01-31').filter((d) => isDue(s, d));
    expect(due).toHaveLength(16);
    expect(due.slice(0, 4)).toEqual(['2026-01-01', '2026-01-03', '2026-01-05', '2026-01-07']);
    // The pattern survives the month boundary rather than restarting.
    expect(isDue(s, '2026-01-31')).toBe(true);
    expect(isDue(s, '2026-02-01')).toBe(false);
    expect(isDue(s, '2026-02-02')).toBe(true);
  });

  it('keeps the every-second-day rhythm across a DST change', () => {
    const s = supplement(
      { kind: 'interval', everyNDays: 2, anchor: '2026-03-27' },
      { startDate: '2026-03-27' },
    );
    expect(isDue(s, '2026-03-27')).toBe(true);
    expect(isDue(s, '2026-03-28')).toBe(false);
    expect(isDue(s, '2026-03-29')).toBe(true); // clocks change overnight
    expect(isDue(s, '2026-03-30')).toBe(false);
    expect(isDue(s, '2026-03-31')).toBe(true);
  });

  it('handles a three-day interval', () => {
    const s = supplement({ kind: 'interval', everyNDays: 3, anchor: '2026-01-01' });
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => isDue(s, `2026-01-0${d}`))).toEqual([
      true, false, false, true, false, false, true,
    ]);
  });

  it('is never due before the anchor of an interval rule', () => {
    const s = supplement(
      { kind: 'interval', everyNDays: 2, anchor: '2026-06-10' },
      { startDate: '2026-01-01' },
    );
    expect(isDue(s, '2026-06-08')).toBe(false);
    expect(isDue(s, '2026-06-10')).toBe(true);
  });

  it('matches only the listed weekdays', () => {
    const s = supplement({ kind: 'weekdays', days: [1, 4] }); // Mon + Thu
    expect(isDue(s, '2026-08-31')).toBe(true); // Monday
    expect(isDue(s, '2026-09-01')).toBe(false); // Tuesday
    expect(isDue(s, '2026-09-03')).toBe(true); // Thursday
  });

  it('is not due before its start date', () => {
    const s = supplement({ kind: 'daily' }, { startDate: '2026-05-10' });
    expect(isDue(s, '2026-05-09')).toBe(false);
    expect(isDue(s, '2026-05-10')).toBe(true);
  });

  it('stops being due after the day it was archived, but not before', () => {
    const s = supplement({ kind: 'daily' }, { archivedAt: new Date(2026, 4, 20, 9, 0).toISOString() });
    expect(isDue(s, '2026-05-19')).toBe(true);
    expect(isDue(s, '2026-05-20')).toBe(true); // the archive day still counts
    expect(isDue(s, '2026-05-21')).toBe(false);
  });
});

describe('describeFrequency', () => {
  it('describes each rule in plain words', () => {
    expect(describeFrequency({ kind: 'daily' })).toBe('Every day');
    expect(describeFrequency({ kind: 'interval', everyNDays: 2, anchor: '2026-01-01' })).toBe('Every second day');
    expect(describeFrequency({ kind: 'interval', everyNDays: 3, anchor: '2026-01-01' })).toBe('Every third day');
    expect(describeFrequency({ kind: 'interval', everyNDays: 5, anchor: '2026-01-01' })).toBe('Every 5th day');
    expect(describeFrequency({ kind: 'weekdays', days: [4, 1] })).toBe('Mon, Thu');
    // Sunday ends the week in the picker, so it should read last here too.
    expect(describeFrequency({ kind: 'weekdays', days: [0, 1, 4] })).toBe('Mon, Thu, Sun');
    expect(describeFrequency({ kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day');
    expect(describeFrequency({ kind: 'weekdays', days: [] })).toBe('Never');
  });
});

describe('formatDateLabel', () => {
  it('names today and yesterday', () => {
    expect(formatDateLabel('2026-08-29', '2026-08-29')).toBe('Today');
    expect(formatDateLabel('2026-08-28', '2026-08-29')).toBe('Yesterday');
    expect(formatDateLabel('2026-08-20', '2026-08-29')).not.toMatch(/Today|Yesterday/);
  });
});
