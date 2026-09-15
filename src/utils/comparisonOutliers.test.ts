import { describe, expect, it } from 'vitest';
import { comparisonOutliers } from './comparisonOutliers';
import type { ImportComparisonRow } from '../types/importTrade';

function row(overrides: Partial<ImportComparisonRow>): ImportComparisonRow {
  return {
    field: '총중량', invoice: '1,250 kg', packingList: '1,250 kg', billOfLading: '1,250 kg',
    matches: false, detail: '',
    ...overrides,
  } as ImportComparisonRow;
}

describe('comparisonOutliers', () => {
  it('둘이 같고 하나만 다르면 그 서류를 지목한다', () => {
    expect(comparisonOutliers(row({ billOfLading: '1,280 kg' }))).toEqual(new Set(['billOfLading']));
  });
  it('일치 행은 아무것도 지목하지 않는다', () => {
    expect(comparisonOutliers(row({ matches: true })).size).toBe(0);
  });
  it('셋이 전부 다르면 단정하지 않는다', () => {
    expect(comparisonOutliers(row({ invoice: 'A', packingList: 'B', billOfLading: 'C' })).size).toBe(0);
  });
  it('빈 값은 비교에서 제외하고 남은 둘로 판단한다', () => {
    expect(comparisonOutliers(row({ invoice: '', billOfLading: '1,280 kg' })).size).toBe(0);
  });
  it('공백·대소문자 차이는 같은 값으로 본다', () => {
    expect(comparisonOutliers(row({ invoice: 'hyundai  singapore', packingList: 'HYUNDAI SINGAPORE', billOfLading: 'HMM ALGECIRAS' })))
      .toEqual(new Set(['billOfLading']));
  });
});
