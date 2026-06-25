import { describe, it, expect } from 'vitest';
import { fitScale } from '../../src/render/fit.js';

describe('fitScale', () => {
  it('returns 1 when content already fits', () => {
    expect(fitScale(800, 860)).toBe(1);
    expect(fitScale(860, 860)).toBe(1);
  });

  it('returns the exact ratio when content overflows', () => {
    expect(fitScale(1000, 900)).toBeCloseTo(0.9, 5);
  });

  it('never shrinks below the readable floor', () => {
    expect(fitScale(2000, 860, 0.62)).toBe(0.62); // ratio 0.43 → clamped
  });

  it('returns 1 on non-positive / unmeasurable inputs', () => {
    expect(fitScale(0, 860)).toBe(1);
    expect(fitScale(900, 0)).toBe(1);
    expect(fitScale(900, -10)).toBe(1);
  });
});
