import { fail, launch } from './browser.mjs';

/**
 * Upgrading from the pre-colour database. Builds a genuine v1 store by hand,
 * then loads the app and checks the v2 migration hands every supplement a
 * colour — in list order, and persisted rather than derived on read.
 */
const BASE = process.env.APP_URL ?? 'http://localhost:5173/';

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
const page = await context.newPage();

// Load the page with the app's own script blocked: that gives us the right
// origin to build the old database in, with no live connection to fight over
// (a version change is blocked while any connection is open).
// Regex, not a glob: the dev server appends a cache-busting query to the entry.
const APP_ENTRY = /\/(src\/main\.ts|assets\/index-[^/]*\.js)/;
await page.route(APP_ENTRY, (route) => route.abort());
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
if ((await page.locator('.tabs').count()) !== 0) fail('the app booted despite its script being blocked');

await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('supptracker', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('supplements', { keyPath: 'id' });
        const logs = db.createObjectStore('logs', { keyPath: 'id' });
        logs.createIndex('by_date', 'date');
        logs.createIndex('by_supplement', 'supplementId');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('supplements', 'readwrite');
        const store = tx.objectStore('supplements');
        const base = { frequency: { kind: 'daily' }, startDate: '2026-08-01', archivedAt: null };
        // Inserted out of order, to prove sortIndex drives the assignment.
        store.put({ ...base, id: 'b', name: 'Second', sortIndex: 1 });
        store.put({ ...base, id: 'a', name: 'First', sortIndex: 0 });
        store.put({ ...base, id: 'c', name: 'Third', sortIndex: 2 });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('v1 open was blocked'));
    }),
);

await page.unroute(APP_ENTRY);

// A hash-only navigation would not re-fetch the document, so the blocked entry
// script has to be pulled in by an explicit reload.
await page.goto(`${BASE}#/supplements`);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('.supp__name').length === 3);

const names = await page.locator('.supp__name').allTextContents();
if (names.join() !== 'First,Second,Third') fail(`unexpected order after upgrade: ${names}`);

// Read the records back out of storage: the colour must be on disk, not computed.
const stored = await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('supptracker');
      req.onsuccess = () => {
        const db = req.result;
        const all = db.transaction('supplements', 'readonly').objectStore('supplements').getAll();
        all.onsuccess = () => {
          resolve({
            version: db.version,
            rows: [...all.result]
              .sort((x, y) => x.sortIndex - y.sortIndex)
              .map((s) => ({ id: s.id, color: s.color })),
          });
        };
        all.onerror = () => reject(all.error);
      };
      req.onerror = () => reject(req.error);
    }),
);

if (stored.version !== 2) fail(`expected schema version 2, got ${stored.version}`);
const colors = stored.rows.map((r) => r.color);
if (colors.some((c) => !c)) fail(`a supplement kept no colour: ${JSON.stringify(stored.rows)}`);
if (new Set(colors).size !== 3) fail(`colours were not distinct: ${colors}`);
if (colors.join() !== 'blue,yellow,magenta') fail(`unexpected colour order: ${colors}`);

// And the migrated colours actually reach the calendar.
await page.goto(`${BASE}#/stats`);
await page.locator('.calendar__grid').waitFor();
const legendDots = await page.locator('.bars__item .dot').count();
if (legendDots !== 3) fail(`expected 3 legend dots, got ${legendDots}`);

console.log(`migration: ok — v1 → v${stored.version}, colours ${colors.join(', ')}`);
await browser.close();
