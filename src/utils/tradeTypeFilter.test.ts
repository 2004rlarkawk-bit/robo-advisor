import { describe, expect, it } from 'vitest';
import type { SavedTrade } from '../types';
import { countTradesByType, filterTradesByType } from './tradeTypeFilter';

const trade = (id: string, tradeType: 'export' | 'import') => ({ id, profile: { tradeType } }) as unknown as SavedTrade;

describe('문서 관리 수출/수입 필터', () => {
  const trades = [trade('e1', 'export'), trade('i1', 'import'), trade('e2', 'export')];

  it('전체면 그대로, 수출·수입이면 해당 거래만 남긴다', () => {
    expect(filterTradesByType(trades, 'all').map((t) => t.id)).toEqual(['e1', 'i1', 'e2']);
    expect(filterTradesByType(trades, 'export').map((t) => t.id)).toEqual(['e1', 'e2']);
    expect(filterTradesByType(trades, 'import').map((t) => t.id)).toEqual(['i1']);
  });

  it('수출·수입 건수를 센다', () => {
    expect(countTradesByType(trades)).toEqual({ export: 2, import: 1 });
    expect(countTradesByType([])).toEqual({ export: 0, import: 0 });
  });
});
