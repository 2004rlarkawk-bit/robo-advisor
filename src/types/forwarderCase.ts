/**
 * 포워더 수입 건(ForwarderImportCase) 데이터 계약.
 *
 * 포워더 화면은 화주의 "한 건 작성" 위저드가 아니라 "여러 건 운영" 업무 큐이므로,
 * 숫자 step 대신 업무 단계(stage)·이슈 등급·다음 조치를 1급 개념으로 둔다.
 * 기존 거래(SavedTrade + ImportTradeSnapshot)는 어댑터(forwarderCaseService)가
 * 이 계약으로 변환하며, 포워더의 운영 상태는 trades.workflow_data.forwarderCase에
 * ForwarderCaseState로 저장한다.
 */
import type { ArrivalNoticeMeta, ImportTradeSnapshot } from './importTrade';
import type { SavedTrade } from '../types';

/** 업무 단계 — Pre-alert 접수 → 서류 대사·보완 → 통관·도착 관리 → 반출·완료 */
export type ForwarderCaseStage = 'received' | 'review' | 'clearance' | 'done';

export const FORWARDER_STAGE_ORDER: ForwarderCaseStage[] = ['received', 'review', 'clearance', 'done'];

export const FORWARDER_STAGE_LABEL: Record<ForwarderCaseStage, string> = {
  received: '의뢰 접수',
  review: '서류 검토',
  clearance: '통관·도착',
  done: '완료',
};

/** 유입 경로 — 화주가 전송한 의뢰가 1순위, 직접 등록은 fallback */
export type ForwarderCaseOrigin = 'shipper_request' | 'direct_upload';

/** 이슈 등급 — 업무 차단 / 확인 필요 / 참고 */
export type ForwarderIssueSeverity = 'blocker' | 'check' | 'info';

export interface ForwarderCaseIssue {
  id: string;
  severity: ForwarderIssueSeverity;
  title: string;
  detail: string;
  documents: string[];
  resolved: boolean;
}

/** 포워더 → 화주 보완 요청(반송). 화주가 수정·재제출하면 resolvedAt이 기록된다. */
export interface ForwarderReturnRequest {
  reason: string;
  /** 요청 근거가 된 이슈 제목들 (화주에게 그대로 보여준다) */
  issueTitles: string[];
  requestedAt: string;
  resolvedAt?: string;
}

/** trades.workflow_data.forwarderCase 로 저장되는 포워더 운영 상태 */
export interface ForwarderCaseState {
  stage: ForwarderCaseStage;
  /** 이슈 id → 확인 완료 여부 (포워더가 건별로 체크) */
  issueResolutions?: Record<string, boolean>;
  issueNotes?: Record<string, { note: string; confirmedAt: string; issueDetail: string }>;
  completion?: {
    confirmedAt: string;
    confirmedBy: string;
    customsReference: string;
    releasedOn: string;
  } | null;
  arrivalNotice?: ArrivalNoticeMeta | null;
  returnRequest?: ForwarderReturnRequest | null;
  updatedAt: string;
}

export interface ForwarderImportCase {
  tradeId: string;
  origin: ForwarderCaseOrigin;
  importer: string;
  shipperName: string;
  blNo: string;
  vesselName: string;
  eta: string;
  stage: ForwarderCaseStage;
  issues: ForwarderCaseIssue[];
  /** 미해결 차단 이슈 수 — 목록의 '차단 이슈' 컬럼 */
  blockerCount: number;
  /** 미해결 확인 필요 이슈 수 */
  checkCount: number;
  /** '다음 해야 할 일' 한 줄 — 목록·상세 공통 */
  nextAction: string;
  requestedAt: string;
  updatedAt: string;
  arrivalNotice: ArrivalNoticeMeta | null;
  returnRequest: ForwarderReturnRequest | null;
  /** 보완 요청 후 화주가 거래를 다시 열어 수정하고 있는 상태 */
  shipperEditing: boolean;
  snapshot: ImportTradeSnapshot;
  trade: SavedTrade;
}
