import type { PersistedTradeStatus } from '../types';

export type GeneratedTradeWriteMode = 'insert' | 'update' | 'blocked_submitted';

export function decideGeneratedTradeWrite(
  currentTradeId: string | null,
  currentTradeStatus: PersistedTradeStatus | null,
): GeneratedTradeWriteMode {
  if (currentTradeStatus === 'submitted') return 'blocked_submitted';
  return currentTradeId?.trim() ? 'update' : 'insert';
}
