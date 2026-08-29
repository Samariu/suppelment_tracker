import { fail, launch } from './browser.mjs';

/**
 * Checks the PWA half: the service worker registers at the right scope, the
 * manifest loads, and the app still opens with its data after the network is
 * cut. Expects a production build served by `npm run preview`.
 */
const URL_BASE = process.env.APP_URL ?? 'http://localhost:5190/suppelment_tracker/';

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
const page = await context.newPage();

await page.goto(URL_BASE, { waitUntil: 'networkidle' });

// Add a supplement and tick it so there is state to survive the outage.
await page.getByRole('button', { name: 'Add a supplement' }).click();
await page.locator('#supp-name').fill('Magnesium 200mg');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll('.supp__name').length === 1);
await page.getByRole('link', { name: 'Today' }).click();
await page.locator('.dose').first().click();
await page.locator('.dose--taken').first().waitFor();

// Wait for the service worker to control the page.
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return { scope: reg.scope, active: reg.active?.state ?? 'none' };
});
if (swState.active !== 'activated') fail(`service worker not activated: ${JSON.stringify(swState)}`);
if (!swState.scope.endsWith('/suppelment_tracker/')) fail(`unexpected SW scope ${swState.scope}`);

const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel="manifest"]')?.href;
  const res = await fetch(href);
  return { href, ok: res.ok, body: await res.json() };
});
if (!manifest.ok) fail('manifest did not load');

// Cut the network entirely, then reload.
await context.setOffline(true);
await page.reload({ waitUntil: 'load' });
await page.locator('.dose--taken').first().waitFor({ timeout: 10000 });
const offlineDoses = await page.locator('.dose__name').allTextContents();
if (!offlineDoses.includes('Magnesium 200mg')) fail(`offline list was ${offlineDoses}`);

// Navigating between views must also work with no network.
await page.getByRole('link', { name: 'Progress' }).click();
await page.locator('.calendar__grid').waitFor();
const bars = await page.locator('.bars__name').count();
if (bars !== 1) fail(`offline stats showed ${bars} supplements`);

console.log(`offline: ok — sw ${swState.active} at ${swState.scope}, manifest ${manifest.body.short_name}, doses ${offlineDoses}`);
await browser.close();
