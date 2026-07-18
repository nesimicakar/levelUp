// ─────────────────────────────────────────────────────────────────────────────
// Atlas viewport math (Stage 6, pure — no DOM)
//
// The map renders projected paths ONCE in a fixed viewBox coordinate space
// (VIEW_W × VIEW_H). All zoom/pan is expressed as a single affine transform
// { k, x, y } applied to one <g> group: a content point p maps to k·p + (x,y).
//
// Every gesture computation lives here so it is deterministic and unit-testable;
// the component only wires pointers/touches to these functions and writes the
// resulting transform onto the group.
// ─────────────────────────────────────────────────────────────────────────────

export const VIEW_W = 987;
export const VIEW_H = 482;
export const VIEW_SIZE: ViewportSize = { width: VIEW_W, height: VIEW_H };

export const MIN_K = 1;   // fully zoomed out = whole world; cannot zoom out further
export const MAX_K = 8;

export interface Transform { k: number; x: number; y: number; }
export interface Point { x: number; y: number; }
export interface ViewportSize { width: number; height: number; }
export interface Box { x: number; y: number; w: number; h: number; }

export const WORLD_TRANSFORM: Transform = { k: 1, x: 0, y: 0 };

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampScale(k: number, min = MIN_K, max = MAX_K): number {
  return clamp(k, min, max);
}

/**
 * Keep the scaled world covering the viewport — never pan it fully out of view.
 * At k = 1 this pins x = y = 0.
 */
export function clampTranslate(t: Transform, size: ViewportSize = VIEW_SIZE): Transform {
  const minX = size.width * (1 - t.k);
  const minY = size.height * (1 - t.k);
  return { k: t.k, x: clamp(t.x, minX, 0), y: clamp(t.y, minY, 0) };
}

/**
 * Zoom to `nextK` while keeping the content point under `p` fixed on screen.
 * Pure pointer-centered zoom — does NOT clamp translation (callers clamp).
 */
export function zoomAtPoint(t: Transform, nextK: number, p: Point): Transform {
  const k = clampScale(nextK);
  const s = k / t.k;
  return { k, x: p.x - s * (p.x - t.x), y: p.y - s * (p.y - t.y) };
}

/** Wheel zoom centered on the pointer. Positive deltaY zooms out. */
export function applyWheel(t: Transform, deltaY: number, p: Point, size: ViewportSize = VIEW_SIZE): Transform {
  const factor = Math.exp(-deltaY * 0.0015);
  return clampTranslate(zoomAtPoint(t, t.k * factor, p), size);
}

/** Translate by a delta (in viewBox units) and clamp. */
export function panBy(t: Transform, dx: number, dy: number, size: ViewportSize = VIEW_SIZE): Transform {
  return clampTranslate({ k: t.k, x: t.x + dx, y: t.y + dy }, size);
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ── Two-finger pinch + pan ────────────────────────────────────────────────────

export interface PinchState {
  startDist: number;
  startMid: Point;
  startTransform: Transform;
}

/** Two fingers active → begin a pinch anchored at the current transform. */
export function beginPinch(p0: Point, p1: Point, t: Transform): PinchState {
  return { startDist: distance(p0, p1), startMid: midpoint(p0, p1), startTransform: t };
}

/** A pinch is only active with exactly two touch points. */
export function shouldPinch(touchCount: number): boolean {
  return touchCount === 2;
}

/**
 * Update from two moving fingers: scale by the distance ratio anchored at the
 * start midpoint, then pan by how far the midpoint moved. Clamped.
 */
export function updatePinch(state: PinchState, p0: Point, p1: Point, size: ViewportSize = VIEW_SIZE): Transform {
  const ratio = state.startDist === 0 ? 1 : distance(p0, p1) / state.startDist;
  const zoomed = zoomAtPoint(state.startTransform, state.startTransform.k * ratio, state.startMid);
  const mid = midpoint(p0, p1);
  return clampTranslate(
    { k: zoomed.k, x: zoomed.x + (mid.x - state.startMid.x), y: zoomed.y + (mid.y - state.startMid.y) },
    size,
  );
}

// ── Fit a box (continent focus) ───────────────────────────────────────────────

/**
 * Fit a viewBox-space box into the viewport, centered, using `fill` of the space.
 * Clamped to zoom + pan bounds. Never hides content outside the box — it only
 * changes the transform.
 */
export function fitBox(box: Box, size: ViewportSize = VIEW_SIZE, fill = 0.9): Transform {
  const k = clampScale(Math.min(size.width / box.w, size.height / box.h) * fill);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return clampTranslate({ k, x: size.width / 2 - k * cx, y: size.height / 2 - k * cy }, size);
}

// ── Transitions (reduced-motion aware) ────────────────────────────────────────

export function tweenDuration(reducedMotion: boolean, normalMs = 320): number {
  return reducedMotion ? 0 : normalMs;
}

export function lerpTransform(a: Transform, b: Transform, u: number): Transform {
  const c = clamp(u, 0, 1);
  return { k: a.k + (b.k - a.k) * c, x: a.x + (b.x - a.x) * c, y: a.y + (b.y - a.y) * c };
}
