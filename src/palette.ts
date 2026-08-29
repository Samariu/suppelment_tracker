/**
 * The colours a supplement can wear on the calendar.
 *
 * Dots for different supplements sit side by side in one day cell, so every pair
 * can end up adjacent — the strict all-pairs test applies. Measured against this
 * app's card surfaces (#ffffff light, #1b212a dark), no set of five or more
 * clears it in both themes; the first four below are the best set that does
 * (worst colourblind ΔE 13.0 light / 6.9 dark, normal vision 19.6 / 19.3), so
 * they are handed out first. Past four, colour alone stops being reliable and
 * the calendar leans on its other cues: dots keep a stable position per
 * supplement, tapping a day names everything in text, and the per-supplement
 * list doubles as the legend.
 *
 * Only the key is stored. The light and dark steps live in styles.css as
 * `--supp-*` custom properties, so a saved colour follows the theme instead of
 * being frozen to one hex.
 */
export const PALETTE = [
  { key: 'blue', label: 'Blue' },
  { key: 'yellow', label: 'Amber' },
  { key: 'magenta', label: 'Pink' },
  { key: 'green', label: 'Green' },
  { key: 'violet', label: 'Violet' },
  { key: 'orange', label: 'Orange' },
  { key: 'aqua', label: 'Teal' },
  { key: 'red', label: 'Red' },
] as const;

export type ColorKey = (typeof PALETTE)[number]['key'];

export const COLOR_KEYS: ColorKey[] = PALETTE.map((entry) => entry.key);

export const DEFAULT_COLOR: ColorKey = 'blue';

export function isColorKey(value: unknown): value is ColorKey {
  return typeof value === 'string' && (COLOR_KEYS as string[]).includes(value);
}

/** CSS custom property holding this colour's step for the current theme. */
export function colorVar(key: ColorKey): string {
  return `var(--supp-${key})`;
}

/**
 * The colour to give a new supplement: the first one nobody is using, or —
 * once all eight are spoken for — whichever is least used, earliest in order.
 */
export function nextColor(taken: readonly ColorKey[]): ColorKey {
  const counts = new Map<ColorKey, number>(COLOR_KEYS.map((key) => [key, 0]));
  for (const key of taken) counts.set(key, (counts.get(key) ?? 0) + 1);
  let best: ColorKey = DEFAULT_COLOR;
  let bestCount = Infinity;
  for (const key of COLOR_KEYS) {
    const count = counts.get(key) ?? 0;
    if (count === 0) return key;
    if (count < bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

/** Deterministic fallback for records that predate colours. */
export function colorByIndex(index: number): ColorKey {
  return COLOR_KEYS[((index % COLOR_KEYS.length) + COLOR_KEYS.length) % COLOR_KEYS.length] ?? DEFAULT_COLOR;
}
