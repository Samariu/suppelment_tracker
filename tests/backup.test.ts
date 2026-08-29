import { describe, expect, it } from 'vitest';
import { parseBackup } from '../src/backup';

const valid = {
  format: 'supplement-tracker-backup',
  version: 1,
  exportedAt: '2026-08-29T10:00:00.000Z',
  supplements: [
    {
      id: 'a',
      name: 'Vitamin D3 5000 IU',
      frequency: { kind: 'daily' },
      startDate: '2026-08-01',
      archivedAt: null,
      sortIndex: 0,
    },
    {
      id: 'b',
      name: 'Iron 25mg',
      frequency: { kind: 'interval', everyNDays: 2, anchor: '2026-08-01' },
      startDate: '2026-08-01',
      archivedAt: null,
      sortIndex: 1,
    },
  ],
  logs: [{ id: '2026-08-28|a', date: '2026-08-28', supplementId: 'a', takenAt: '2026-08-28T07:00:00.000Z' }],
};

const json = (value: unknown): string => JSON.stringify(value);

describe('parseBackup', () => {
  it('round-trips a well-formed backup', () => {
    const result = parseBackup(json(valid));
    expect(result.supplements).toHaveLength(2);
    expect(result.logs).toHaveLength(1);
    expect(result.skipped).toBe(0);
    expect(result.supplements[1]?.frequency).toEqual({ kind: 'interval', everyNDays: 2, anchor: '2026-08-01' });
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup(json({ hello: 'world' }))).toThrow(/not a Supplement Tracker backup/);
    expect(() => parseBackup(json({ ...valid, supplements: 'nope' }))).toThrow(/missing/);
  });

  it('drops malformed supplements instead of importing them', () => {
    const result = parseBackup(
      json({ ...valid, supplements: [...valid.supplements, { id: 'c', name: 'No frequency' }] }),
    );
    expect(result.supplements.map((s) => s.id)).toEqual(['a', 'b']);
    expect(result.skipped).toBe(1);
  });

  it('drops logs that point at a supplement the file does not contain', () => {
    const orphan = { id: '2026-08-28|zz', date: '2026-08-28', supplementId: 'zz', takenAt: '2026-08-28T07:00:00.000Z' };
    const result = parseBackup(json({ ...valid, logs: [...valid.logs, orphan] }));
    expect(result.logs).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it('rejects an interval rule with a bad anchor or count', () => {
    const bad = { ...valid.supplements[0], id: 'x', frequency: { kind: 'interval', everyNDays: 0, anchor: 'nope' } };
    const result = parseBackup(json({ ...valid, supplements: [bad], logs: [] }));
    expect(result.supplements).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it('keeps only real weekday numbers', () => {
    const weird = {
      ...valid.supplements[0],
      id: 'w',
      frequency: { kind: 'weekdays', days: [1, 9, -2, 6, 'x'] },
    };
    const result = parseBackup(json({ ...valid, supplements: [weird], logs: [] }));
    expect(result.supplements[0]?.frequency).toEqual({ kind: 'weekdays', days: [1, 6] });
  });

  it('reconstructs a missing log id from its date and supplement', () => {
    const result = parseBackup(
      json({ ...valid, logs: [{ date: '2026-08-27', supplementId: 'a', takenAt: '2026-08-27T07:00:00.000Z' }] }),
    );
    expect(result.logs[0]?.id).toBe('2026-08-27|a');
  });
});
