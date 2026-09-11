import { describe, expect, it } from 'vitest';
import { buildTimeline } from './cargoProgressService';

describe('cargo timeline', () => {
  it('does not confuse declaration acceptance with declaration filing', () => {
    const steps = buildTimeline('수입신고 수리');
    expect(steps.find((s) => s.current)?.label).toBe('수입신고 수리');
    expect(steps.find((s) => s.label === '반출')?.completed).toBe(false);
  });
  it('does not mark arrival complete for an unknown status', () => {
    expect(buildTimeline('조회 결과 없음').some((s) => s.completed || s.current)).toBe(false);
  });
});
