/**
 * localStorage 기반 저장 서비스
 * 
 * 거래 프로필, 생성 문서, 이력 등을 localStorage에 저장합니다.
 * 추후 백엔드 DB 연동 시 이 인터페이스만 교체하면 됩니다.
 */
/*수정했습니다
*/
import { supabase } from '../lib/supabase';
import type { SavedTrade, TradeProfile, DocumentStatus, GeneratedDocuments, TradeStatus, ValidationIssue } from '../types';

const STORAGE_KEY = 'portai_saved_trades';
const SETTINGS_KEY = 'portai_settings';

// ===== 거래 이력 저장/조회 =====

// [EDIT: Trade Persistence] Supabase trades 테이블에서 읽어오는 row 형태입니다.
interface TradeRow {
  id: string;
  profile: TradeProfile;
  documents: DocumentStatus[] | null;
  generated_docs: GeneratedDocuments | null;
  issues: ValidationIssue[] | null;
  status: TradeStatus | null;
  generated_at?: string | null;
  submitted_at?: string | null;
  created_at: string;
  updated_at?: string;
}

// [EDIT: Trade Persistence] Supabase trades row를 SavedTrade 타입으로 변환하는 공통 함수입니다.
function mapTradeRow(row: TradeRow): SavedTrade {
  return {
    id: row.id,
    profile: row.profile,
    documents: row.documents || [],
    generatedDocs: row.generated_docs ?? undefined,
    issues: row.issues || [],
    status: row.status ?? 'generated',
    generatedAt: row.generated_at ?? null,
    submittedAt: row.submitted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// [EDIT: Trade Persistence] 프론트에서 전달한 user_id를 믿지 않고 Supabase 세션에서 현재 사용자만 가져옵니다.
async function getRequiredUserId(): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');
  return userId;
}

export function getSavedTrades(): SavedTrade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // 형태가 깨진 항목이 하나라도 있으면 문서 관리 탭 렌더링 전체가 죽으므로 걸러낸다
    return parsed.filter(
      (t): t is SavedTrade =>
        !!t &&
        typeof t === 'object' &&
        typeof (t as SavedTrade).id === 'string' &&
        typeof (t as SavedTrade).createdAt === 'string' &&
        !!(t as SavedTrade).profile &&
        typeof (t as SavedTrade).profile === 'object' &&
        Array.isArray((t as SavedTrade).documents) &&
        Array.isArray((t as SavedTrade).issues)
    );
  } catch (err) {
    console.warn('저장된 거래 이력 파싱 실패 — 빈 목록 반환:', err);
    return [];
  }
}

export interface GeneratedTradeData {
  profile: TradeProfile;
  documents: DocumentStatus[];
  issues: ValidationIssue[];
  generatedDocs?: GeneratedDocuments;
}

function generatedTradePayload(data: GeneratedTradeData) {
  return {
    profile: data.profile,
    documents: data.documents,
    generated_docs: data.generatedDocs,
    issues: data.issues,
    status: 'generated' as const,
    generated_at: new Date().toISOString(),
    submitted_at: null,
  };
}

/** 최초 필요서류 생성: 현재 로그인 사용자의 새 generated 행을 INSERT한다. */
export async function createGeneratedTrade(data: GeneratedTradeData): Promise<SavedTrade> {
  const userId = await getRequiredUserId();
  const { data: row, error } = await supabase
    .from('trades')
    .insert({ user_id: userId, ...generatedTradePayload(data) })
    .select()
    .single();

  if (error) {
    console.error('Supabase 거래 생성 실패:', error);
    throw error;
  }
  return mapTradeRow(row);
}

/** 필요서류 재생성: 본인의 아직 제출되지 않은 동일 행만 UPDATE한다. */
export async function updateGeneratedTrade(tradeId: string, data: GeneratedTradeData): Promise<SavedTrade> {
  const userId = await getRequiredUserId();
  const { data: row, error } = await supabase
    .from('trades')
    .update(generatedTradePayload(data))
    .eq('id', tradeId)
    .eq('user_id', userId)
    .eq('status', 'generated')
    .select()
    .maybeSingle();

  if (error) {
    console.error('Supabase 거래 재생성 업데이트 실패:', error);
    throw error;
  }
  if (!row) throw new Error('이미 최종 제출되었거나 수정할 수 없는 거래입니다.');
  return mapTradeRow(row);
}

// [EDIT: Trade Persistence] 캐시에 남은 currentTradeId가 실제 DB에 존재하는지 현재 사용자 범위에서 확인합니다.
export async function fetchSavedTradeById(id: string): Promise<SavedTrade | null> {
  const userId = await getRequiredUserId();

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapTradeRow(data) : null;
}

// [EDIT: Trade Persistence] 전체 문서 전송은 새 row를 만들지 않고 같은 거래 row의 상태만 submitted로 갱신합니다.
export async function markTradeAsSubmitted(
  tradeId: string,
  latestData: {
    profile: TradeProfile;
    documents: DocumentStatus[];
    issues: ValidationIssue[];
    generatedDocs?: GeneratedDocuments;
  }
): Promise<SavedTrade> {
  const userId = await getRequiredUserId();
  const submittedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('trades')
    .update({
      profile: latestData.profile,
      documents: latestData.documents,
      generated_docs: latestData.generatedDocs,
      issues: latestData.issues,
      status: 'submitted',
      submitted_at: submittedAt,
    })
    .eq('id', tradeId)
    .eq('user_id', userId)
    .eq('status', 'generated')
    .select()
    .maybeSingle();

  if (error) {
    console.error('Supabase 전송 상태 업데이트 실패:', error);
    throw error;
  }

  if (!data) throw new Error('이미 최종 제출되었거나 제출할 수 없는 거래입니다.');

  return mapTradeRow(data);
}

// [EDIT: Document Management] 문서관리 목록은 Supabase 조회 단계에서 status를 필터링할 수 있습니다.
export async function fetchSavedTrades(status?: TradeStatus): Promise<SavedTrade[]> {
  let query = supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(mapTradeRow);
}

// [EDIT: Supabase Auth] RLS 정책에 따라 본인 trade만 삭제됩니다.
export async function deleteSavedTrade(id: string): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// [EDIT: Supabase Auth] 로그인한 사용자에게 보이는 모든 trade를 삭제합니다.
export async function clearSavedTrades(): Promise<void> {
  // [EDIT: Document Management] 문서관리 화면에 보이는 최종 전송 거래만 전체 삭제 대상으로 삼습니다.
  const trades = await fetchSavedTrades('submitted');
  if (trades.length === 0) return;

  const { error } = await supabase
    .from('trades')
    .delete()
    .in('id', trades.map((trade) => trade.id));

  if (error) throw error;
}

export function deleteTrade(id: string): void {
  const trades = getSavedTrades().filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
}

export function clearAllTrades(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ===== 설정 저장 =====

export interface AppSettings {
  userName: string;
  companyName: string;
  companyAddress: string;
  claudeApiKey: string;
  useLLM: boolean;
}

// useLLM 기본값 true: 키가 등록돼 있으면 LLM 기능이 바로 동작하는 기존 동작을 유지하고,
// 설정 페이지에서 끌 수 있게 한다 (API 비용 절약 옵션).
const DEFAULT_SETTINGS: AppSettings = {
  userName: '',
  companyName: '',
  companyAddress: '',
  claudeApiKey: '',
  useLLM: true,
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch (err) {
    console.warn('설정 파싱 실패 — 기본값 반환:', err);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const current = getSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));

  // 같은 탭의 다른 컴포넌트가 설정 변경을 즉시 반영할 수 있도록 알림
  window.dispatchEvent(new CustomEvent('portai-settings-changed'));
  
  // API 키가 변경되면 claudeService에도 동기화
  if (settings.claudeApiKey !== undefined) {
    localStorage.setItem('portai_claude_api_key', settings.claudeApiKey);
  }
}

// ===== 통계 조회 (데이터 분석 탭용) =====

export interface TradeAnalytics {
  totalTrades: number;
  exportCount: number;
  importCount: number;
  issuesByType: Record<string, number>;
  tradesByMonth: { month: string; count: number }[];
  completionRate: number;
}

export function getAnalytics(): TradeAnalytics {
  const trades = getSavedTrades();
  
  const issuesByType: Record<string, number> = {};
  let totalCompleted = 0;
  let totalDocs = 0;
  const monthMap: Record<string, number> = {};

  for (const trade of trades) {
    // 이슈 유형 카운트
    for (const issue of trade.issues) {
      const key = issue.field;
      issuesByType[key] = (issuesByType[key] || 0) + 1;
    }
    
    // 문서 완료율
    for (const doc of trade.documents) {
      totalDocs++;
      if (doc.status === 'completed') totalCompleted++;
    }

    // 월별 거래 수
    const month = trade.createdAt.substring(0, 7); // "2026-07"
    monthMap[month] = (monthMap[month] || 0) + 1;
  }

  const tradesByMonth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return {
    totalTrades: trades.length,
    exportCount: trades.filter(t => t.profile.tradeType === 'export').length,
    importCount: trades.filter(t => t.profile.tradeType === 'import').length,
    issuesByType,
    tradesByMonth,
    completionRate: totalDocs > 0 ? Math.round((totalCompleted / totalDocs) * 100) : 0,
  };
}
