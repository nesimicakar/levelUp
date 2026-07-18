import { describe, it, expect } from 'vitest';
import {
  VIEW_W, VIEW_H, VIEW_SIZE, MIN_K, MAX_K, WORLD_TRANSFORM,
  clampScale, clampTranslate, zoomAtPoint, applyWheel, panBy,
  distance, midpoint, beginPinch, updatePinch, shouldPinch, fitBox,
  tweenDuration, lerpTransform, type Transform, type Point, type Box,
} from '../atlasViewport';
import { matchFeatureToAtlasId } from '../atlasGeo';
import { MARKER_COORDS } from '../../data/atlasMarkers';
import { getEntityByAtlasId } from '../../data/atlasEntities';

// Maps a content point through a transform (screen = k·p + translate).
function project(t: Transform, p: Point): Point {
  return { x: t.k * p.x + t.x, y: t.k * p.y + t.y };
}

// ── Zoom bounds ───────────────────────────────────────────────────────────────

describe('clampScale (zoom bounds)', () => {
  it('clamps to [MIN_K, MAX_K]', () => {
    expect(clampScale(0.2)).toBe(MIN_K);
    expect(clampScale(100)).toBe(MAX_K);
    expect(clampScale(3)).toBe(3);
  });
});

// ── Pan bounds ────────────────────────────────────────────────────────────────

describe('clampTranslate (pan bounds)', () => {
  it('pins translation at k = 1 (cannot pan the world out of view)', () => {
    expect(clampTranslate({ k: 1, x: 200, y: -50 })).toEqual({ k: 1, x: 0, y: 0 });
  });
  it('keeps the scaled world covering the viewport at k > 1', () => {
    const t = clampTranslate({ k: 2, x: 9999, y: -9999 });
    expect(t.x).toBe(0);                    // cannot expose left/top gap
    expect(t.y).toBe(VIEW_H * (1 - 2));     // clamped to min
  });
  it('allows valid interior translations unchanged', () => {
    const t = { k: 2, x: -100, y: -80 };
    expect(clampTranslate(t)).toEqual(t);
  });
});

// ── Pointer-centered zoom ─────────────────────────────────────────────────────

describe('zoomAtPoint (pointer-centered zoom math)', () => {
  it('keeps the content point under the pointer fixed on screen', () => {
    const t: Transform = { k: 1, x: 0, y: 0 };
    const p: Point = { x: 400, y: 200 };
    const screenBefore = project(t, { x: (p.x - t.x) / t.k, y: (p.y - t.y) / t.k });
    const t2 = zoomAtPoint(t, 3, p);
    const content = { x: (p.x - t.x) / t.k, y: (p.y - t.y) / t.k };
    const screenAfter = project(t2, content);
    expect(screenAfter.x).toBeCloseTo(screenBefore.x, 6);
    expect(screenAfter.y).toBeCloseTo(screenBefore.y, 6);
    expect(t2.k).toBe(3);
  });
  it('respects zoom bounds', () => {
    expect(zoomAtPoint({ k: 4, x: 0, y: 0 }, 100, { x: 0, y: 0 }).k).toBe(MAX_K);
  });
});

describe('applyWheel', () => {
  it('zooms out on positive deltaY, in on negative, centered on pointer', () => {
    const t = { k: 2, x: -100, y: -100 };
    const p = { x: 300, y: 150 };
    expect(applyWheel(t, 100, p).k).toBeLessThan(t.k);
    expect(applyWheel(t, -100, p).k).toBeGreaterThan(t.k);
  });
  it('never escapes bounds', () => {
    const out = applyWheel({ k: 1, x: 0, y: 0 }, 500, { x: 0, y: 0 });
    expect(out.k).toBe(MIN_K);
    expect(out).toEqual({ k: 1, x: 0, y: 0 });
  });
});

describe('panBy', () => {
  it('translates and clamps', () => {
    const t = panBy({ k: 2, x: -100, y: -100 }, -50, -50);
    expect(t.x).toBe(-150);
    expect(t.y).toBe(-150);
  });
});

// ── Pinch ─────────────────────────────────────────────────────────────────────

describe('pinch geometry', () => {
  it('distance and midpoint', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it('shouldPinch only with exactly two touches (gesture-state guard)', () => {
    expect(shouldPinch(1)).toBe(false);
    expect(shouldPinch(2)).toBe(true);
    expect(shouldPinch(3)).toBe(false);
  });

  it('doubling finger distance ~doubles scale (pinch-distance scaling)', () => {
    const start = beginPinch({ x: 400, y: 200 }, { x: 500, y: 200 }, { k: 1, x: 0, y: 0 });
    const next = updatePinch(start, { x: 350, y: 200 }, { x: 550, y: 200 }); // 100 → 200
    expect(next.k).toBeCloseTo(2, 5);
  });

  it('translating both fingers pans without zooming', () => {
    const start = beginPinch({ x: 400, y: 200 }, { x: 500, y: 200 }, { k: 2, x: -100, y: -100 });
    const next = updatePinch(start, { x: 410, y: 210 }, { x: 510, y: 210 }); // same dist, shifted +10,+10
    expect(next.k).toBeCloseTo(2, 5);          // no zoom
    expect(next.x).toBeCloseTo(-90, 5);        // panned by +10
    expect(next.y).toBeCloseTo(-90, 5);
  });
});

// ── Continent fitting & reset ─────────────────────────────────────────────────

describe('fitBox (continent fitting)', () => {
  it('centers a box in the viewport and scales to fill', () => {
    const box: Box = { x: VIEW_W / 2 - 50, y: VIEW_H / 2 - 25, w: 100, h: 50 };
    const t = fitBox(box, VIEW_SIZE, 0.9);
    // Box centre should land near viewport centre (box is central, no clamp).
    const centre = project(t, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
    expect(centre.x).toBeCloseTo(VIEW_W / 2, 3);
    expect(centre.y).toBeCloseTo(VIEW_H / 2, 3);
    expect(t.k).toBeGreaterThan(1);
    expect(t.k).toBeLessThanOrEqual(MAX_K);
  });

  it('produces in-bounds transforms for arbitrary boxes', () => {
    const boxes: Box[] = [
      { x: 0, y: 0, w: 200, h: 120 },
      { x: 700, y: 300, w: 250, h: 150 },
      { x: 400, y: 200, w: 50, h: 40 },
    ];
    for (const b of boxes) {
      const t = fitBox(b);
      expect(t.k).toBeGreaterThanOrEqual(MIN_K);
      expect(t.k).toBeLessThanOrEqual(MAX_K);
      expect(t.x).toBeLessThanOrEqual(0);
      expect(t.x).toBeGreaterThanOrEqual(VIEW_W * (1 - t.k) - 1e-6);
    }
  });
});

describe('reset behavior', () => {
  it('WORLD_TRANSFORM is the identity full-view and is bound-stable', () => {
    expect(WORLD_TRANSFORM).toEqual({ k: 1, x: 0, y: 0 });
    expect(clampTranslate(WORLD_TRANSFORM)).toEqual(WORLD_TRANSFORM);
  });
});

// ── Selection preservation (viewport math is orthogonal to selection) ─────────

describe('selection preservation', () => {
  it('transform operations return only { k, x, y } — no selection coupling', () => {
    const t = applyWheel({ k: 1, x: 0, y: 0 }, -100, { x: 10, y: 10 });
    expect(Object.keys(t).sort()).toEqual(['k', 'x', 'y']);
  });
});

// ── Selection targets: polygon + marker both resolve to registry ──────────────

describe('polygon and marker selection targets', () => {
  it('a polygon feature resolves to a valid registry atlasId', () => {
    expect(getEntityByAtlasId(matchFeatureToAtlasId({ id: '792', name: 'Turkey' })!)).toBeDefined();
  });
  it('every marker resolves to a valid registry atlasId (tiny-country selection)', () => {
    for (const id of Object.keys(MARKER_COORDS)) expect(getEntityByAtlasId(id), id).toBeDefined();
  });
});

// ── Reduced motion ────────────────────────────────────────────────────────────

describe('reduced-motion transitions', () => {
  it('duration collapses to 0 under reduced motion', () => {
    expect(tweenDuration(true)).toBe(0);
    expect(tweenDuration(false)).toBeGreaterThan(0);
  });
  it('lerpTransform clamps u and interpolates', () => {
    const a = { k: 1, x: 0, y: 0 }; const b = { k: 3, x: -100, y: -50 };
    expect(lerpTransform(a, b, 0)).toEqual(a);
    expect(lerpTransform(a, b, 1)).toEqual(b);
    expect(lerpTransform(a, b, 0.5)).toEqual({ k: 2, x: -50, y: -25 });
    expect(lerpTransform(a, b, 2)).toEqual(b); // clamped
  });
});
