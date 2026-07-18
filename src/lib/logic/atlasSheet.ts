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
/** Fallback collapsed dock height before it has been measured from its content. */
export const COLLAPSED_FALLBACK = 120;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Visible sheet heights (px) for a shell of height `shellH`. Ordered & bounded.
 * Collapsed is a compact dock sized from its own content (44px handle + one row +
 * padding + safe-area) — pass the MEASURED height as `collapsedPx`; the fallback
 * is used only before the first measurement. Medium/expanded are shell fractions.
 */
export function sheetHeights(shellH: number, collapsedPx?: number): SheetHeights {
  const H = Math.max(MIN_SHELL, shellH);
  const collapsed = collapsedPx && collapsedPx > 0 ? Math.round(collapsedPx) : COLLAPSED_FALLBACK;
  return {
    collapsed,
    medium: Math.round(H * 0.55),
    expanded: Math.round(H * 0.9),
  };
}

export function snapHeight(snap: SheetSnap, shellH: number, collapsedPx?: number): number {
  return sheetHeights(shellH, collapsedPx)[snap];
}

/** Clamp a dragged height to the collapsed…expanded range. */
export function clampSheetHeight(px: number, shellH: number, collapsedPx?: number): number {
  const h = sheetHeights(shellH, collapsedPx);
  return Math.round(clamp(px, h.collapsed, h.expanded));
}

/** The snap whose height is closest to a (dragged) height — used on release. */
export function nearestSnap(px: number, shellH: number, collapsedPx?: number): SheetSnap {
  const h = sheetHeights(shellH, collapsedPx);
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
export function fitBottomForSnap(snap: SheetSnap, shellH: number, collapsedPx?: number): number {
  const H = Math.max(MIN_SHELL, shellH);
  const h = sheetHeights(H, collapsedPx);
  const raw = snap === 'expanded' ? h.medium : h[snap];
  const minBand = Math.round(H * 0.3);
  const maxBottom = Math.max(60, H - HUD_TOP - minBand);
  return Math.round(clamp(raw, 48, maxBottom));
}

/** At very narrow widths the Manage action is icon-only (44×44, labelled). */
export function manageIconOnly(width: number): boolean {
  return width <= 360;
}
