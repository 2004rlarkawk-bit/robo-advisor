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
import { cleanRiskTitle } from '../utils/riskDisplay';

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
    // 옛 결과의 규칙 번호(IR8. 등)는 떼고 보여준다. 관련 서류(documents)는 id 매칭에 쓰이므로 그대로 둔다.
    title: cleanRiskTitle(risk.item),
    detail: risk.cause,
    // 무엇이 어떻게 다른지 — 화주가 저장한 판정값을 그대로 보여준다(포워더 쪽에서 다시 계산하지 않는다).
    values: risk.differentValues?.length ? risk.differentValues : undefined,
    documents: risk.relatedDocuments,
    // 리스크 자체의 확인 상태(구 플로우)와 워크스페이스 체크를 모두 인정
    resolved: resolutions[id] === true || risk.status === 'resolved',
  };
}

function deriveIssues(snapshot: ImportTradeSnapshot, state: ForwarderCaseState | null): ForwarderCaseIssue[] {
  const resolutions = state?.issueResolutions ?? {};
  return [
    ...snapshot.analysis.validations.map((validation) => validationToIssue(validation, resolutions)),
    ...snapshot.risks.map((risk) => riskToIssue(risk, resolutions)),
  ];
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
    if (returnRequest.resolvedAt) return '재검토 필요 — 수정본 확인';
    return shipperEditing ? '화주 수정 중 — 재제출 대기' : '화주 보완 대기';
  }
  // 화면의 '다음 할 일'은 forwarderInbox.getInboxState가 담당한다 — 여기 문구는
  // nextAction 필드를 소비하는 코드가 다시 생겼을 때를 대비해 새 흐름 기준으로 유지한다.
  switch (stage) {
    case 'received':
      return '제출 서류·추출 정보 확인';
    case 'review':
      return blockerCount > 0 ? `확인 필요 ${blockerCount}건 검토` : '신고자료 준비';
    case 'clearance':
      return hasArrivalNotice ? '신고·D/O 진행 기록 후 완료 처리' : '신고·D/O 진행 기록';
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
    importer: extracted.importer || trade.profile.companyName || '-',
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
    issueNotes: state?.issueNotes ?? {},
    activity: state?.activity ?? [],
    snapshot,
    trade,
  };
}

/** 업무 큐 정렬: 미해결 차단 건을 최우선으로, 이어 업무 단계·ETA 순으로 배치한다. */
export function sortForwarderCases(cases: ForwarderImportCase[]): ForwarderImportCase[] {
  return [...cases].sort((a, b) => {
    const blockerDiff = Number(b.blockerCount > 0) - Number(a.blockerCount > 0);
    if (blockerDiff !== 0) return blockerDiff;
    const stageDiff = FORWARDER_STAGE_ORDER.indexOf(a.stage) - FORWARDER_STAGE_ORDER.indexOf(b.stage);
    if (stageDiff !== 0) return stageDiff;
    if (a.eta !== b.eta) return (a.eta || '9999').localeCompare(b.eta || '9999');
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

export interface ForwarderQueueOptions {
  /**
   * 겸용(integrated) 계정 예외 — 자기 계정의 화주 제출 건을 별도 의뢰·지정 없이
   * 큐에 그대로 표시한다(한 계정으로 화주↔포워더를 오가는 시연용).
   * 순수 포워더 계정은 false: 나에게 지정된 의뢰와 직접 등록 건만 보인다.
   */
  includeOwnShipperTrades?: boolean;
}

/**
 * 포워더 업무 큐 목록 조회.
 * RLS가 "내 거래 + forwarder_user_id가 나인 거래"를 돌려주므로, 여기서는
 * 정식 진입 경로만 남긴다: ① 나에게 지정된 의뢰 ② 내가 직접 등록한 건
 * ③ (겸용 계정 예외) 내 화주 제출 건.
 */
export async function listForwarderCases(options: ForwarderQueueOptions = {}): Promise<ForwarderImportCase[]> {
  if (!isSupabaseConfigured) return [];
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData?.user?.id ?? null;
  const trades = await fetchSavedTrades();
  const visible = trades.filter((trade) => {
    if (myId && trade.forwarderUserId === myId) return true;
    if (trade.tradeRole === 'forwarder') return true;
    return options.includeOwnShipperTrades ?? false;
  });
  const cases = visible
    .map(deriveForwarderCase)
    .filter((item): item is ForwarderImportCase => item !== null);
  return sortForwarderCases(cases);
}

/** 포워더 운영 상태 저장 — workflow_data.forwarderCase만 병합 갱신한다. */
export async function saveForwarderCaseState(
  tradeId: string,
  patch: Partial<Omit<ForwarderCaseState, 'updatedAt' | 'activity'>>,
  /** 처리 이력에 덧붙일 문장들 — 판단·요청·단계 이동이 기록으로 남는다 */
  appendActivity: string[] = [],
): Promise<ForwarderCaseState> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user?.id) throw new Error('로그인이 필요합니다.');

  // user_id가 아니라 RLS(소유자 또는 배정된 포워더)에 조회 범위를 맡긴다 —
  // 배정된 포워더 계정도 자신의 작업 상태를 저장할 수 있어야 하기 때문이다.
  const { data: row, error: readError } = await supabase
    .from('trades')
    .select('workflow_data')
    .eq('id', tradeId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error('수정할 수입 건을 찾지 못했습니다.');

  const workflowData = (row.workflow_data ?? {}) as TradeWorkflowData;
  const previous = workflowData.forwarderCase;
  const now = new Date().toISOString();
  const next: ForwarderCaseState = {
    ...previous,
    stage: patch.stage ?? previous?.stage ?? 'received',
    issueResolutions: { ...(previous?.issueResolutions ?? {}), ...(patch.issueResolutions ?? {}) },
    issueNotes: { ...(previous?.issueNotes ?? {}), ...(patch.issueNotes ?? {}) },
    arrivalNotice: patch.arrivalNotice !== undefined ? patch.arrivalNotice : previous?.arrivalNotice ?? null,
    returnRequest: patch.returnRequest !== undefined ? patch.returnRequest : previous?.returnRequest ?? null,
    importOperations: patch.importOperations ?? previous?.importOperations,
    activity: [
      ...(previous?.activity ?? []),
      ...appendActivity.map((text) => ({ at: now, text })),
    ],
    updatedAt: now,
  };

  const { error: writeError } = await supabase
    .from('trades')
    .update({ workflow_data: { ...workflowData, forwarderCase: next } })
    .eq('id', tradeId);
  if (writeError) throw writeError;
  return next;
}

/** 화주가 보완 요청에 회신 메모를 남긴다 — 요청과 회신이 같은 의뢰에 모인다. */
export async function saveShipperReturnReply(tradeId: string, reply: string): Promise<void> {
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
  const workflowData = (row?.workflow_data ?? {}) as TradeWorkflowData;
  const previous = workflowData.forwarderCase;
  if (!previous?.returnRequest) return;

  const now = new Date().toISOString();
  const next: ForwarderCaseState = {
    ...previous,
    returnRequest: { ...previous.returnRequest, shipperReply: reply.trim(), shipperReplyAt: now },
    activity: [...(previous.activity ?? []), { at: now, text: `화주 회신: ${reply.trim()}` }],
    updatedAt: now,
  };
  const { error: writeError } = await supabase
    .from('trades')
    .update({ workflow_data: { ...workflowData, forwarderCase: next } })
    .eq('id', tradeId)
    .eq('user_id', userId);
  if (writeError) throw writeError;
}
