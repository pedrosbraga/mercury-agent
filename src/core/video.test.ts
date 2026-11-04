import { describe, it, expect } from 'vitest';
import { planFrameTimes } from './video.js';

describe('planFrameTimes', () => {
  it('takes one frame per second on a short clip (6.1s → 7 frames, start to end)', () => {
    const t = planFrameTimes(6.1, []);
    expect(t.length).toBe(7);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThan(5.5);
  });

  it('covers the whole of a long clip instead of its first seconds', () => {
    const t = planFrameTimes(120, []);
    expect(t.length).toBe(12);
    expect(t[t.length - 1]).toBeGreaterThan(110);
  });

  it('never exceeds the cap and stays sorted, with scene changes mixed in', () => {
    const scenes = [5, 17, 30, 44, 58, 71, 90, 100, 115];
    const t = planFrameTimes(120, scenes, 12);
    expect(t.length).toBeLessThanOrEqual(12);
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    expect(t.some((x) => scenes.includes(x))).toBe(true);
  });

  it('keeps frames apart (no near-duplicates)', () => {
    const t = planFrameTimes(10, [3.05, 3.1, 3.2]);
    for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBeGreaterThanOrEqual(0.25);
  });

  it('falls back to a single frame when the length is unknown', () => {
    expect(planFrameTimes(null, [])).toEqual([0]);
  });
});
