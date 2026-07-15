import { supabase } from '../lib/supabase';
import type { DocumentStatus, TradeProfile, TradeStatus, ValidationIssue } from '../types';

const DRAFT_CACHE_VERSION = 2;
const LEGACY_DRAFT_CACHE_VERSION = 1;

export interface LocalTradeDraft {
  version: number;
  profile: TradeProfile;
  updatedAt: string;
}

export interface TradeDraftRow {
  user_id: string;
  profile: TradeProfile;
  created_at?: string;
  updated_at: string;
}

export interface DraftSnapshot {
  profile: TradeProfile;
  updatedAt: string;
  source: 'local' | 'database';
}

export interface HsCandidateCache {
  code: string;
  description: string;
  confidence: string;
  reasoning: string;
}

// 이전 구현의 화면 전체 캐시 타입과 함수는 기존 호출부 호환을 위해 유지합니다.
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

export function getTradeDraftCacheKey(userId: string): string {
  return `portai_trade_draft_${userId}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function saveDraftToLocal(userId: string, profile: TradeProfile): LocalTradeDraft {
  const draft: LocalTradeDraft = {
    version: DRAFT_CACHE_VERSION,
    profile,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(getTradeDraftCacheKey(userId), JSON.stringify(draft));
  return draft;
}

export function loadDraftFromLocal(userId: string): LocalTradeDraft | null {
  try {
    const raw = localStorage.getItem(getTradeDraftCacheKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || !isObject(parsed.profile)) return null;

    if (parsed.version === DRAFT_CACHE_VERSION && typeof parsed.updatedAt === 'string') {
      return parsed as unknown as LocalTradeDraft;
    }
    if (parsed.version === LEGACY_DRAFT_CACHE_VERSION && typeof parsed.savedAt === 'string') {
      return { version: DRAFT_CACHE_VERSION, profile: parsed.profile as unknown as TradeProfile, updatedAt: parsed.savedAt };
    }
    return null;
  } catch (error) {
    console.warn('[Trade Draft] localStorage 초안 파싱 실패:', error);
    return null;
  }
}

export function removeDraftFromLocal(userId: string): void {
  localStorage.removeItem(getTradeDraftCacheKey(userId));
}

export function selectNewestDraft(local: LocalTradeDraft | null, database: TradeDraftRow | null): DraftSnapshot | null {
  if (!local && !database) return null;
  if (!database) return { profile: local!.profile, updatedAt: local!.updatedAt, source: 'local' };
  if (!local) return { profile: database.profile, updatedAt: database.updated_at, source: 'database' };
  return parseTimestamp(local.updatedAt) >= parseTimestamp(database.updated_at)
    ? { profile: local.profile, updatedAt: local.updatedAt, source: 'local' }
    : { profile: database.profile, updatedAt: database.updated_at, source: 'database' };
}

const lastDatabaseSnapshots = new Map<string, { signature: string; updatedAt: string }>();

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForSignature);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeForSignature(nested)]),
    );
  }
  return value;
}

function profileSignature(profile: TradeProfile): string {
  return JSON.stringify(normalizeForSignature(profile));
}

export async function loadTradeDraft(userId: string): Promise<TradeDraftRow | null> {
  const { data, error } = await supabase
    .from('trade_drafts')
    .select('user_id, profile, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data || !isObject(data.profile) || typeof data.updated_at !== 'string') return null;

  const row = data as unknown as TradeDraftRow;
  lastDatabaseSnapshots.set(userId, {
    signature: profileSignature(row.profile),
    updatedAt: row.updated_at,
  });
  return row;
}

export interface SaveTradeDraftResult {
  saved: boolean;
  updatedAt: string;
}

export async function saveTradeDraft(userId: string, profile: TradeProfile): Promise<SaveTradeDraftResult> {
  const signature = profileSignature(profile);
  const previous = lastDatabaseSnapshots.get(userId);
  if (previous?.signature === signature) {
    return { saved: false, updatedAt: previous.updatedAt };
  }

  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('trade_drafts')
    .upsert(
      { user_id: userId, profile, updated_at: updatedAt },
      { onConflict: 'user_id' },
    )
    .select('updated_at')
    .single();

  if (error) throw error;
  const savedAt = typeof data?.updated_at === 'string' ? data.updated_at : updatedAt;
  lastDatabaseSnapshots.set(userId, { signature, updatedAt: savedAt });
  return { saved: true, updatedAt: savedAt };
}

export async function deleteTradeDraft(userId: string): Promise<void> {
  const { error } = await supabase
    .from('trade_drafts')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
  lastDatabaseSnapshots.delete(userId);
}

export function loadDraftCache(userId: string): CachedTradeDraft | null {
  try {
    const raw = localStorage.getItem(getTradeDraftCacheKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || parsed.version !== LEGACY_DRAFT_CACHE_VERSION || !isObject(parsed.profile)) return null;
    return parsed as unknown as CachedTradeDraft;
  } catch {
    return null;
  }
}

export function saveDraftCache(userId: string, draft: Omit<CachedTradeDraft, 'version' | 'savedAt'>): void {
  const payload: CachedTradeDraft = {
    ...draft,
    version: LEGACY_DRAFT_CACHE_VERSION,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(getTradeDraftCacheKey(userId), JSON.stringify(payload));
}

export function clearDraftCache(userId: string): void {
  removeDraftFromLocal(userId);
}
