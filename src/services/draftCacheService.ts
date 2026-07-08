// [NEW: Trade Draft Cache]
// 로그인한 사용자별로 작성 중인 거래 화면 상태만 localStorage에 임시 저장합니다.
import type { DocumentStatus, TradeProfile, TradeStatus, ValidationIssue } from '../types';

const DRAFT_CACHE_VERSION = 1;

export interface HsCandidateCache {
  code: string;
  description: string;
  confidence: string;
  reasoning: string;
}

export interface CachedTradeDraft {
  version: number;
  savedAt: string;
  profile: TradeProfile;
  currentTradeId: string | null;
  hasGenerated: boolean;
  documents: DocumentStatus[];
  issues: ValidationIssue[];
  htmlTemplates: Record<string, string>;
  aiFeedback: string;
  hsCandidates: HsCandidateCache[];
  activeMenu?: string;
  dashboardMode?: string;
  tradeStatus: TradeStatus;
}

// [NEW: Trade Draft Cache] 같은 브라우저를 여러 회원이 써도 캐시가 섞이지 않도록 Supabase user.id를 key에 포함합니다.
export function getTradeDraftCacheKey(userId: string) {
  return `portai_trade_draft_${userId}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// [NEW: Trade Draft Cache] 오래된 버전이거나 깨진 JSON이면 null을 반환해서 앱 화면이 깨지지 않게 합니다.
export function loadDraftCache(userId: string): CachedTradeDraft | null {
  const raw = localStorage.getItem(getTradeDraftCacheKey(userId));
  if (!raw) return null;

  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed) || parsed.version !== DRAFT_CACHE_VERSION || !isObject(parsed.profile)) {
    return null;
  }

  return parsed as unknown as CachedTradeDraft;
}

// [NEW: Trade Draft Cache] 인증 정보나 API 키는 저장하지 않고, 복원 가능한 작업 상태만 저장합니다.
export function saveDraftCache(userId: string, draft: Omit<CachedTradeDraft, 'version' | 'savedAt'>) {
  const payload: CachedTradeDraft = {
    ...draft,
    version: DRAFT_CACHE_VERSION,
    savedAt: new Date().toISOString(),
  };

  localStorage.setItem(getTradeDraftCacheKey(userId), JSON.stringify(payload));
}

// [NEW: Trade Draft Cache] 사용자가 명시적으로 새 거래를 시작할 때만 현재 사용자 캐시를 삭제합니다.
export function clearDraftCache(userId: string) {
  localStorage.removeItem(getTradeDraftCacheKey(userId));
}
