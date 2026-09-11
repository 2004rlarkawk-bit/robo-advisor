/**
 * SavedTrade → ForwarderImportCase 어댑터와 포워더 운영 상태 저장.
 *
 * 유입 규칙(1차: 같은 계정 내 역할 전환 데모 기준):
 *  - 화주(shipper)가 최종 제출한 수입 거래  → origin 'shipper_request' (의뢰 수신)
 *  - 포워더(forwarder)가 직접 등록한 수입 거래 → origin 'direct_upload'
 * 운영 상태(stage·이슈 확인·A/N)는 trades.workflow_data.forwarderCase에만 기록하고
 * 화주 측 거래 데이터(status, snapshot)는 건드리지 않는다.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { SavedTrade } from '../types';
import type { ImportRisk, ImportTradeSnapshot, ImportValidation } from '../types/importTrade';
import type { TradeWorkflowData } from '../types/tradeFormData';
import {
  FORWARDER_STAGE_ORDER,
  type ForwarderCaseIssue,
  type ForwarderCaseStage,
  type ForwarderCaseState,
  type ForwarderImportCase,
} from '../types/forwarderCase';
import { fetchSavedTrades } from './storageService';
import { firstDocumentValue, forwarderDateKey } from '../utils/forwarderPresentation';

// 검증 결과의 field는 영문 키(grossWeight 등)로 오는 경우가 있어 화면용 한글 라벨로 바꾼다.
const ISSUE_FIELD_LABELS: Record<string, string> = {
  grossWeight: '총중량',
  netWeight: '순중량',
  productDescription: '품목 설명',
  quantity: '수량',
  totalAmount: '총 금액',
  unitPrice: '단가',
  currency: '통화',
  importer: '수입자',
  consignee: '수하인',
  shipper: '송하인',
  notifyParty: '통지처',
  blNo: 'B/L 번호',
  invoiceNo: '송장 번호',
  hsCode: 'HS코드',
  loadPort: '선적항',
  dischargePort: '도착항',
  incoterms: '인코텀즈',
  packageCount: '포장 수량',
  originCountry: '원산지',
  vesselName: '선박명',
};

function issueTitleOf(field: string): string {
  return ISSUE_FIELD_LABELS[field] ?? field;
}

function validationToIssue(validation: ImportValidation, resolutions: Record<string, boolean>): ForwarderCaseIssue {
  const id = `v-${validation.id}`;
  return {
    id,
    severity: validation.severity === 'error' ? 'blocker' : validation.severity === 'warning' ? 'check' : 'info',
    title: issueTitleOf(validation.field),
    detail: validation.message,
    documents: validation.documents,
    resolved: resolutions[id] === true,
  };
}

function riskToIssue(risk: ImportRisk, resolutions: Record<string, boolean>): ForwarderCaseIssue {
  const id = `r-${risk.id}`;
  return {
    id,
    severity: risk.level === 'high' ? 'blocker' : risk.level === 'info' ? 'info' : 'check',
    title: risk.item,
    detail: risk.cause,
    documents: risk.relatedDocuments,
    // 리스크 자체의 확인 상태(구 플로우)와 워크스페이스 체크를 모두 인정
    resolved: resolutions[id] ?? risk.status === 'resolved',
  };
}

function deriveIssues(snapshot: ImportTradeSnapshot, state: ForwarderCaseState | null): ForwarderCaseIssue[] {
  const resolutions = state?.issueResolutions ?? {};
  return [
    ...snapshot.analysis.validations.map((validation) => validationToIssue(validation, resolutions)),
    ...snapshot.risks.map((risk) => riskToIssue(risk, resolutions)),
  ].map((issue) => {
    const note = state?.issueNotes?.[issue.id];
    return note && note.issueDetail !== issue.detail ? { ...issue, resolved: false } : issue;
  });
}

function deriveStage(trade: SavedTrade, state: ForwarderCaseState | null): ForwarderCaseStage {
  if (state?.stage) return state.stage;
  // 구 포워더 플로우로 저장된 거래의 상태를 새 단계로 이월
  if (trade.tradeRole === 'forwarder') {
    if (trade.status === 'submitted') return 'done';
    if (trade.status === 'in_progress') return 'clearance';
  }
  return 'received';
}

function deriveNextAction(
  stage: ForwarderCaseStage,
  blockerCount: number,
  hasArrivalNotice: boolean,
  state: ForwarderCaseState | null,
  shipperEditing: boolean,
): string {
  const returnRequest = state?.returnRequest;
  if (returnRequest) {
    if (returnRequest.resolvedAt) return '화주 재제출 확인 — 재검토 시작';
    return shipperEditing ? '화주 수정 중 — 재제출 대기' : '화주 보완 회신 대기';
  }
  switch (stage) {
    case 'received':
      return '서류 대사 결과 확인';
    case 'review':
      return blockerCount > 0 ? `차단 이슈 ${blockerCount}건 해결` : '검토 완료 — 통관 진행으로 이동';
    case 'clearance':
      return hasArrivalNotice ? '통관 진행 확인 후 완료 처리' : '도착통지서(A/N) 첨부';
    case 'done':
      return '완료';
  }
}

/** 수입 거래 한 건을 포워더 업무 건으로 변환한다. 대상이 아니면 null. */
export function deriveForwarderCase(trade: SavedTrade): ForwarderImportCase | null {
  const snapshot = trade.generatedDocs?.importTrade as ImportTradeSnapshot | undefined;
  if ((trade.tradeDirection ?? trade.profile.tradeType) !== 'import' || !snapshot) return null;

  const role = trade.tradeRole ?? snapshot.role;
  if (role !== 'shipper' && role !== 'forwarder') return null;

  const state = (trade.forwarderCase as ForwarderCaseState | null) ?? null;
  const returnRequest = state?.returnRequest ?? null;
  // 화주 거래는 최종 제출된 것만 '의뢰 수신'으로 들어온다(작성 중인 거래는 화주 소관).
  // 단 보완 요청으로 화주가 다시 열어 수정 중인 건은 '화주 수정 중'으로 큐에 남긴다.
  const shipperEditing = role === 'shipper' && trade.status !== 'submitted';
  if (shipperEditing && !(returnRequest && !returnRequest.resolvedAt)) return null;

  const issues = deriveIssues(snapshot, state);
  const blockerCount = issues.filter((issue) => issue.severity === 'blocker' && !issue.resolved).length;
  const checkCount = issues.filter((issue) => issue.severity === 'check' && !issue.resolved).length;
  const stage = deriveStage(trade, state);
  const arrivalNotice = state?.arrivalNotice ?? snapshot.arrivalNotice ?? null;
  const extracted = snapshot.analysis.extracted;

  return {
    tradeId: trade.id,
    origin: role === 'shipper' ? 'shipper_request' : 'direct_upload',
    importer: firstDocumentValue(extracted.importer, extracted.importerDetails?.name, trade.profile.companyName) || '수입자 미등록',
    shipperName: extracted.exporterDetails?.name || extracted.shipper || trade.profile.partnerName || '-',
    blNo: extracted.blNo || trade.profile.blNo || '-',
    vesselName: extracted.vesselName || trade.profile.vesselOrFlight || '',
    eta: extracted.estimatedArrivalDate || trade.profile.arrivalDate || '',
    stage,
    issues,
    blockerCount,
    checkCount,
    nextAction: deriveNextAction(stage, blockerCount, Boolean(arrivalNotice?.storagePath), state, shipperEditing),
    requestedAt: trade.submittedAt ?? trade.createdAt,
    updatedAt: state?.updatedAt ?? trade.updatedAt ?? trade.createdAt,
    arrivalNotice,
    returnRequest,
    shipperEditing,
    snapshot,
    trade,
  };
}

/** 업무 큐 정렬: 미해결 차단 건을 최우선으로, 이어 업무 단계·ETA 순으로 배치한다. */
export function sortForwarderCases(cases: ForwarderImportCase[]): ForwarderImportCase[] {
  return [...cases].sort((a, b) => {
    const doneDiff = Number(a.stage === 'done') - Number(b.stage === 'done');
    if (doneDiff !== 0) return doneDiff;
    const blockerDiff = Number(b.blockerCount > 0) - Number(a.blockerCount > 0);
    if (blockerDiff !== 0) return blockerDiff;
    const stageDiff = FORWARDER_STAGE_ORDER.indexOf(a.stage) - FORWARDER_STAGE_ORDER.indexOf(b.stage);
    if (stageDiff !== 0) return stageDiff;
    const etaDiff = (forwarderDateKey(a.eta) ?? '9999').localeCompare(forwarderDateKey(b.eta) ?? '9999');
    if (etaDiff !== 0) return etaDiff;
    return b.requestedAt.localeCompare(a.requestedAt);
  });
}

/** 화주 관점: 포워더 보완 요청이 걸려 있어 조치가 필요한 거래인지 */
export function hasActiveShipperReturnRequest(trade: SavedTrade): boolean {
  if ((trade.tradeDirection ?? trade.profile.tradeType) !== 'import') return false;
  if (trade.tradeRole === 'forwarder') return false;
  const state = (trade.forwarderCase as ForwarderCaseState | null) ?? null;
  return Boolean(state?.returnRequest && !state.returnRequest.resolvedAt);
}

/** 화주에게 도착한 보완 요청 수 — 사이드바 알림 배지·상단 알림 바에 쓴다. */
export async function countShipperReturnRequests(): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    const trades = await fetchSavedTrades('submitted');
    return trades.filter(hasActiveShipperReturnRequest).length;
  } catch (err) {
    console.warn('보완 요청 수 조회 실패:', err);
    return 0;
  }
}

/** 포워더 업무 큐 목록 조회 */
export async function listForwarderCases(): Promise<ForwarderImportCase[]> {
  if (!isSupabaseConfigured) return [];
  const trades = await fetchSavedTrades();
  const cases = trades
    .map(deriveForwarderCase)
    .filter((item): item is ForwarderImportCase => item !== null);
  return sortForwarderCases(cases);
}

/** 포워더 운영 상태 저장 — workflow_data.forwarderCase만 병합 갱신한다. */
export async function saveForwarderCaseState(
  tradeId: string,
  patch: Partial<Omit<ForwarderCaseState, 'updatedAt'>>,
): Promise<ForwarderCaseState> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');

  const { data: row, error: readError } = await supabase
    .from('trades')
    .select('workflow_data')
    .eq('id', tradeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error('수정할 수입 건을 찾지 못했습니다.');

  const workflowData = (row.workflow_data ?? {}) as TradeWorkflowData;
  const previous = workflowData.forwarderCase;
  const next: ForwarderCaseState = {
    ...previous,
    stage: patch.stage ?? previous?.stage ?? 'received',
    issueResolutions: { ...(previous?.issueResolutions ?? {}), ...(patch.issueResolutions ?? {}) },
    issueNotes: { ...(previous?.issueNotes ?? {}), ...(patch.issueNotes ?? {}) },
    completion: patch.completion !== undefined ? patch.completion : previous?.completion ?? null,
    arrivalNotice: patch.arrivalNotice !== undefined ? patch.arrivalNotice : previous?.arrivalNotice ?? null,
    returnRequest: patch.returnRequest !== undefined ? patch.returnRequest : previous?.returnRequest ?? null,
    updatedAt: new Date().toISOString(),
  };

  const { error: writeError } = await supabase
    .from('trades')
    .update({ workflow_data: { ...workflowData, forwarderCase: next } })
    .eq('id', tradeId)
    .eq('user_id', userId);
  if (writeError) throw writeError;
  return next;
}
