import { describe, expect, it } from 'vitest';
import { adherence, adherenceBySupplement, buildHeatmap, levelFor, tallyRange } from '../src/stats';
import { logId, type Frequency, type LogEntry, type Supplement } from '../src/types';

const supplement = (id: string, frequency: Frequency, overrides: Partial<Supplement> = {}): Supplement => ({
  id,
  name: id,
  frequency,
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

describe('levelFor', () => {
  it('buckets partial days below the top shade and empty days at the bottom', () => {
    expect(levelFor(0, 0)).toBeNull();
    expect(levelFor(0, 3)).toBe(0);
    expect(levelFor(1, 3)).toBe(1);
    expect(levelFor(2, 3)).toBe(2);
    expect(levelFor(4, 5)).toBe(3);
    expect(levelFor(3, 3)).toBe(4);
  });
});

describe('buildHeatmap', () => {
  it('lays out full Monday-to-Sunday columns ending in the current week', () => {
    const map = buildHeatmap([daily], [], '2026-08-29', 12); // a Saturday
    expect(map.weeks).toHaveLength(12);
    expect(map.weeks.every((week) => week.length === 7)).toBe(true);
    expect(map.start).toBe('2026-06-08'); // Monday, 11 weeks earlier
    expect(map.end).toBe('2026-08-30'); // Sunday of the current week
  });

  it('marks days after today as future rather than missed', () => {
    const map = buildHeatmap([daily], [], '2026-08-29', 1);
    const week = map.weeks[0] ?? [];
    expect(week[5]).toMatchObject({ date: '2026-08-29', isFuture: false, level: 0 });
    expect(week[6]).toMatchObject({ date: '2026-08-30', isFuture: true, level: null });
  });

  it('leaves days from before tracking started blank, not as misses', () => {
    const started = supplement('late', { kind: 'daily' }, { startDate: '2026-08-27' });
    const map = buildHeatmap([started], [], '2026-08-29', 1);
    const week = map.weeks[0] ?? [];
    expect(week[1]).toMatchObject({ date: '2026-08-25', isBeforeTracking: true, level: null });
    expect(week[3]).toMatchObject({ date: '2026-08-27', isBeforeTracking: false, level: 0 });
  });

  it('leaves days with nothing due unshaded', () => {
    const map = buildHeatmap([everyOther], [took('2026-08-29', 'iron')], '2026-08-29', 1);
    const week = map.weeks[0] ?? [];
    expect(week[5]).toMatchObject({ due: 1, taken: 1, level: 4 }); // Sat 29th: due and taken
    expect(week[4]).toMatchObject({ due: 0, taken: 0, level: null }); // Fri 28th: off day
  });
});
