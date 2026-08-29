import { describe, expect, it } from 'vitest';
import { COLOR_KEYS, PALETTE, colorByIndex, colorVar, isColorKey, nextColor } from '../src/palette';

describe('palette', () => {
  it('starts with the four slots that stay distinguishable side by side', () => {
    expect(COLOR_KEYS.slice(0, 4)).toEqual(['blue', 'yellow', 'magenta', 'green']);
    expect(PALETTE).toHaveLength(8);
    expect(new Set(COLOR_KEYS).size).toBe(8);
  });

  it('resolves to a themed custom property rather than a frozen hex', () => {
    expect(colorVar('blue')).toBe('var(--supp-blue)');
  });

  it('labels each slot for the picker', () => {
    expect(PALETTE.map((p) => p.label)).toContain('Amber');
    expect(PALETTE.every((p) => p.label.length > 0)).toBe(true);
  });

  it('recognises only real slot keys', () => {
    expect(isColorKey('magenta')).toBe(true);
    expect(isColorKey('chartreuse')).toBe(false);
    expect(isColorKey(undefined)).toBe(false);
  });
});

describe('nextColor', () => {
  it('hands out unused slots in order', () => {
    expect(nextColor([])).toBe('blue');
    expect(nextColor(['blue'])).toBe('yellow');
    expect(nextColor(['blue', 'yellow', 'magenta'])).toBe('green');
  });

  it('fills a gap left by a deleted supplement', () => {
    expect(nextColor(['blue', 'magenta', 'green'])).toBe('yellow');
  });

  it('falls back to the least-used slot once all eight are taken', () => {
    expect(nextColor(COLOR_KEYS)).toBe('blue');
    // blue is now doubled up, so the next one goes to the earliest single.
    expect(nextColor([...COLOR_KEYS, 'blue'])).toBe('yellow');
  });
});

describe('colorByIndex', () => {
  it('cycles through the fixed order and tolerates out-of-range input', () => {
    expect(colorByIndex(0)).toBe('blue');
    expect(colorByIndex(7)).toBe('red');
    expect(colorByIndex(8)).toBe('blue');
    expect(colorByIndex(-1)).toBe('red');
  });
});
