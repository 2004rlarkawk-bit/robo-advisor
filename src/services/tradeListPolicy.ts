import type { SavedTrade } from '../types';

export function isTradeManagerTrade(trade: SavedTrade): boolean {
  return trade.status === 'generated' || trade.status === 'in_progress';
}

export function isDocumentManagerTrade(trade: SavedTrade): boolean {
  return trade.status === 'submitted' && Boolean(trade.submittedAt);
}

export function filterTradeManagerTrades(trades: SavedTrade[]): SavedTrade[] {
  return trades.filter(isTradeManagerTrade);
}

export function filterDocumentManagerTrades(trades: SavedTrade[]): SavedTrade[] {
  return trades.filter(isDocumentManagerTrade);
}
