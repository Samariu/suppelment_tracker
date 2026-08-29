# Supplement Tracker

A small offline-first PWA for keeping track of which supplements you actually take.
Open it, tick off today's list, and see over time how consistent you've been.

Everything is stored in your browser (IndexedDB). There is no account, no server,
and nothing leaves your device.

## What it does

- **Today's checklist** — one flat list of everything due today, with big tap targets.
  Tick something off and the progress bar updates.
- **Flexible schedules** — each supplement is either *every day*, *every N days*
  (so iron can show up every second day), or *certain weekdays*.
- **Back-fill yesterday** — forgot to log last night? Switch to Yesterday and tick it.
  Older days stay as they were, so the numbers keep meaning something.
- **Progress** — a month calendar where each day carries a coloured dot for every
  supplement you took, with 7- and 30-day adherence above it and a per-supplement
  breakdown below, sorted worst-first so gaps are easy to spot. Tap any day for a
  named list of what was due and whether you took it; page between months with the
  arrows.
- **Colours** — each supplement gets one of eight preset colours, assigned automatically
  when you add it and changeable in its edit form.
- **Archive instead of delete** — archived supplements drop off the checklist but keep
  their history. Permanent deletion is a separate, confirmed action.
- **Backup** — export everything as JSON and import it back on another device.

Days before you added a supplement never count against it, and days when nothing was
due are not counted as misses.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests for the scheduling and stats maths |

Tests run under `TZ=Europe/Berlin` so the daylight-saving cases are meaningful; the
date logic is written to hold in any timezone.

## Installing it on your phone

The GitHub Actions workflow in `.github/workflows/deploy.yml` builds and publishes to
GitHub Pages on every push to `main`. To turn it on:

1. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
   (Pages needs the repository to be public, or a paid plan.)
2. Push to `main` and wait for the workflow to finish.
3. Open `https://<your-user>.github.io/<repo-name>/` on your phone.
4. **iOS Safari:** Share → *Add to Home Screen*. **Android Chrome:** menu → *Install app*.

Installing it matters: iOS gives home-screen web apps their own, more durable storage,
and the app then opens full-screen without browser chrome. Once installed it works with
no connection at all.

Because data lives only in the browser that stored it, use **Export backup** on the
Progress tab before switching phones or clearing site data.

## How it's put together

No UI framework — plain TypeScript, a ~70-line IndexedDB wrapper, and a small DOM
helper. The build is Vite plus `vite-plugin-pwa` for the manifest and service worker.

| Path | Contents |
| --- | --- |
| `src/types.ts` | The data model |
| `src/schedule.ts` | Date maths, month helpers, and the `isDue` rules |
| `src/stats.ts` | Adherence figures and the calendar month grid |
| `src/palette.ts` | The eight dot colours and how they are handed out |
| `src/db.ts` | IndexedDB access |
| `src/backup.ts` | Export, and a validating import |
| `src/views/` | The three screens |
| `tests/` | Unit tests for the pure logic |
| `e2e/` | Browser scripts used to verify the app end to end |
| `scripts/generate-icons.py` | Regenerates the app icons from `public/icon.svg` |

Dates are handled as local-time `YYYY-MM-DD` strings throughout, with day differences
computed in UTC so a daylight-saving change can never shift a day.

A supplement stores its colour as a slot name, never a hex, so the light and dark steps
resolve from CSS at render time. The eight slots were checked with a palette validator
against the app's real card surfaces: dots for different supplements share a cell, so
every pair can be adjacent, and under that strict test no set larger than four stays
separable for colourblind readers in both themes. The first four handed out are that
best set — past four, colour is a hint rather than the whole story, which is why the
calendar also keeps each supplement's dot in a stable position, names everything in the
day breakdown, and uses the per-supplement list as its legend.

### Browser checks

The `e2e/` scripts are not part of `npm test` — they need a browser, which CI does not
install. To run them locally:

```bash
npm install --no-save playwright && npx playwright install chromium

npm run dev                       # in one terminal
npm run e2e                       # drives the whole app, writes e2e/screenshots/

npm run e2e:migration             # upgrading a pre-colour database

BASE_PATH=/suppelment_tracker/ npm run build
BASE_PATH=/suppelment_tracker/ npm run preview -- --port 5190
npm run e2e:offline               # service worker, manifest, and a network cut
```

Both scripts read `APP_URL`, and `CHROMIUM_PATH` if you want to point them at a browser
you already have.
