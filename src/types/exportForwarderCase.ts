/**
 * 수출 포워더 업무 흐름(5단계) 중 기존 TradeProfile/폼 구조로 표현할 수 없는
 * "운영 상태"만 담는 최소 계약. trades.workflow_data.exportForwarderCase로 저장한다.
 *
 * 화물·당사자·부킹·B/L 발행정보 등 문서 내용은 기존 TradeProfile(forwarderForm)을
 * 그대로 쓰고, 여기서는 선적 진행상태·수입 Master B/L 번호·전달 이력처럼
 * 기존 필드로 표현할 수 없는 값만 최소로 추가한다.
 */

/** 선적 진행상태 — Booking 완료 → 화물 반입 → 수출통관 → 선적 → 출항 */
export type ExportProgressStageKey = 'booking' | 'cargoReceived' | 'customsCleared' | 'loaded' | 'departed';

export const EXPORT_PROGRESS_STAGE_ORDER: ExportProgressStageKey[] = [
  'booking',
  'cargoReceived',
  'customsCleared',
  'loaded',
  'departed',
];

export const EXPORT_PROGRESS_STAGE_LABEL: Record<ExportProgressStageKey, string> = {
  booking: 'Booking 완료',
  cargoReceived: '화물 반입',
  customsCleared: '수출통관',
  loaded: '선적',
  departed: '출항',
};

export type ExportProgressStatus = 'pending' | 'in_progress' | 'done';

export interface ExportForwarderCaseActivity {
  at: string;
  text: string;
}

/** trades.workflow_data.exportForwarderCase 로 저장되는 포워더 운영 상태 */
export interface ExportForwarderCaseState {
  /** 단계별 상태 — 값이 없으면 '대기'로 취급한다. */
  progress: Partial<Record<ExportProgressStageKey, ExportProgressStatus>>;
  /** 선사가 발행한 Master B/L 번호 — M/B/L은 PortAI가 생성하지 않고 등록만 한다. */
  masterBlNo?: string;
  shipperNotifiedAt?: string | null;
  shippingAdviceSentAt?: string | null;
  completedAt?: string | null;
  activity?: ExportForwarderCaseActivity[];
  updatedAt: string;
}
