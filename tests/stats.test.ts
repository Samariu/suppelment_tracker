import { describe, expect, it } from 'vitest';
import { adherence, adherenceBySupplement, buildMonth, tallyRange, trackingStart } from '../src/stats';
import { logId, type Frequency, type LogEntry, type Supplement } from '../src/types';

const supplement = (id: string, frequency: Frequency, overrides: Partial<Supplement> = {}): Supplement => ({
  id,
  name: id,
  frequency,
  color: 'blue',
  startDate: '2026-01-01',
  archivedAt: null,
  sortIndex: 0,
  ...overrides,
});

const took = (date: string, supplementId: string): LogEntry => ({
  id: logId(date, supplementId),
  date,
  supplementId,
  takenAt: `${date}T08:00:00.000Z`,
});

const daily = supplement('daily', { kind: 'daily' });
const everyOther = supplement('iron', { kind: 'interval', everyNDays: 2, anchor: '2026-01-01' });

describe('tallyRange', () => {
  it('counts only what was actually due each day', () => {
    const tallies = tallyRange([daily, everyOther], [took('2026-01-01', 'daily')], '2026-01-01', '2026-01-03');
    expect(tallies).toEqual([
      { date: '2026-01-01', due: 2, taken: 1 },
      { date: '2026-01-02', due: 1, taken: 0 },
      { date: '2026-01-03', due: 2, taken: 0 },
    ]);
  });

  it('ignores logs for days the supplement was not due', () => {
    // A stray log on an off day must not inflate the taken count above due.
    const tallies = tallyRange([everyOther], [took('2026-01-02', 'iron')], '2026-01-02', '2026-01-02');
    expect(tallies).toEqual([{ date: '2026-01-02', due: 0, taken: 0 }]);
  });

  it('does not count days before a supplement started', () => {
    const late = supplement('late', { kind: 'daily' }, { startDate: '2026-01-03' });
    const tallies = tallyRange([late], [], '2026-01-01', '2026-01-03');
    expect(tallies.map((t) => t.due)).toEqual([0, 0, 1]);
  });
});

describe('adherence', () => {
  it('scores the window ending on the given day, inclusive', () => {
    const logs = [took('2026-01-05', 'daily'), took('2026-01-06', 'daily'), took('2026-01-07', 'daily')];
    expect(adherence([daily], logs, '2026-01-07', 7)).toEqual({ taken: 3, due: 7, ratio: 3 / 7 });
  });

  it('returns a null ratio when nothing was due, rather than 0%', () => {
    expect(adherence([], [], '2026-01-07', 7)).toEqual({ taken: 0, due: 0, ratio: null });
  });

  it('reaches 100% when every due dose was logged', () => {
    const logs = ['2026-01-01', '2026-01-03', '2026-01-05'].map((d) => took(d, 'iron'));
    expect(adherence([everyOther], logs, '2026-01-05', 5)).toEqual({ taken: 3, due: 3, ratio: 1 });
  });
});

describe('adherenceBySupplement', () => {
  it('scores each supplement against its own schedule and puts the worst first', () => {
    const logs = [took('2026-01-01', 'iron'), took('2026-01-03', 'iron'), took('2026-01-01', 'daily')];
    const rows = adherenceBySupplement([daily, everyOther], logs, '2026-01-03', 3);
    expect(rows.map((r) => r.supplement.id)).toEqual(['daily', 'iron']);
    expect(rows[0]).toMatchObject({ taken: 1, due: 3, ratio: 1 / 3 });
    // Iron was only due twice in the window, so two doses is a perfect score.
    expect(rows[1]).toMatchObject({ taken: 2, due: 2, ratio: 1 });
  });

  it('sorts supplements with nothing due to the end', () => {
    const future = supplement('future', { kind: 'daily' }, { startDate: '2026-02-01' });
    const rows = adherenceBySupplement([future, daily], [], '2026-01-03', 3);
    expect(rows.map((r) => r.supplement.id)).toEqual(['daily', 'future']);
    expect(rows[1]?.ratio).toBeNull();
  });
});

describe('buildMonth', () => {
  it('pads the month out to whole Monday-to-Sunday weeks', () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    const grid = buildMonth([daily], [], '2026-09-14', '2026-09-30');
    expect(grid.month).toBe('2026-09-01');
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.weeks[0]?.[0]?.date).toBe('2026-08-31'); // the Monday before
    expect(grid.weeks[0]?.[0]?.inMonth).toBe(false);
    expect(grid.weeks[0]?.[1]?.date).toBe('2026-09-01');
    expect(grid.weeks[0]?.[1]?.inMonth).toBe(true);
    expect(grid.weeks.at(-1)?.at(-1)?.date).toBe('2026-10-04'); // the Sunday after
  });

  it('handles a month that begins on a Sunday without an empty leading week', () => {
    // November 2026 starts on a Sunday: it needs six pad days in front.
    const grid = buildMonth([daily], [], '2026-11-01', '2026-11-30');
    expect(grid.weeks[0]?.[0]?.date).toBe('2026-10-26');
    expect(grid.weeks[0]?.[6]?.date).toBe('2026-11-01');
    expect(grid.weeks[0]?.[6]?.inMonth).toBe(true);
  });

  it('spans six rows when a 31-day month starts late in the week', () => {
    // August 2026 starts on a Saturday: six pad days in front plus 31 days.
    expect(buildMonth([daily], [], '2026-08-10', '2026-08-31').weeks).toHaveLength(6);
    // September 2026 starts on a Tuesday and fits in five.
    expect(buildMonth([daily], [], '2026-09-10', '2026-09-30').weeks).toHaveLength(5);
  });

  it('gives a cell one taken entry per logged dose, in list order', () => {
    // The every-second-day rule anchored at 2026-01-01 lands on the 2nd, not the 1st.
    const logs = [took('2026-09-02', 'daily'), took('2026-09-02', 'iron')];
    const grid = buildMonth([daily, everyOther], logs, '2026-09-02', '2026-09-30');
    const cell = grid.weeks.flat().find((c) => c.date === '2026-09-02');
    expect(cell?.due.map((s) => s.id)).toEqual(['daily', 'iron']);
    expect(cell?.taken.map((s) => s.id)).toEqual(['daily', 'iron']);
  });

  it('only counts a dose on a day the supplement was actually due', () => {
    // 2026-09-01 is an off day for the every-second-day rule, so a stray log there
    // must not produce a dot.
    const grid = buildMonth([everyOther], [took('2026-09-01', 'iron')], '2026-09-01', '2026-09-30');
    const off = grid.weeks.flat().find((c) => c.date === '2026-09-01');
    expect(off?.due).toEqual([]);
    expect(off?.taken).toEqual([]);
    const on = grid.weeks.flat().find((c) => c.date === '2026-09-02');
    expect(on?.due.map((s) => s.id)).toEqual(['iron']);
    expect(on?.taken).toEqual([]);
  });

  it('marks today, future days, and days before tracking began', () => {
    const late = supplement('late', { kind: 'daily' }, { startDate: '2026-09-10' });
    const grid = buildMonth([late], [], '2026-09-01', '2026-09-15');
    const at = (date: string) => grid.weeks.flat().find((c) => c.date === date);
    expect(at('2026-09-09')).toMatchObject({ isBeforeTracking: true, isFuture: false, due: [] });
    expect(at('2026-09-15')).toMatchObject({ isToday: true, isFuture: false });
    expect(at('2026-09-16')).toMatchObject({ isToday: false, isFuture: true });
    // A future day still knows what is scheduled, it just hasn't happened.
    expect(at('2026-09-16')?.due.map((s) => s.id)).toEqual(['late']);
    expect(at('2026-09-16')?.taken).toEqual([]);
  });
});

describe('trackingStart', () => {
  it('is the earliest start date, or null when nothing is tracked', () => {
    const late = supplement('late', { kind: 'daily' }, { startDate: '2026-09-10' });
    expect(trackingStart([daily, late])).toBe('2026-01-01');
    expect(trackingStart([late])).toBe('2026-09-10');
    expect(trackingStart([])).toBeNull();
  });
});
