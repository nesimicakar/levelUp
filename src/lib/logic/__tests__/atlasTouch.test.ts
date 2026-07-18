import { describe, it, expect } from 'vitest';
import { TOUCH_MIN, touchTargetStyle } from '../atlasTouch';

describe('touch-target helper', () => {
  it('enforces a ≥44px minimum hit area', () => {
    expect(TOUCH_MIN).toBeGreaterThanOrEqual(44);
  });
  it('yields a style with min 44×44 and centered content', () => {
    const s = touchTargetStyle();
    expect(s.minWidth).toBe(44);
    expect(s.minHeight).toBe(44);
    expect(s.display).toBe('inline-flex');
    expect(s.alignItems).toBe('center');
    expect(s.justifyContent).toBe('center');
  });
});
