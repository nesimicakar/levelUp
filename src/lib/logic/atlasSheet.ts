// ─────────────────────────────────────────────────────────────────────────────
// Atlas bottom-sheet geometry (pure — no DOM)
//
// The mobile directory sheet snaps between three heights. All snap math, drag
// clamping, nearest-snap selection, and the map-fit padding derived from the
// active snap live here so they are deterministic and unit-testable; the page
// only wires pointer/keyboard events to these functions.
// ─────────────────────────────────────────────────────────────────────────────

export type SheetSnap = 'collapsed' | 'medium' | 'expanded';
export const SHEET_ORDER: readonly SheetSnap[] = ['collapsed', 'medium', 'expanded'];

export interface SheetHeights { collapsed: number; medium: number; expanded: number; }

const MIN_SHELL = 320;
const HUD_TOP = 118;          // floating HUD band the world must clear (viewBox px)

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Visible sheet heights (px) for a shell of height `shellH`. Ordered & bounded.
 * Collapsed is kept minimal — just a 44px handle target, one compact browse row,
 * and safe-area spacing — so the map is the hero on first open.
 */
export function sheetHeights(shellH: number): SheetHeights {
  const H = Math.max(MIN_SHELL, shellH);
  return {
    collapsed: Math.round(Math.min(138, H * 0.2)),
    medium: Math.round(H * 0.55),
    expanded: Math.round(H * 0.9),
  };
}

export function snapHeight(snap: SheetSnap, shellH: number): number {
  return sheetHeights(shellH)[snap];
}

/** Clamp a dragged height to the collapsed…expanded range. */
export function clampSheetHeight(px: number, shellH: number): number {
  const h = sheetHeights(shellH);
  return Math.round(clamp(px, h.collapsed, h.expanded));
}

/** The snap whose height is closest to a (dragged) height — used on release. */
export function nearestSnap(px: number, shellH: number): SheetSnap {
  const h = sheetHeights(shellH);
  let best: SheetSnap = 'collapsed';
  let bestD = Infinity;
  for (const s of SHEET_ORDER) {
    const d = Math.abs(px - h[s]);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/** Tap toggles between collapsed and medium (never jumps to expanded). */
export function toggleSnap(snap: SheetSnap): SheetSnap {
  return snap === 'collapsed' ? 'medium' : 'collapsed';
}

/** Keyboard arrows step one snap up (+1) or down (-1), clamped. */
export function stepSnap(snap: SheetSnap, dir: 1 | -1): SheetSnap {
  const i = SHEET_ORDER.indexOf(snap);
  return SHEET_ORDER[clamp(i + dir, 0, SHEET_ORDER.length - 1)];
}

/**
 * Map fit-padding bottom (viewBox px) so the world sits above the active sheet.
 * The expanded sheet covers the map, so it is framed like medium; the value is
 * capped to keep a minimum visible band (the world never shrinks to nothing).
 */
export function fitBottomForSnap(snap: SheetSnap, shellH: number): number {
  const H = Math.max(MIN_SHELL, shellH);
  const h = sheetHeights(H);
  const raw = snap === 'expanded' ? h.medium : h[snap];
  const minBand = Math.round(H * 0.3);
  const maxBottom = Math.max(60, H - HUD_TOP - minBand);
  return Math.round(clamp(raw, 48, maxBottom));
}

/** At very narrow widths the Manage action is icon-only (44×44, labelled). */
export function manageIconOnly(width: number): boolean {
  return width <= 360;
}
