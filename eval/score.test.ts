import { describe, expect, it } from 'vitest';
// @ts-expect-error Local evaluation module is also runnable by Node without TypeScript.
import { summarize } from './score.mjs';

describe('HS evaluation scoring', () => {
  it('counts errors and unanswered cases as misses, not excluded denominators', () => {
    const row = {
      gold: '7117199000', directions: 3, ms: 1000, needsInfo: true,
      pred: ['7117191000'],
      traces: [
        { stage: 'direction', codes: ['7117'] },
        { stage: 'expanded', codes: ['7117191000'] },
        { stage: 'transmitted', codes: ['7117191000'] },
        { stage: 'decision', codes: ['7117901000'] },
      ],
    };
    const result = summarize([row, { ...row, pred: [], traces: [] }, { ...row, error: 'network' }]);
    expect(result.n).toBe(3);
    expect(result.directionCoverage6).toBe(33.33);
    expect(result.finalTop3_6).toBe(33.33);
    expect(result.decisionTop3_6).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.needsInfo).toBe(3);
  });
});
