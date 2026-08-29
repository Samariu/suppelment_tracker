import { writeFileSync, mkdirSync } from 'node:fs';
import { fail, launch } from './browser.mjs';

/**
 * Drives the whole app in a phone-sized Chromium: adding supplements with each
 * frequency rule, ticking doses, back-filling yesterday, and a backup round
 * trip — in both colour schemes. Expects `npm run dev` to be running.
 */
const BASE = process.env.APP_URL ?? 'http://localhost:5173/';
const OUT = process.argv[2] ?? 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await launch();

async function run(scheme) {
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // --- empty state ---
  await page.getByText("You haven't added any supplements yet.").waitFor();
  await page.screenshot({ path: `${OUT}/01-empty-${scheme}.png` });

  // --- add a daily supplement ---
  await page.getByRole('button', { name: 'Add a supplement' }).click();
  await page.locator('#supp-name').fill('Vitamin D3 5000 IU');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // --- add an every-second-day supplement ---
  await page.getByRole('button', { name: '+ Add' }).click();
  await page.locator('#supp-name').fill('Iron 25mg');
  await page.getByRole('button', { name: 'Every N days' }).click();
  await page.waitForFunction(
    () => document.querySelector('.field__preview')?.textContent === 'Every second day',
  );
  // Switching the rule must not wipe what was already typed.
  const keptName = await page.locator('#supp-name').inputValue();
  if (keptName !== 'Iron 25mg') fail(`name lost on rule switch: "${keptName}"`);
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // --- add a weekday supplement ---
  await page.getByRole('button', { name: '+ Add' }).click();
  await page.locator('#supp-name').fill('Creatine 5g');
  await page.getByRole('button', { name: 'Certain days' }).click();
  await page.locator('.chips').waitFor();
  await page.screenshot({ path: `${OUT}/02b-form-${scheme}.png` });
  await page.getByRole('button', { name: 'Sun' }).click(); // -> Mon, Thu, Sun
  await page.waitForFunction(
    () => document.querySelector('.field__preview')?.textContent === 'Mon, Thu, Sun',
  );
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await page.waitForFunction(() => document.querySelectorAll('.supp__name').length === 3);
  const names = await page.locator('.supp__name').allTextContents();
  const freqs = await page.locator('.supp__freq').allTextContents();
  if (freqs[0] !== 'Every day' || freqs[1] !== 'Every second day') fail(`freq labels: ${freqs}`);
  await page.screenshot({ path: `${OUT}/02-supplements-${scheme}.png`, fullPage: true });

  // --- reorder ---
  await page.getByRole('button', { name: 'Move Iron 25mg up' }).click();
  await page.waitForFunction(
    () => document.querySelector('.supp__name')?.textContent === 'Iron 25mg',
  );
  const reordered = await page.locator('.supp__name').allTextContents();
  await page.getByRole('button', { name: 'Move Iron 25mg down' }).click();

  // --- today checklist ---
  await page.getByRole('link', { name: 'Today' }).click();
  const dosesToday = await page.locator('.dose__name').allTextContents();
  const summaryBefore = await page.locator('.summary__count').textContent();
  // A checkbox must announce both states, not just the checked one.
  const uncheckedAria = await page.locator('.dose').first().getAttribute('aria-checked');
  if (uncheckedAria !== 'false') fail(`unticked dose had aria-checked="${uncheckedAria}"`);
  await page.locator('.dose').first().click();
  await page.locator('.dose--taken').first().waitFor();
  const checkedAria = await page.locator('.dose--taken').first().getAttribute('aria-checked');
  if (checkedAria !== 'true') fail(`ticked dose had aria-checked="${checkedAria}"`);
  const activeSegment = await page.locator('.segment--active').getAttribute('aria-pressed');
  if (activeSegment !== 'true') fail(`active segment had aria-pressed="${activeSegment}"`);
  const summaryAfter = await page.locator('.summary__count').textContent();
  if (summaryBefore === summaryAfter) fail('summary did not update after ticking');
  await page.screenshot({ path: `${OUT}/03-today-${scheme}.png` });

  // --- untick round-trips ---
  await page.locator('.dose--taken').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.dose--taken').length === 0);
  await page.locator('.dose').first().click();
  await page.locator('.dose--taken').first().waitFor();

  // --- yesterday: reachable, and honest that tracking only started today ---
  await page.getByRole('button', { name: 'Yesterday' }).click();
  await page.waitForFunction(
    () => document.querySelector('.segment--active')?.textContent === 'Yesterday',
  );
  const segments = await page.locator('.segment').allTextContents();
  if (segments.length !== 2) fail(`expected only Yesterday/Today, got ${segments}`);
  await page.getByText('You started tracking today.').waitFor();
  await page.screenshot({ path: `${OUT}/04-yesterday-${scheme}.png` });

  // --- an established user can back-fill yesterday ---
  // Seeded through the app's own import so the real code path is exercised.
  const key = (offset) => new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA');
  const seed = {
    format: 'supplement-tracker-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    supplements: [
      { id: 'd3', name: 'Vitamin D3 5000 IU', frequency: { kind: 'daily' }, startDate: key(-10), archivedAt: null, sortIndex: 0 },
      { id: 'iron', name: 'Iron 25mg', frequency: { kind: 'interval', everyNDays: 2, anchor: key(-10) }, startDate: key(-10), archivedAt: null, sortIndex: 1 },
    ],
    logs: [-9, -8, -7, -5, -4, -3].map((o) => ({ id: `${key(o)}|d3`, date: key(o), supplementId: 'd3', takenAt: new Date().toISOString() })),
  };
  const seedPath = `${OUT}/seed-${scheme}.json`;
  writeFileSync(seedPath, JSON.stringify(seed));

  page.on('dialog', (d) => d.accept());
  await page.getByRole('link', { name: 'Progress' }).click();
  await page.locator('#import-file').waitFor({ state: 'attached' });
  await page.locator('#import-file').setInputFiles(seedPath);
  await page.waitForFunction(() => document.querySelectorAll('.bars__name').length === 2);

  await page.getByRole('link', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Yesterday' }).click();
  await page.waitForFunction(
    () => document.querySelector('.segment--active')?.textContent === 'Yesterday',
  );
  await page.locator('.dose').first().waitFor();
  const dosesYesterday = await page.locator('.dose__name').allTextContents();
  if (!dosesYesterday.includes('Vitamin D3 5000 IU')) fail(`yesterday list was ${dosesYesterday}`);
  const untickedYesterday = await page.locator('.dose:not(.dose--taken)').count();
  if (untickedYesterday === 0) fail('nothing left to back-fill on yesterday');
  await page.locator('.dose:not(.dose--taken)').first().click();
  await page.locator('.dose--taken').first().waitFor();
  await page.screenshot({ path: `${OUT}/04b-backfill-${scheme}.png` });

  // Back-filling yesterday must not tick anything on today.
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('.segment--active')?.textContent === 'Today',
  );
  if ((await page.locator('.dose--taken').count()) !== 0) fail('back-fill leaked into today');
  await page.locator('.dose').first().click();
  await page.locator('.dose--taken').first().waitFor();

  // --- persistence across a reload ---
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.dose--taken').first().waitFor();

  // --- progress view ---
  await page.getByRole('link', { name: 'Progress' }).click();
  await page.locator('.heatmap__grid').waitFor();
  const weeks = await page.locator('.heatmap__week').count();
  if (weeks !== 12) fail(`expected 12 heatmap weeks, got ${weeks}`);
  const shaded = await page.locator('.heat--l4, .heat--l3, .heat--l2, .heat--l1').count();
  if (shaded === 0) fail('no shaded heatmap cells after logging doses');
  const stats = await page.locator('.stat__value').allTextContents();
  if (!stats[0]?.endsWith('%')) fail(`7-day adherence looked wrong: ${stats}`);
  const bars = await page.locator('.bars__name').count();
  if (bars !== 2) fail(`expected 2 per-supplement bars, got ${bars}`);
  await page.screenshot({ path: `${OUT}/05-progress-${scheme}.png`, fullPage: true });
  // Scrolled to the very bottom: the sticky tab bar must not cover the last card.
  await page.locator('#view').evaluate((n) => n.scrollTo(0, n.scrollHeight));
  await page.waitForFunction(
    () => { const v = document.querySelector('#view'); return v.scrollTop + v.clientHeight >= v.scrollHeight - 1; },
  );
  const overlap = await page.evaluate(() => {
    const last = document.querySelector('.card:last-of-type .button--danger');
    const tabs = document.querySelector('.tabs');
    return last.getBoundingClientRect().bottom - tabs.getBoundingClientRect().top;
  });
  if (overlap > 0) fail(`tab bar covers the last control by ${Math.round(overlap)}px`);
  await page.screenshot({ path: `${OUT}/06-bottom-${scheme}.png` });

  // --- backup round-trip through the real UI ---
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup' }).click(),
  ]).then(([d]) => d);
  const backupPath = `${OUT}/backup-${scheme}.json`;
  await download.saveAs(backupPath);

  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.bars__name').length === 0);

  await page.locator('#import-file').setInputFiles(backupPath);
  await page.waitForFunction(() => document.querySelectorAll('.bars__name').length === 2);

  await page.getByRole('link', { name: 'Today' }).click();
  await page.locator('.dose').first().waitFor();
  await page
    .locator('.dose--taken')
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => fail('ticked doses were lost in the backup round-trip'));
  const restored = await page.locator('.dose--taken').count();

  // Bouncing between tabs must not accumulate visibility listeners on Today.
  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('link', { name: 'Progress' }).click();
    await page.locator('.heatmap__grid').waitFor();
    await page.getByRole('link', { name: 'Today' }).click();
    await page.locator('.dose').first().waitFor();
  }
  const listeners = await page.evaluate(async () => {
    const before = document.querySelectorAll('.dose').length;
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 100));
    return { before, after: document.querySelectorAll('.dose').length };
  });
  if (listeners.before !== listeners.after) fail(`view churned on visibilitychange: ${JSON.stringify(listeners)}`);

  if (errors.length) fail(`console/page errors: ${errors.join(' | ')}`);
  console.log(`${scheme}: ok — today=[${dosesToday}] yesterday=[${dosesYesterday}] restored ${restored} ticked`);
  await context.close();
}

try {
  await run('light');
  await run('dark');
} finally {
  await browser.close();
}
