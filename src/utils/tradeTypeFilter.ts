import type { SavedTrade } from '../types';

/** 문서 관리·통관 내역 공통 수출/수입 필터 */
export type TradeTypeFilter = 'all' | 'export' | 'import';

export interface TradeTypeCounts {
  export: number;
  import: number;
}

export function filterTradesByType(trades: SavedTrade[], filter: TradeTypeFilter = 'all'): SavedTrade[] {
  return filter === 'all' ? trades : trades.filter((trade) => trade.profile.tradeType === filter);
}

export function countTradesByType(trades: SavedTrade[]): TradeTypeCounts {
  const exportCount = trades.filter((trade) => trade.profile.tradeType === 'export').length;
  return { export: exportCount, import: trades.length - exportCount };
}
