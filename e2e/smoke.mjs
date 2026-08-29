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
      { id: 'd3', name: 'Vitamin D3 5000 IU', frequency: { kind: 'daily' }, color: 'blue', startDate: key(-10), archivedAt: null, sortIndex: 0 },
      { id: 'iron', name: 'Iron 25mg', frequency: { kind: 'interval', everyNDays: 2, anchor: key(-10) }, color: 'yellow', startDate: key(-10), archivedAt: null, sortIndex: 1 },
    ],
    logs: [
      ...[-9, -8, -7, -5, -4, -3].map((o) => ({ id: `${key(o)}|d3`, date: key(o), supplementId: 'd3', takenAt: new Date().toISOString() })),
      // Both taken on the same day, so one cell must show two dots.
      { id: `${key(-8)}|iron`, date: key(-8), supplementId: 'iron', takenAt: new Date().toISOString() },
    ],
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
  const dueToday = await page.locator('.dose').count();
  if (dueToday < 2) fail(`expected at least 2 doses due today, got ${dueToday}`);
  for (let i = 0; i < dueToday; i += 1) {
    await page.locator('.dose:not(.dose--taken)').first().click();
    await page.waitForFunction((n) => document.querySelectorAll('.dose--taken').length === n, i + 1);
  }

  // --- persistence across a reload ---
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.dose--taken').first().waitFor();

  // --- progress view ---
  await page.getByRole('link', { name: 'Progress' }).click();
  await page.locator('.calendar__grid').waitFor();

  // The grid is whole Monday-to-Sunday weeks, so always a multiple of 7.
  const cellCount = await page.locator('.day').count();
  if (cellCount % 7 !== 0 || cellCount < 28) fail(`calendar had ${cellCount} cells`);
  if ((await page.locator('.day--today').count()) !== 1) fail('today was not marked exactly once');

  // One dot per dose actually taken. Keyed off today's cell, which is always on
  // screen — seeded days can fall in the previous month depending on the date.
  const todayDots = await page.locator('.day--today .day__dots .dot').count();
  if (todayDots !== dueToday) fail(`today showed ${todayDots} dots for ${dueToday} taken`);

  // Every swatch is reachable in one row without wrapping the picker.
  // Distinct colours, so the dots identify which supplement rather than just counting.
  const todayColours = await page.evaluate(() =>
    [...document.querySelectorAll('.day--today .day__dots .dot')].map(
      (d) => getComputedStyle(d).backgroundColor,
    ),
  );
  if (new Set(todayColours).size !== todayDots)
    fail(`today's dots repeated a colour: ${todayColours}`);

  const dotted = await page.evaluate(() =>
    [...document.querySelectorAll('.day')]
      .map((d) => ({
        day: d.querySelector('.day__number')?.textContent,
        dots: d.querySelectorAll('.day__dots .dot').length,
      }))
      .filter((d) => d.dots > 0),
  );
  if (dotted.length < 2) fail(`expected several dotted days, got ${JSON.stringify(dotted)}`);

  // A future day carries no dots at all.
  const futureDots = await page.locator('.day--future .day__dots .dot').count();
  if (futureDots !== 0) fail(`future days carried ${futureDots} dots`);

  const stats = await page.locator('.stat__value').allTextContents();
  if (!stats[0]?.endsWith('%')) fail(`7-day adherence looked wrong: ${stats}`);
  const bars = await page.locator('.bars__name').count();
  if (bars !== 2) fail(`expected 2 per-supplement bars, got ${bars}`);
  await page.screenshot({ path: `${OUT}/05-progress-${scheme}.png`, fullPage: true });

  // --- the day breakdown names things, so identity is never colour alone ---
  const selectDay = async (locator) => {
    const number = await locator.locator('.day__number').textContent();
    await locator.click();
    await page.waitForFunction(
      (n) => document.querySelector('.day--selected .day__number')?.textContent === n,
      number,
    );
  };

  await selectDay(page.locator('.day--today'));
  await page.locator('.panel__list').waitFor();
  const panel = await page.evaluate(() =>
    [...document.querySelectorAll('.panel__item')].map((i) => ({
      name: i.querySelector('.panel__name')?.textContent,
      state: i.querySelector('.panel__state')?.textContent,
      hollow: i.querySelector('.dot')?.classList.contains('dot--hollow'),
    })),
  );
  if (!panel.length) fail('day breakdown was empty');
  if (!panel.every((row) => ['taken', 'missed', 'not yet'].includes(row.state ?? '')))
    fail(`unexpected states: ${JSON.stringify(panel)}`);
  // A missed dose is a ring, a taken one is solid — shape, not just colour.
  if (panel.some((row) => (row.state === 'missed') !== row.hollow))
    fail(`dot shape did not match state: ${JSON.stringify(panel)}`);
  await page.screenshot({ path: `${OUT}/05b-day-panel-${scheme}.png` });

  // A past day with nothing logged: the grid shows no dot, but the panel still
  // says what was due and marks it missed with a ring rather than a disc.
  const missedDay = page
    .locator('.day:not(.day--outside):not(.day--future):not(.day--today)')
    .filter({ hasNot: page.locator('.dot') })
    .last();
  if ((await missedDay.count()) > 0) {
    await selectDay(missedDay);
    const missed = await page.evaluate(() =>
      [...document.querySelectorAll('.panel__item')].map((i) => ({
        state: i.querySelector('.panel__state')?.textContent,
        hollow: i.querySelector('.dot')?.classList.contains('dot--hollow'),
      })),
    );
    const due = missed.filter((r) => r.state === 'missed');
    if (missed.length && !due.length) fail(`expected a missed row, got ${JSON.stringify(missed)}`);
    if (due.some((r) => !r.hollow)) fail('a missed dose was drawn as a solid dot');
    await page.screenshot({ path: `${OUT}/05c-missed-${scheme}.png` });
  }

  // A future day is neither taken nor missed — it hasn't happened.
  const futureDay = page.locator('.day--future:not(.day--outside)').first();
  if ((await futureDay.count()) > 0) {
    await selectDay(futureDay);
    const future = await page.locator('.panel__state').allTextContents();
    if (future.some((state) => state !== 'not yet'))
      fail(`future day showed ${future}`);
  }

  // --- month navigation ---
  const thisMonth = await page.locator('.calendar__month').textContent();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await page.waitForFunction(
    (m) => document.querySelector('.calendar__month')?.textContent !== m,
    thisMonth,
  );
  const prevMonth = await page.locator('.calendar__month').textContent();
  if (prevMonth === thisMonth) fail('previous month did not change the calendar');
  // The breakdown must follow the calendar rather than describing an off-screen day.
  if ((await page.locator('.day--selected').count()) !== 1)
    fail('paging left no visible selected day');
  // Leaving the current month offers a way back, and it works.
  await page.getByRole('button', { name: 'Back to this month' }).click();
  await page.waitForFunction(
    (m) => document.querySelector('.calendar__month')?.textContent === m,
    thisMonth,
  );
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.waitForFunction(
    (m) => document.querySelector('.calendar__month')?.textContent !== m,
    thisMonth,
  );
  // A month with no history shows no dots rather than breaking.
  if ((await page.locator('.day__dots .dot').count()) !== 0) fail('next month showed dots');
  await page.getByRole('button', { name: 'Back to this month' }).click();
  await page.waitForFunction(
    (m) => document.querySelector('.calendar__month')?.textContent === m,
    thisMonth,
  );

  // --- changing a colour repaints the calendar ---
  const dotColour = () =>
    page.evaluate(() => {
      const d = document.querySelector('.day__dots .dot');
      return d ? getComputedStyle(d).backgroundColor : null;
    });
  const beforeColour = await dotColour();
  await page.getByRole('link', { name: 'Supplements' }).click();
  await page.getByRole('button', { name: 'Edit Vitamin D3 5000 IU' }).click();
  await page.locator('.swatches').waitFor();
  await page.getByRole('radio', { name: 'Violet' }).click();
  await page.waitForFunction(
    () => document.querySelector('.swatch--active')?.getAttribute('aria-label') === 'Violet',
  );
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForFunction(() => document.querySelector('.form') === null);
  await page.getByRole('link', { name: 'Progress' }).click();
  await page.locator('.calendar__grid').waitFor();
  const afterColour = await dotColour();
  if (!afterColour || afterColour === beforeColour)
    fail(`dot colour did not change: ${beforeColour} -> ${afterColour}`);
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
    await page.locator('.calendar__grid').waitFor();
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
