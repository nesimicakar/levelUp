import { describe, it, expect } from 'vitest';
import {
  sheetHeights, snapHeight, clampSheetHeight, nearestSnap, toggleSnap, stepSnap,
  fitBottomForSnap, manageIconOnly, SHEET_ORDER, type SheetSnap,
} from '../atlasSheet';

const H = 800;

describe('sheetHeights', () => {
  it('is strictly ordered collapsed < medium < expanded', () => {
    const g = sheetHeights(H);
    expect(g.collapsed).toBeLessThan(g.medium);
    expect(g.medium).toBeLessThan(g.expanded);
  });
  it('caps the collapsed height so it stays compact on tall screens', () => {
    expect(sheetHeights(2000).collapsed).toBe(138);
  });
  it('guards against tiny shells (never below the 320 floor math)', () => {
    const g = sheetHeights(100);
    expect(g.collapsed).toBeGreaterThan(0);
    expect(g.expanded).toBeLessThanOrEqual(320 * 0.9 + 1);
  });
});

describe('clampSheetHeight', () => {
  it('clamps to the collapsed…expanded range', () => {
    const g = sheetHeights(H);
    expect(clampSheetHeight(-500, H)).toBe(g.collapsed);
    expect(clampSheetHeight(99999, H)).toBe(g.expanded);
    expect(clampSheetHeight(g.medium, H)).toBe(g.medium);
  });
});

describe('nearestSnap', () => {
  it('picks the closest snap to a dragged height', () => {
    const g = sheetHeights(H);
    expect(nearestSnap(g.collapsed + 5, H)).toBe('collapsed');
    expect(nearestSnap(g.medium - 3, H)).toBe('medium');
    expect(nearestSnap(g.expanded + 200, H)).toBe('expanded');
    expect(nearestSnap((g.collapsed + g.medium) / 2 - 1, H)).toBe('collapsed');
  });
});

describe('toggleSnap / stepSnap', () => {
  it('tap toggles collapsed↔medium (never expanded)', () => {
    expect(toggleSnap('collapsed')).toBe('medium');
    expect(toggleSnap('medium')).toBe('collapsed');
    expect(toggleSnap('expanded')).toBe('collapsed');
  });
  it('arrow steps one snap and clamps at the ends', () => {
    expect(stepSnap('collapsed', 1)).toBe('medium');
    expect(stepSnap('medium', 1)).toBe('expanded');
    expect(stepSnap('expanded', 1)).toBe('expanded');
    expect(stepSnap('collapsed', -1)).toBe('collapsed');
    expect(stepSnap('medium', -1)).toBe('collapsed');
  });
  it('snapHeight matches sheetHeights per snap', () => {
    const g = sheetHeights(H);
    for (const s of SHEET_ORDER) expect(snapHeight(s as SheetSnap, H)).toBe(g[s]);
  });
});

describe('fitBottomForSnap (map framing per sheet state)', () => {
  it('collapsed frames the world higher above a smaller sheet than medium', () => {
    expect(fitBottomForSnap('collapsed', H)).toBeLessThan(fitBottomForSnap('medium', H));
  });
  it('expanded is framed like medium (the expanded sheet covers the map)', () => {
    expect(fitBottomForSnap('expanded', H)).toBe(fitBottomForSnap('medium', H));
  });
  it('always keeps a minimum visible band (never collapses the world to nothing)', () => {
    for (const s of SHEET_ORDER) {
      const bottom = fitBottomForSnap(s as SheetSnap, H);
      expect(bottom).toBeGreaterThanOrEqual(48);
      expect(bottom).toBeLessThanOrEqual(H - 118 - Math.round(H * 0.3));
    }
  });
  it('is not a single fixed value across states', () => {
    const vals = new Set(SHEET_ORDER.map(s => fitBottomForSnap(s as SheetSnap, H)));
    expect(vals.size).toBeGreaterThan(1);
  });
});

describe('manageIconOnly (viewport-safe header)', () => {
  it('collapses the label to icon-only at very narrow widths', () => {
    expect(manageIconOnly(320)).toBe(true);
    expect(manageIconOnly(360)).toBe(true);
    expect(manageIconOnly(375)).toBe(false);
    expect(manageIconOnly(390)).toBe(false);
  });
});
