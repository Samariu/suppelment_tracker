import { allLogs, allSupplements, replaceAll } from './db';
import type { Frequency, LogEntry, Supplement } from './types';

const FORMAT = 'supplement-tracker-backup';
const FORMAT_VERSION = 1;

export type Backup = {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  supplements: Supplement[];
  logs: LogEntry[];
};

export async function exportBackup(): Promise<Backup> {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    supplements: await allSupplements(),
    logs: await allLogs(),
  };
}

export async function downloadBackup(): Promise<void> {
  const backup = await exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `supplements-${backup.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isDateKey = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function parseFrequency(value: unknown): Frequency | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'daily') return { kind: 'daily' };
  if (value.kind === 'interval') {
    const n = Number(value.everyNDays);
    if (!Number.isFinite(n) || n < 1 || !isDateKey(value.anchor)) return null;
    return { kind: 'interval', everyNDays: Math.floor(n), anchor: value.anchor };
  }
  if (value.kind === 'weekdays') {
    if (!Array.isArray(value.days)) return null;
    const days = value.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    return { kind: 'weekdays', days };
  }
  return null;
}

function parseSupplement(value: unknown, index: number): Supplement | null {
  if (!isRecord(value)) return null;
  const frequency = parseFrequency(value.frequency);
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || !frequency) return null;
  if (!isDateKey(value.startDate)) return null;
  return {
    id: value.id,
    name: value.name,
    frequency,
    startDate: value.startDate,
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
    sortIndex: Number.isFinite(Number(value.sortIndex)) ? Number(value.sortIndex) : index,
  };
}

function parseLog(value: unknown, knownIds: Set<string>): LogEntry | null {
  if (!isRecord(value)) return null;
  if (!isDateKey(value.date) || typeof value.supplementId !== 'string') return null;
  if (!knownIds.has(value.supplementId)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : `${value.date}|${value.supplementId}`,
    date: value.date,
    supplementId: value.supplementId,
    takenAt: typeof value.takenAt === 'string' ? value.takenAt : new Date().toISOString(),
  };
}

export type ParsedBackup = { supplements: Supplement[]; logs: LogEntry[]; skipped: number };

/**
 * Validates and normalises a backup file. Throws on anything that isn't a
 * recognisable backup; silently drops individual rows that are malformed or
 * point at a supplement the file doesn't contain, counting them in `skipped`.
 */
export function parseBackup(json: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isRecord(parsed) || parsed.format !== FORMAT) {
    throw new Error('That file is not a Supplement Tracker backup.');
  }
  if (!Array.isArray(parsed.supplements) || !Array.isArray(parsed.logs)) {
    throw new Error('The backup is missing its supplements or logs.');
  }

  const supplements: Supplement[] = [];
  let skipped = 0;
  parsed.supplements.forEach((raw, index) => {
    const supplement = parseSupplement(raw, index);
    if (supplement) supplements.push(supplement);
    else skipped += 1;
  });

  const knownIds = new Set(supplements.map((s) => s.id));
  const logs: LogEntry[] = [];
  for (const raw of parsed.logs) {
    const log = parseLog(raw, knownIds);
    if (log) logs.push(log);
    else skipped += 1;
  }

  return { supplements, logs, skipped };
}

export type ImportResult = { supplements: number; logs: number; skipped: number };

/**
 * Replaces the stored data with a backup. Parsing happens first and in full, so
 * a malformed file can never leave the app half-restored.
 */
export async function importBackup(json: string): Promise<ImportResult> {
  const { supplements, logs, skipped } = parseBackup(json);
  await replaceAll(supplements, logs);
  return { supplements: supplements.length, logs: logs.length, skipped };
}
