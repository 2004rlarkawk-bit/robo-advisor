import type { TradeStatus } from '../types';

export type GeneratedTradeWriteMode = 'insert' | 'update' | 'blocked_submitted';

export function decideGeneratedTradeWrite(
  currentTradeId: string | null,
  currentTradeStatus: TradeStatus | null,
): GeneratedTradeWriteMode {
  if (currentTradeStatus === 'submitted') return 'blocked_submitted';
  return currentTradeId?.trim() ? 'update' : 'insert';
}
