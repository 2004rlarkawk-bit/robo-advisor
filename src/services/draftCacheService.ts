import { supabase } from '../lib/supabase';
import type { DocumentStatus, TradeProfile, TradeRole, TradeStatus, TradeType, ValidationIssue } from '../types';
import type { TradeFormDataV3 } from '../types/tradeFormData';
import { sanitizeTradeProfile } from '../utils/tradeProfile';
import { tradeFormDataToProfile, tradeProfileToFormData } from './tradeDataMapper';

const DRAFT_CACHE_VERSION = 2;
const LEGACY_DRAFT_CACHE_VERSION = 1;

export interface LocalTradeDraft {
  version: number;
  profile: TradeProfile;
  updatedAt: string;
}

export interface TradeDraftRow {
  id?: string;
  user_id: string;
  direction?: TradeType;
  role?: TradeRole;
  trade_id?: string | null;
  schema_version?: number;
  current_step?: number;
  form_data?: TradeFormDataV3;
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

export function getTradeDraftCacheKey(userId: string, direction: TradeType = 'export', role: TradeRole = 'shipper'): string {
  return `portai_trade_draft_${userId}_${direction}_${role}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function saveDraftToLocal(userId: string, profile: TradeProfile, role: TradeRole = 'shipper'): LocalTradeDraft {
  const draft: LocalTradeDraft = {
    version: DRAFT_CACHE_VERSION,
    profile: sanitizeTradeProfile(profile),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(getTradeDraftCacheKey(userId, profile.tradeType, role), JSON.stringify(draft));
  return draft;
}

export function loadDraftFromLocal(userId: string, direction: TradeType = 'export', role: TradeRole = 'shipper'): LocalTradeDraft | null {
  try {
    const raw = localStorage.getItem(getTradeDraftCacheKey(userId, direction, role));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || !isObject(parsed.profile)) return null;

    if (parsed.version === DRAFT_CACHE_VERSION && typeof parsed.updatedAt === 'string') {
      return { ...parsed, profile: sanitizeTradeProfile(parsed.profile as unknown as TradeProfile) } as unknown as LocalTradeDraft;
    }
    if (parsed.version === LEGACY_DRAFT_CACHE_VERSION && typeof parsed.savedAt === 'string') {
      return { version: DRAFT_CACHE_VERSION, profile: sanitizeTradeProfile(parsed.profile as unknown as TradeProfile), updatedAt: parsed.savedAt };
    }
    return null;
  } catch (error) {
    console.warn('[Trade Draft] localStorage 초안 파싱 실패:', error);
    return null;
  }
}

export function removeDraftFromLocal(userId: string, direction: TradeType = 'export', role: TradeRole = 'shipper'): void {
  localStorage.removeItem(getTradeDraftCacheKey(userId, direction, role));
}

export function selectNewestDraft(local: LocalTradeDraft | null, database: TradeDraftRow | null): DraftSnapshot | null {
  if (!local && !database) return null;
  if (!database) return { profile: sanitizeTradeProfile(local!.profile), updatedAt: local!.updatedAt, source: 'local' };
  if (!local) return { profile: sanitizeTradeProfile(database.profile), updatedAt: database.updated_at, source: 'database' };
  return parseTimestamp(local.updatedAt) >= parseTimestamp(database.updated_at)
    ? { profile: sanitizeTradeProfile(local.profile), updatedAt: local.updatedAt, source: 'local' }
    : { profile: sanitizeTradeProfile(database.profile), updatedAt: database.updated_at, source: 'database' };
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

function draftIdentity(userId: string, direction: TradeType, role: TradeRole): string {
  return `${userId}:${direction}:${role}`;
}

export async function loadTradeDraft(userId: string, direction: TradeType = 'export', role: TradeRole = 'shipper'): Promise<TradeDraftRow | null> {
  const { data, error } = await supabase
    .from('trade_drafts')
    .select('id, user_id, direction, role, trade_id, schema_version, current_step, form_data, created_at, updated_at')
    .eq('user_id', userId)
    .eq('direction', direction)
    .eq('role', role)
    .maybeSingle();

  if (error) throw error;
  if (!data || !isObject(data.form_data) || typeof data.updated_at !== 'string') return null;

  const row = {
    ...data,
    form_data: data.form_data as unknown as TradeFormDataV3,
    profile: tradeFormDataToProfile(data.form_data as unknown as TradeFormDataV3),
  } as TradeDraftRow;
  lastDatabaseSnapshots.set(draftIdentity(userId, direction, role), {
    signature: profileSignature(row.profile),
    updatedAt: row.updated_at,
  });
  return row;
}

export interface SaveTradeDraftResult {
  saved: boolean;
  updatedAt: string;
}

export async function saveTradeDraft(userId: string, profile: TradeProfile, role: TradeRole = 'shipper'): Promise<SaveTradeDraftResult> {
  const cleanProfile = sanitizeTradeProfile(profile);
  const direction = cleanProfile.tradeType;
  const identity = draftIdentity(userId, direction, role);
  const signature = profileSignature(cleanProfile);
  const previous = lastDatabaseSnapshots.get(identity);
  if (previous?.signature === signature) {
    return { saved: false, updatedAt: previous.updatedAt };
  }

  const { data, error } = await supabase
    .from('trade_drafts')
    .upsert(
      {
        user_id: userId,
        direction,
        role,
        schema_version: 3,
        current_step: 1,
        form_data: tradeProfileToFormData(cleanProfile, role),
      },
      { onConflict: 'user_id,direction,role' },
    )
    .select('updated_at')
    .single();

  if (error) throw error;
  if (typeof data?.updated_at !== 'string' || data.updated_at.trim() === '') {
    throw new Error('초안 저장 후 서버 수정 시각을 확인하지 못했습니다.');
  }
  const savedAt = data.updated_at;
  lastDatabaseSnapshots.set(identity, { signature, updatedAt: savedAt });
  return { saved: true, updatedAt: savedAt };
}

export async function deleteTradeDraft(userId: string, direction: TradeType = 'export', role: TradeRole = 'shipper'): Promise<void> {
  const { error } = await supabase
    .from('trade_drafts')
    .delete()
    .eq('user_id', userId)
    .eq('direction', direction)
    .eq('role', role);

  if (error) throw error;
  lastDatabaseSnapshots.delete(draftIdentity(userId, direction, role));
}

export function loadDraftCache(userId: string): CachedTradeDraft | null {
  try {
    const raw = localStorage.getItem(getTradeDraftCacheKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || parsed.version !== LEGACY_DRAFT_CACHE_VERSION || !isObject(parsed.profile)) return null;
    return { ...parsed, profile: sanitizeTradeProfile(parsed.profile as unknown as TradeProfile) } as unknown as CachedTradeDraft;
  } catch {
    return null;
  }
}

export function saveDraftCache(userId: string, draft: Omit<CachedTradeDraft, 'version' | 'savedAt'>): void {
  const payload: CachedTradeDraft = {
    ...draft,
    profile: sanitizeTradeProfile(draft.profile),
    version: LEGACY_DRAFT_CACHE_VERSION,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(getTradeDraftCacheKey(userId), JSON.stringify(payload));
}

export function clearDraftCache(userId: string): void {
  removeDraftFromLocal(userId);
}
