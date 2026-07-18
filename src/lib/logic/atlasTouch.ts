// Minimum comfortable touch-target size (WCAG 2.5.5 / platform HIG).
export const TOUCH_MIN = 44;

/**
 * Style that guarantees a ≥44×44 hit area while letting the visible content
 * stay compact (centered inside). Apply to the interactive element; keep the
 * small visual as an inner child.
 */
export function touchTargetStyle(): { minWidth: number; minHeight: number; display: string; alignItems: string; justifyContent: string } {
  return { minWidth: TOUCH_MIN, minHeight: TOUCH_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
}
