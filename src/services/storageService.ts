/**
 * localStorage 기반 저장 서비스
 * 
 * 거래 프로필, 생성 문서, 이력 등을 localStorage에 저장합니다.
 * 추후 백엔드 DB 연동 시 이 인터페이스만 교체하면 됩니다.
 */
/*수정했습니다
*/
import { supabase } from '../lib/supabase';
import type { SavedTrade, TradeProfile, DocumentStatus, GeneratedDocuments, TradeRole, TradeStatus, TradeType, ValidationIssue } from '../types';
import type { ImportTradeSnapshot } from '../types/importTrade';
import { sanitizeTradeProfile } from '../utils/tradeProfile';

const STORAGE_KEY = 'portai_saved_trades';
const SETTINGS_KEY = 'portai_settings';

// ===== 거래 이력 저장/조회 =====

// [EDIT: Trade Persistence] Supabase trades 테이블에서 읽어오는 row 형태입니다.
interface TradeRow {
  id: string;
  trade_direction?: TradeType | null;
  trade_role?: TradeRole | null;
  arrival_notice?: Record<string, unknown> | null;
  profile: TradeProfile;
  documents: DocumentStatus[] | null;
  generated_docs: GeneratedDocuments | null;
  issues: ValidationIssue[] | null;
  analysis_result?: Record<string, unknown> | null;
  risk_summary?: unknown[] | null;
  customs_progress?: Record<string, unknown> | null;
  status: TradeStatus | null;
  generated_at?: string | null;
  submitted_at?: string | null;
  flow_completed_at?: string | null;
  created_at: string;
  updated_at?: string;
}

// [EDIT: Trade Persistence] Supabase trades row를 SavedTrade 타입으로 변환하는 공통 함수입니다.
function mapTradeRow(row: TradeRow): SavedTrade {
  return {
    id: row.id,
    tradeDirection: row.trade_direction ?? row.profile?.tradeType ?? 'export',
    tradeRole: row.trade_role ?? undefined,
    arrivalNotice: row.arrival_notice ?? null,
    profile: sanitizeTradeProfile(row.profile),
    documents: row.documents || [],
    generatedDocs: row.generated_docs ?? undefined,
    issues: row.issues || [],
    analysisResult: row.analysis_result ?? {},
    riskSummary: row.risk_summary ?? [],
    customsProgress: row.customs_progress ?? {},
    status: row.status ?? 'generated',
    generatedAt: row.generated_at ?? null,
    submittedAt: row.submitted_at ?? null,
    flowCompletedAt: row.flow_completed_at ?? null,
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
    ).map((trade) => ({ ...trade, profile: sanitizeTradeProfile(trade.profile) }));
  } catch (err) {
    console.warn('저장된 거래 이력 파싱 실패 — 빈 목록 반환:', err);
    return [];
  }
}

export interface GeneratedTradeData {
  profile: TradeProfile;
  tradeDirection?: TradeType;
  tradeRole?: TradeRole;
  documents: DocumentStatus[];
  issues: ValidationIssue[];
  generatedDocs?: GeneratedDocuments;
}

function toSupportedIncoterms(value: string): TradeProfile['incoterms'] {
  const code = value.trim().toUpperCase().split(/[\s-]/)[0];
  return ['FOB', 'CFR', 'CIF', 'EXW', 'DDP', 'DAP', 'FCA'].includes(code)
    ? code as TradeProfile['incoterms']
    : '';
}

/** 수입 플로우 완료 결과를 기존 trades 테이블에 저장합니다.
 * 신규 방향/역할 컬럼 마이그레이션이 적용된 환경에서만 호출됩니다.
 */
export async function createCompletedImportTrade(snapshot: ImportTradeSnapshot): Promise<SavedTrade> {
  const userId = await getRequiredUserId();
  const profile: TradeProfile = {
    tradeType: 'import',
    itemName: snapshot.analysis.extracted.productDescription,
    hsCode: snapshot.analysis.extracted.items[0]?.confirmedHSCode ?? snapshot.selectedHSCode?.code ?? '',
    loadPort: snapshot.analysis.extracted.loadPort,
    dischargePort: snapshot.analysis.extracted.dischargePort,
    incoterms: toSupportedIncoterms(snapshot.analysis.extracted.incoterms),
    quantity: Number.parseFloat(snapshot.analysis.extracted.quantity) || '',
    weight: Number.parseFloat(snapshot.analysis.extracted.grossWeight) || '',
    departureDate: snapshot.analysis.extracted.shipmentDate,
    arrivalDate: snapshot.analysis.extracted.estimatedArrivalDate,
    companyName: snapshot.analysis.extracted.importer,
    contact: '',
    partnerName: snapshot.analysis.extracted.exporterDetails.name || snapshot.analysis.extracted.shipper,
    currency: snapshot.analysis.extracted.currency,
    invoiceAmount: Number(snapshot.analysis.extracted.totalAmount) || '',
    invoiceNo: snapshot.analysis.extracted.invoiceNo,
    blNo: snapshot.analysis.extracted.blNo,
    countryOfOrigin: snapshot.analysis.extracted.originCountry,
    netWeight: Number.parseFloat(snapshot.analysis.extracted.netWeight) || '',
    grossWeight: Number.parseFloat(snapshot.analysis.extracted.grossWeight) || '',
    containerNo: snapshot.analysis.extracted.containerNo,
    sealNo: snapshot.analysis.extracted.sealNo,
    vesselOrFlight: snapshot.analysis.extracted.vesselName,
    voyageNo: snapshot.analysis.extracted.voyageNo,
    notifyPartyName: snapshot.analysis.extracted.notifyParty,
  };
  const flowCompletedAt = snapshot.flowCompletedAt;
  const needsArrivalNotice = snapshot.role === 'forwarder' && !snapshot.arrivalNotice;
  const initialStatus: TradeStatus = needsArrivalNotice ? 'in_progress' : 'submitting';
  const payload = {
      user_id: userId,
      trade_direction: 'import',
      trade_role: snapshot.role,
      profile: sanitizeTradeProfile(profile),
      documents: snapshot.documents,
      arrival_notice: snapshot.arrivalNotice ?? null,
      issues: snapshot.analysis.validations,
      generated_docs: { importTrade: snapshot },
      analysis_result: snapshot.analysis,
      risk_summary: snapshot.risks,
      customs_progress: snapshot.cargo ?? {},
      status: initialStatus,
      generated_at: snapshot.generatedAt,
      submitted_at: null,
      flow_completed_at: flowCompletedAt,
  };
  let row: TradeRow;
  if (snapshot.tradeId) {
    const { data, error } = await supabase
      .from('trades')
      .update(payload)
      .eq('id', snapshot.tradeId)
      .eq('user_id', userId)
      .in('status', ['generated', 'in_progress'])
      .select()
      .single();
    if (error) throw error;
    row = data;
  } else {
    // 확인 단계가 끝난 상태를 먼저 기록한 뒤 완료 처리 상태로 전환합니다.
    const { data: generated, error: generatedError } = await supabase
      .from('trades')
      .insert({ ...payload, status: 'generated', submitted_at: null, flow_completed_at: null })
      .select()
      .single();
    if (generatedError) throw generatedError;
    const { data, error } = await supabase
      .from('trades')
      .update({ status: initialStatus, flow_completed_at: flowCompletedAt })
      .eq('id', generated.id)
      .eq('user_id', userId)
      .eq('status', 'generated')
      .select()
      .single();
    if (error) throw error;
    row = data;
  }
  if (initialStatus === 'in_progress') return mapTradeRow(row);

  const submittedAt = new Date().toISOString();
  const { data: submitted, error: submitError } = await supabase
    .from('trades')
    .update({ status: 'submitted', submitted_at: submittedAt })
    .eq('id', row.id)
    .eq('user_id', userId)
    .eq('status', 'submitting')
    .select()
    .single();
  if (submitError) {
    await supabase.from('trades').update({ status: 'failed' }).eq('id', row.id).eq('user_id', userId);
    throw submitError;
  }
  return mapTradeRow(submitted);
}

function generatedTradePayload(data: GeneratedTradeData) {
  return {
    ...(data.tradeDirection ? { trade_direction: data.tradeDirection } : {}),
    ...(data.tradeRole ? { trade_role: data.tradeRole } : {}),
    profile: sanitizeTradeProfile(data.profile),
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

  const { data: submitting, error: submittingError } = await supabase
    .from('trades')
    .update({
      profile: sanitizeTradeProfile(latestData.profile),
      documents: latestData.documents,
      generated_docs: latestData.generatedDocs,
      issues: latestData.issues,
      status: 'submitting',
    })
    .eq('id', tradeId)
    .eq('user_id', userId)
    .eq('status', 'generated')
    .select()
    .maybeSingle();

  if (submittingError) {
    console.error('Supabase 전송 준비 상태 업데이트 실패:', submittingError);
    throw submittingError;
  }
  if (!submitting) throw new Error('이미 최종 제출되었거나 제출할 수 없는 거래입니다.');

  const { data, error } = await supabase
    .from('trades')
    .update({ status: 'submitted', submitted_at: submittedAt })
    .eq('id', tradeId)
    .eq('user_id', userId)
    .eq('status', 'submitting')
    .select()
    .maybeSingle();
  if (error || !data) {
    await supabase.from('trades').update({ status: 'failed' }).eq('id', tradeId).eq('user_id', userId);
    if (error) throw error;
    throw new Error('최종 전송 상태를 저장하지 못했습니다.');
  }
  return mapTradeRow(data);
}

// [EDIT: Document Management] 문서관리 목록은 Supabase 조회 단계에서 status를 필터링할 수 있습니다.
export async function fetchSavedTrades(status?: TradeStatus | TradeStatus[]): Promise<SavedTrade[]> {
  let query = supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false });

  if (Array.isArray(status)) {
    query = query.in('status', status);
  } else if (status) {
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
  const trades = await fetchSavedTrades(['submitted', 'in_progress']);
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
  useLLM: boolean;
}

// useLLM 기본값 true: 서버 AI 기능을 기본 사용하고 설정 페이지에서 끌 수 있게 한다.
const DEFAULT_SETTINGS: AppSettings = {
  userName: '',
  companyName: '',
  companyAddress: '',
  useLLM: true,
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      userName: typeof parsed.userName === 'string' ? parsed.userName : DEFAULT_SETTINGS.userName,
      companyName: typeof parsed.companyName === 'string' ? parsed.companyName : DEFAULT_SETTINGS.companyName,
      companyAddress: typeof parsed.companyAddress === 'string' ? parsed.companyAddress : DEFAULT_SETTINGS.companyAddress,
      useLLM: typeof parsed.useLLM === 'boolean' ? parsed.useLLM : DEFAULT_SETTINGS.useLLM,
    };
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
