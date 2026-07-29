import { describe, expect, it } from 'vitest';
import type { PersistedTradeStatus, SavedTrade } from '../types';
import {
  filterDocumentManagerTrades,
  filterTradeManagerTrades,
} from './tradeListPolicy';

function trade(status: PersistedTradeStatus, submittedAt: string | null = null): SavedTrade {
  return {
    id: `${status}-${submittedAt ?? 'null'}`,
    profile: {
      tradeType: 'import',
      itemName: '',
      hsCode: '',
      loadPort: '',
      dischargePort: '',
      incoterms: '',
      quantity: '',
      weight: '',
      departureDate: '',
      arrivalDate: '',
      companyName: '',
      contact: '',
    },
    documents: [],
    issues: [],
    status,
    submittedAt,
    createdAt: '2026-07-30T00:00:00.000Z',
  };
}

describe('거래관리/문서관리 상태 분리', () => {
  const generated = trade('generated');
  const inProgress = trade('in_progress');
  const submitted = trade('submitted', '2026-07-30T01:00:00.000Z');
  const invalidSubmitted = trade('submitted');
  const failed = trade('failed');

  it('거래관리는 generated와 in_progress만 허용한다', () => {
    expect(filterTradeManagerTrades([
      generated,
      inProgress,
      submitted,
      invalidSubmitted,
      failed,
    ])).toEqual([generated, inProgress]);
  });

  it('문서관리는 submitted이면서 submitted_at이 있는 거래만 허용한다', () => {
    expect(filterDocumentManagerTrades([
      generated,
      inProgress,
      submitted,
      invalidSubmitted,
      failed,
    ])).toEqual([submitted]);
  });

  it('같은 거래가 두 목록에 동시에 포함되지 않는다', () => {
    const all = [generated, inProgress, submitted, invalidSubmitted, failed];
    const managedIds = new Set(filterTradeManagerTrades(all).map(({ id }) => id));
    expect(filterDocumentManagerTrades(all).some(({ id }) => managedIds.has(id))).toBe(false);
  });
});
