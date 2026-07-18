import { describe, it, expect } from 'vitest';
import {
  VIEW_W, VIEW_H, VIEW_SIZE, MIN_K, MAX_K, WORLD_TRANSFORM, HERO_ZOOM,
  clampScale, clampTranslate, zoomAtPoint, applyWheel, panBy,
  distance, midpoint, beginPinch, updatePinch, shouldPinch, fitBox, heroTransform,
  tweenDuration, lerpTransform, dragPan, exceedsTapThreshold, TAP_MOVE_THRESHOLD,
  boundsToBox, pointBox, fitBoxInset,
  type Transform, type Point, type Box,
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

// ── One-finger drag pan ───────────────────────────────────────────────────────

describe('dragPan (one-finger pan delta)', () => {
  it('translates by the anchor→point delta', () => {
    const t = dragPan({ k: 2, x: -100, y: -100 }, { x: 300, y: 200 }, { x: 320, y: 180 });
    expect(t.x).toBe(-80);  // +20
    expect(t.y).toBe(-120); // -20
  });

  it('no anchor movement → no jump (returns the same in-bounds transform)', () => {
    const t = { k: 2, x: -100, y: -80 };
    expect(dragPan(t, { x: 400, y: 200 }, { x: 400, y: 200 })).toEqual(t);
  });

  it('shares clamping with mouse-drag panBy (touch == desktop pan math)', () => {
    const t = { k: 2, x: -100, y: -100 };
    const from = { x: 300, y: 200 }, to = { x: 330, y: 260 };
    expect(dragPan(t, from, to)).toEqual(panBy(t, to.x - from.x, to.y - from.y));
  });

  it('clamps so a pan cannot expose a gap past the edge', () => {
    const t = dragPan({ k: 2, x: 0, y: 0 }, { x: 0, y: 0 }, { x: 9999, y: 9999 });
    expect(t.x).toBe(0);              // cannot pan the world right past the left edge
    expect(t.y).toBe(0);
  });
});

// ── Tap vs drag discrimination ────────────────────────────────────────────────

describe('exceedsTapThreshold (tap vs drag)', () => {
  it('a tiny move stays a tap; a larger move becomes a drag', () => {
    const start = { x: 100, y: 100 };
    expect(exceedsTapThreshold(start, { x: 103, y: 101 })).toBe(false); // within slop
    expect(exceedsTapThreshold(start, { x: 100 + TAP_MOVE_THRESHOLD + 1, y: 100 })).toBe(true);
  });

  it('is exactly the predicate that suppresses selection after dragging', () => {
    // The component sets movedRef = exceedsTapThreshold(start, current) and skips
    // selection while movedRef is true. Model that decision here.
    const start = { x: 200, y: 200 };
    const afterTap = { x: 202, y: 203 };
    const afterDrag = { x: 240, y: 220 };
    const selectionSuppressed = (p: Point) => exceedsTapThreshold(start, p);
    expect(selectionSuppressed(afterTap)).toBe(false);  // tap → selects
    expect(selectionSuppressed(afterDrag)).toBe(true);   // drag → suppressed
  });
});

// ── Gesture transitions (no jump) ─────────────────────────────────────────────

describe('one-finger pan ↔ two-finger pinch transitions', () => {
  it('adding a second finger begins a pinch with no jump (start == current transform)', () => {
    const t: Transform = { k: 2, x: -120, y: -60 };
    const a = { x: 380, y: 210 }, b = { x: 520, y: 250 };
    const pinch = beginPinch(a, b, t);
    // At the instant of transition the fingers have not moved: transform is unchanged.
    expect(updatePinch(pinch, a, b)).toEqual(clampTranslate(t));
  });

  it('dropping back to one finger re-anchors so the next move does not jump', () => {
    // After a pinch, the component sets the pan anchor to the remaining finger.
    // The very next move from that anchor to itself yields zero displacement.
    const t: Transform = { k: 3, x: -200, y: -150 };
    const remaining = { x: 450, y: 220 };
    expect(dragPan(t, remaining, remaining)).toEqual(t); // re-anchored → no jump
    // and a subsequent real move pans by exactly its delta
    expect(dragPan(t, remaining, { x: 460, y: 210 })).toEqual(panBy(t, 10, -10));
  });
});

describe('boundsToBox / pointBox (fly-to geometry)', () => {
  it('converts d3 bounds to a Box', () => {
    expect(boundsToBox([[10, 20], [110, 80]])).toEqual({ x: 10, y: 20, w: 100, h: 60 });
  });
  it('never yields a zero/negative dimension (degenerate bounds)', () => {
    const b = boundsToBox([[5, 5], [5, 5]]);
    expect(b.w).toBeGreaterThan(0);
    expect(b.h).toBeGreaterThan(0);
  });
  it('pointBox is a centered square', () => {
    expect(pointBox({ x: 100, y: 100 }, 20)).toEqual({ x: 80, y: 80, w: 40, h: 40 });
  });
  it('fitBox on a pointBox stays within zoom bounds (fly-to a marker)', () => {
    const t = fitBox(pointBox({ x: 200, y: 200 }, 24));
    expect(t.k).toBeGreaterThanOrEqual(MIN_K);
    expect(t.k).toBeLessThanOrEqual(MAX_K);
  });
});

describe('hero framing (first-open map view)', () => {
  it('zooms in past the full-world view so land dominates', () => {
    const t = heroTransform(VIEW_SIZE);
    expect(t.k).toBeGreaterThan(MIN_K);
    expect(t.k).toBeLessThan(MAX_K);
    expect(t.k).toBe(HERO_ZOOM);
  });
  it('stays within pan bounds and trims left/right symmetrically', () => {
    const size = VIEW_SIZE;
    const t = heroTransform(size);
    expect(t.x).toBeGreaterThanOrEqual(size.width * (1 - t.k));
    expect(t.x).toBeLessThanOrEqual(0);
    // Symmetric horizontal trim: content centre stays at viewport centre-x.
    expect(t.k * (size.width / 2) + t.x).toBeCloseTo(size.width / 2, 3);
  });
  it('anchors above centre so Antarctica/empty south is trimmed more than the north', () => {
    const size = VIEW_SIZE;
    const t = heroTransform(size);
    // The world centre projects below the viewport centre (more bottom trimmed).
    expect(t.k * (size.height / 2) + t.y).toBeGreaterThan(size.height / 2);
  });
  it('is size-relative (works for a narrow phone viewport)', () => {
    const t = heroTransform({ width: 360, height: 620 });
    expect(t.k).toBe(HERO_ZOOM);
    expect(t.x).toBeLessThanOrEqual(0);
  });
});

describe('fitBoxInset (fly-to above the sheet)', () => {
  it('centers the box within the inset region, not the full viewport', () => {
    const size = { width: 400, height: 800 };
    const inset = { top: 100, bottom: 300, x: 20 }; // visible band centre: (200, 300)
    const box: Box = { x: 180, y: 380, w: 40, h: 40 };
    const t = fitBoxInset(box, size, inset, 0.8);
    expect(t.k * 200 + t.x).toBeCloseTo(200, 3);
    expect(t.k * 400 + t.y).toBeCloseTo(300, 3);
  });
  it('stays within zoom + translate bounds for a corner marker box', () => {
    const size = { width: 400, height: 800 };
    const t = fitBoxInset({ x: 0, y: 0, w: 20, h: 20 }, size, { top: 100, bottom: 300, x: 16 }, 0.7);
    expect(t.k).toBeGreaterThanOrEqual(MIN_K);
    expect(t.k).toBeLessThanOrEqual(MAX_K);
    expect(t.x).toBeLessThanOrEqual(0);
    expect(t.y).toBeLessThanOrEqual(0);
  });
  it('a smaller bottom inset (collapsed sheet) frames lower than a larger one', () => {
    const size = { width: 400, height: 800 };
    const box: Box = { x: 190, y: 390, w: 20, h: 20 };
    const collapsed = fitBoxInset(box, size, { top: 118, bottom: 180, x: 16 });
    const medium = fitBoxInset(box, size, { top: 118, bottom: 440, x: 16 });
    // Same entity centre lands lower on screen when the sheet is collapsed.
    expect(collapsed.k * 400 + collapsed.y).toBeGreaterThan(medium.k * 400 + medium.y);
  });
});

describe('pinch zoom clamping', () => {
  it('a huge spread cannot exceed MAX_K', () => {
    const start = beginPinch({ x: 490, y: 240 }, { x: 500, y: 240 }, { k: 1, x: 0, y: 0 });
    const next = updatePinch(start, { x: 100, y: 240 }, { x: 900, y: 240 }); // 10 → 800
    expect(next.k).toBe(MAX_K);
  });
  it('a tiny pinch cannot go below MIN_K', () => {
    const start = beginPinch({ x: 100, y: 240 }, { x: 900, y: 240 }, { k: 2, x: -100, y: -100 });
    const next = updatePinch(start, { x: 495, y: 240 }, { x: 505, y: 240 }); // 800 → 10
    expect(next.k).toBe(MIN_K);
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
