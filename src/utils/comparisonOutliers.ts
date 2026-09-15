import type { ImportComparisonRow } from '../types/importTrade';

export type ComparisonDocKey = 'invoice' | 'packingList' | 'billOfLading';

/**
 * 불일치 행에서 "튀는 값"을 가진 서류를 찾는다.
 * 셋 중 둘이 같고 하나만 다르면 그 하나가 이상값 — 화면에서 빨갛게 표시한다.
 * 셋이 전부 다르거나 비교할 값이 부족하면 어느 쪽이 틀렸는지 단정할 수 없으므로
 * 아무것도 지목하지 않는다(전부 '불일치' 배지로만 안내).
 */
export function comparisonOutliers(row: ImportComparisonRow): Set<ComparisonDocKey> {
  const outliers = new Set<ComparisonDocKey>();
  if (row.matches) return outliers;

  const entries: Array<[ComparisonDocKey, string]> = [
    ['invoice', normalize(row.invoice)],
    ['packingList', normalize(row.packingList)],
    ['billOfLading', normalize(row.billOfLading)],
  ];
  const present = entries.filter(([, value]) => value !== '');
  if (present.length < 2) return outliers;

  const counts = new Map<string, number>();
  for (const [, value] of present) counts.set(value, (counts.get(value) ?? 0) + 1);
  const majority = [...counts.entries()].filter(([, count]) => count >= 2).map(([value]) => value);
  if (majority.length !== 1) return outliers;

  for (const [key, value] of present) {
    if (value !== majority[0]) outliers.add(key);
  }
  return outliers;
}

function normalize(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}
