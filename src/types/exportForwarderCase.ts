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

/**
 * 외부 채널(선사 홈페이지·메일·전화)에서 확정된 부킹을 PortAI에 등록한 값 중
 * 기존 TradeProfile 필드로 표현할 수 없는 항목만 담는다.
 * Booking No.·선박·항차·POL/POD·ETD/ETA·컨테이너는 TradeProfile에 이미 있으므로 여기 두지 않는다.
 */
export interface ExportBookingDetails {
  /** 서류 마감 */
  cargoClosingDate?: string;
  /** CY 반입 마감 — 없는 경우도 있다 */
  cyClosingDate?: string;
  /** 선사와 합의된 운임 지급조건 — H/B/L 운임조건이 비어 있을 때만 채운다 */
  freightTerms?: '' | 'PREPAID' | 'COLLECT';
  remarks?: string;
  /** 부킹 완료 처리(=외부 확정 부킹 등록) 시각 */
  confirmedAt?: string | null;
}

/** trades.workflow_data.exportForwarderCase 로 저장되는 포워더 운영 상태 */
export interface ExportForwarderCaseState {
  /** 단계별 상태 — 값이 없으면 '대기'로 취급한다. */
  progress: Partial<Record<ExportProgressStageKey, ExportProgressStatus>>;
  /** 선사가 발행한 Master B/L 번호 — M/B/L은 PortAI가 생성하지 않고 등록만 한다. */
  masterBlNo?: string;
  /** 선사에서 확정받아 등록한 부킹 부가정보 */
  booking?: ExportBookingDetails;
  shipperNotifiedAt?: string | null;
  shippingAdviceSentAt?: string | null;
  completedAt?: string | null;
  activity?: ExportForwarderCaseActivity[];
  updatedAt: string;
}
