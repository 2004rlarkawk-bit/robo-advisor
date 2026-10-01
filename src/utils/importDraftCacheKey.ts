import type { UserTradeRole } from '../types/importTrade';

/** 수입 작업 초안을 브라우저에 보관하는 localStorage 키. */
export function importDraftCacheKey(userId: string, role: UserTradeRole): string {
  return `portai_import_draft:${userId}:${role}`;
}
