/** Supabase v3 거래 persistence와 레거시 localStorage 조회 유틸리티입니다. */
import { supabase } from '../lib/supabase';
import type { SavedTrade, TradeProfile, DocumentStatus, GeneratedDocuments, PersistedTradeStatus, TradeRole, TradeType, ValidationIssue } from '../types';
import type { ImportDocumentMeta, ImportTradeSnapshot } from '../types/importTrade';
import type { TradeAttachment, TradeDocumentData, TradeFormDataV3, TradeWorkflowData } from '../types/tradeFormData';
import { sanitizeTradeProfile } from '../utils/tradeProfile';
import {
  findArrivalNotice,
  generatedDocumentsToData,
  hasValidStoragePath,
  importSnapshotToPersistence,
  reconstructImportSnapshot,
  tradeFormDataToProfile,
  tradeProfileToFormData,
} from './tradeDataMapper';
import { removeTradeAttachments } from './tradeAttachmentStorageService';
import {
  filterDocumentManagerTrades,
  filterTradeManagerTrades,
} from './tradeListPolicy';

const STORAGE_KEY = 'portai_saved_trades';
const SETTINGS_KEY = 'portai_settings';

// ===== 거래 이력 저장/조회 =====

// [EDIT: Trade Persistence] Supabase trades 테이블에서 읽어오는 row 형태입니다.
interface TradeRow {
  id: string;
  direction: TradeType;
  role: TradeRole;
  schema_version: number;
  form_data: TradeFormDataV3;
  workflow_data: TradeWorkflowData | null;
  documents: unknown[] | null;
  document_data: TradeDocumentData | null;
  issues: ValidationIssue[] | null;
  status: PersistedTradeStatus;
  generated_at?: string | null;
  submitted_at?: string | null;
  flow_completed_at?: string | null;
  created_at: string;
  updated_at?: string;
}

function importDocumentsToStatuses(documents: ImportDocumentMeta[]): DocumentStatus[] {
  return documents.map((document) => {
    const completed = document.analysisStatus === 'success' || document.analysisSuccess === true;
    const failed = document.analysisStatus === 'error' || document.status === 'error';
    return {
      id: document.id,
      name: document.name,
      status: completed ? 'completed' : failed ? 'review_required' : 'not_started',
      statusText: completed ? '분석 완료' : failed ? '검토 필요' : '분석 대기',
    };
  });
}

// [EDIT: Trade Persistence] Supabase trades row를 SavedTrade 타입으로 변환하는 공통 함수입니다.
function mapTradeRow(row: TradeRow): SavedTrade {
  const formData = row.form_data;
  const workflowData = row.workflow_data ?? {};
  const importDocuments = row.direction === 'import'
    ? row.documents as ImportDocumentMeta[]
    : [];
  const importSnapshot = reconstructImportSnapshot(
    formData,
    workflowData,
    importDocuments,
    row.id,
  );
  const generatedDocuments = row.document_data?.generatedDocuments;
  return {
    id: row.id,
    tradeDirection: row.direction,
    tradeRole: row.role,
    attachments: Array.isArray(formData.attachments) ? formData.attachments : [],
    arrivalNotice: findArrivalNotice(formData),
    profile: tradeFormDataToProfile(formData),
    documents: row.direction === 'export'
      ? row.documents as DocumentStatus[]
      : importDocumentsToStatuses(importDocuments),
    generatedDocs: {
      ...(generatedDocuments ?? {}),
      ...(importSnapshot ? { importTrade: importSnapshot } : {}),
    },
    issues: row.issues || [],
    analysisResult: importSnapshot?.analysis ?? {},
    riskSummary: importSnapshot?.risks ?? [],
    customsProgress: importSnapshot?.cargo ?? {},
    status: row.status,
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
  attachments?: TradeAttachment[];
  documents: DocumentStatus[];
  issues: ValidationIssue[];
  generatedDocs?: GeneratedDocuments;
}

function importTradePayload(
  userId: string,
  snapshot: ImportTradeSnapshot,
  status: PersistedTradeStatus,
) {
  const persistence = importSnapshotToPersistence(snapshot);
  return {
    user_id: userId,
    direction: 'import' as const,
    role: snapshot.role,
    status,
    schema_version: 3,
    form_data: persistence.formData,
    workflow_data: persistence.workflowData,
    documents: persistence.documents,
    document_data: null,
    issues: snapshot.analysis.validations,
    generated_at: snapshot.generatedAt,
    submitted_at: status === 'submitted' ? new Date().toISOString() : null,
    flow_completed_at: snapshot.flowCompletedAt ?? null,
  };
}

export function getCompletedImportStatus(
  role: TradeRole,
  arrivalNotice: { storagePath?: string } | null | undefined,
): PersistedTradeStatus {
  return role === 'forwarder' && !hasValidStoragePath(arrivalNotice)
    ? 'in_progress'
    : 'submitted';
}

/** 수입 확인 단계 성공 시 DB에 generated 상태를 기록합니다. */
export async function createGeneratedImportTrade(snapshot: ImportTradeSnapshot): Promise<SavedTrade> {
  const userId = await getRequiredUserId();
  const payload = importTradePayload(userId, snapshot, 'generated');
  const query = snapshot.tradeId
    ? supabase
      .from('trades')
      .update(payload)
      .eq('id', snapshot.tradeId)
      .eq('user_id', userId)
      .in('status', ['generated', 'in_progress'])
    : supabase.from('trades').insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return mapTradeRow(data as TradeRow);
}

/** 수입 플로우 완료 결과를 v3 trades 테이블에 저장합니다. */
export async function createCompletedImportTrade(snapshot: ImportTradeSnapshot): Promise<SavedTrade> {
  const userId = await getRequiredUserId();
  const completedStatus = getCompletedImportStatus(snapshot.role, snapshot.arrivalNotice);
  const payload = importTradePayload(userId, snapshot, completedStatus);

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
    if (!data) throw new Error('수정할 수입 거래를 찾지 못했습니다.');
    return mapTradeRow(data as TradeRow);
  }

  const { data, error } = await supabase
    .from('trades')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return mapTradeRow(data as TradeRow);
}

function generatedTradePayload(data: GeneratedTradeData) {
  const direction = data.tradeDirection ?? data.profile.tradeType;
  const role = data.tradeRole ?? 'shipper';
  return {
    direction,
    role,
    schema_version: 3,
    form_data: tradeProfileToFormData(data.profile, role, data.attachments ?? []),
    workflow_data: {},
    documents: data.documents,
    document_data: generatedDocumentsToData(data.generatedDocs),
    issues: data.issues,
    status: 'generated' as const,
    generated_at: new Date().toISOString(),
    flow_completed_at: null,
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
    tradeRole?: TradeRole;
    documents: DocumentStatus[];
    issues: ValidationIssue[];
    generatedDocs?: GeneratedDocuments;
    attachments?: TradeAttachment[];
  }
): Promise<SavedTrade> {
  const userId = await getRequiredUserId();
  const submittedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('trades')
    .update({
      form_data: tradeProfileToFormData(
        latestData.profile,
        latestData.tradeRole ?? 'shipper',
        latestData.attachments ?? [],
      ),
      documents: latestData.documents,
      document_data: generatedDocumentsToData(latestData.generatedDocs),
      issues: latestData.issues,
      status: 'submitted',
      submitted_at: submittedAt,
    })
    .eq('id', tradeId)
    .eq('user_id', userId)
    .eq('status', 'generated')
    .select()
    .maybeSingle();

  if (error || !data) {
    if (error) throw error;
    throw new Error('최종 전송 상태를 저장하지 못했습니다.');
  }
  return mapTradeRow(data as TradeRow);
}

// [EDIT: Document Management] 문서관리 목록은 Supabase 조회 단계에서 status를 필터링할 수 있습니다.
export async function fetchSavedTrades(status?: PersistedTradeStatus | PersistedTradeStatus[]): Promise<SavedTrade[]> {
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

/** 거래관리는 최종 제출 전 generated/in_progress 거래만 최신 수정순으로 조회합니다. */
export async function fetchTradeManagerTrades(): Promise<SavedTrade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .in('status', ['generated', 'in_progress'])
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return filterTradeManagerTrades((data || []).map(mapTradeRow));
}

/** 문서관리는 submitted_at이 존재하는 최종 제출 거래만 조회합니다. */
export async function fetchSubmittedTrades(): Promise<SavedTrade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('status', 'submitted')
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return filterDocumentManagerTrades((data || []).map(mapTradeRow));
}

// [EDIT: Supabase Auth] RLS 정책에 따라 본인 trade만 삭제됩니다.
export async function deleteSavedTrade(id: string): Promise<void> {
  const userId = await getRequiredUserId();
  const { data: row, error: readError } = await supabase
    .from('trades')
    .select('form_data')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) return;

  const formData = row.form_data as Partial<TradeFormDataV3> | null;
  const attachments = Array.isArray(formData?.attachments)
    ? formData.attachments as TradeAttachment[]
    : [];
  await removeTradeAttachments(attachments);

  const { error } = await supabase
    .from('trades')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

// [EDIT: Supabase Auth] 로그인한 사용자에게 보이는 모든 trade를 삭제합니다.
export async function clearSavedTrades(): Promise<void> {
  // [EDIT: Document Management] 문서관리 화면에 보이는 최종 전송 거래만 전체 삭제 대상으로 삼습니다.
  const trades = await fetchSubmittedTrades();
  if (trades.length === 0) return;

  for (const trade of trades) {
    await deleteSavedTrade(trade.id);
  }
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
