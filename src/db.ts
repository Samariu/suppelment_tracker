import { logId, type DateKey, type LogEntry, type Supplement } from './types';

const DB_NAME = 'supptracker';
const DB_VERSION = 1;
const SUPPLEMENTS = 'supplements';
const LOGS = 'logs';

let dbPromise: Promise<IDBDatabase> | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SUPPLEMENTS)) {
          db.createObjectStore(SUPPLEMENTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(LOGS)) {
          const logs = db.createObjectStore(LOGS, { keyPath: 'id' });
          logs.createIndex('by_date', 'date');
          logs.createIndex('by_supplement', 'supplementId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function readAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return request(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function allSupplements(): Promise<Supplement[]> {
  const rows = await readAll<Supplement>(SUPPLEMENTS);
  return rows.sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));
}

/** Supplements that are still in the rotation (not archived). */
export async function activeSupplements(): Promise<Supplement[]> {
  return (await allSupplements()).filter((s) => !s.archivedAt);
}

export async function allLogs(): Promise<LogEntry[]> {
  return readAll<LogEntry>(LOGS);
}

export async function putSupplement(supplement: Supplement): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SUPPLEMENTS, 'readwrite');
  tx.objectStore(SUPPLEMENTS).put(supplement);
  await done(tx);
}

/** Removes the supplement and every log entry belonging to it. */
export async function deleteSupplement(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([SUPPLEMENTS, LOGS], 'readwrite');
  tx.objectStore(SUPPLEMENTS).delete(id);
  const index = tx.objectStore(LOGS).index('by_supplement');
  const cursorReq = index.openCursor(IDBKeyRange.only(id));
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  await done(tx);
}

export async function setTaken(date: DateKey, supplementId: string, taken: boolean): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(LOGS, 'readwrite');
  const store = tx.objectStore(LOGS);
  const id = logId(date, supplementId);
  if (taken) {
    const entry: LogEntry = { id, date, supplementId, takenAt: new Date().toISOString() };
    store.put(entry);
  } else {
    store.delete(id);
  }
  await done(tx);
}

export async function logsForDate(date: DateKey): Promise<LogEntry[]> {
  const db = await openDb();
  const index = db.transaction(LOGS, 'readonly').objectStore(LOGS).index('by_date');
  return request(index.getAll(IDBKeyRange.only(date)) as IDBRequest<LogEntry[]>);
}

/** Replaces the whole database contents — used by import. */
export async function replaceAll(supplements: Supplement[], logs: LogEntry[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([SUPPLEMENTS, LOGS], 'readwrite');
  tx.objectStore(SUPPLEMENTS).clear();
  tx.objectStore(LOGS).clear();
  for (const supplement of supplements) tx.objectStore(SUPPLEMENTS).put(supplement);
  for (const log of logs) tx.objectStore(LOGS).put(log);
  await done(tx);
}

export async function clearAll(): Promise<void> {
  await replaceAll([], []);
}
