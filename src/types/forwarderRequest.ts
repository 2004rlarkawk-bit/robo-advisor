/** 화주 → 포워더 의뢰 요청 기능(회원/비회원 공용) 타입 정의. */

export type TradeRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface TradeRequest {
  id: string;
  tradeId: string;
  requesterUserId: string;
  receiverUserId: string;
  status: TradeRequestStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
}

export type ExternalForwarderRequestStatus = 'pending' | 'sent' | 'failed';

export interface ExternalForwarderRequest {
  id: string;
  tradeId: string;
  requesterUserId: string;
  recipientEmail: string;
  recipientCompany: string | null;
  recipientName: string | null;
  message: string | null;
  sentDocumentTypes: AttachableDocumentType[];
  status: ExternalForwarderRequestStatus;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export type NotificationType =
  | 'trade_request_received'
  | 'trade_request_accepted'
  | 'trade_request_rejected'
  | 'trade_return_requested'
  | 'trade_return_replied'
  | 'trade_forwarder_completed'
  | 'trade_message_received';

export interface NotificationRecord {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  tradeRequestId: string | null;
  tradeId: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

/** 의뢰별 대화 메시지 종류 — 일반 대화 / 보완 요청 / 보완 회신. */
export type TradeMessageKind = 'message' | 'return_request' | 'return_reply';

/** 의뢰(trade_request) 한 건에 매달린 화주↔포워더 대화 한 줄. */
export interface TradeMessage {
  id: string;
  tradeRequestId: string;
  tradeId: string;
  senderUserId: string;
  senderRole?: 'shipper' | 'forwarder' | null;
  kind: TradeMessageKind;
  body: string;
  createdAt: string;
  /** 받는 쪽이 읽은 시각. 보낸 쪽 화면에서는 "읽음" 표시에 쓴다. */
  readAt: string | null;
}

export interface ForwarderLookupResult {
  id: string;
  companyName: string | null;
  contactName: string | null;
}

/** 거래 조건으로 자동 배정된 담당자 후보 — 이메일·연락처는 받지 않는다. */
export interface ForwarderMatchCandidate {
  id: string;
  companyName: string | null;
  contactName: string | null;
  /** 담당자가 프로필에 등록한 특화 분야 전체 */
  specialties: string[];
  /** 그중 이번 거래 조건과 겹친 것 */
  matchedSpecialties: string[];
  activeCount: number;
  completedCount: number;
  /** PortAI와 제휴(MOU)한 포워더 담당자 — 추천 목록에서 먼저 보여준다. */
  isPartner: boolean;
  /** 제휴사명이 담당자 프로필의 업체명과 다를 때만 채워진다. */
  partnerCompanyName: string | null;
}

export interface TradeRequestPreview {
  requestId: string;
  status: TradeRequestStatus;
  message: string | null;
  createdAt: string;
  requesterCompany: string | null;
  requesterContact: string | null;
  direction: 'export' | 'import';
  loadPort: string | null;
  dischargePort: string | null;
  itemName: string | null;
}

/** 실제 생성 로직이 존재하는 첨부 가능 문서 유형만 (Certificate of Origin은 파일 생성기가 없어 제외). */
export type AttachableDocumentType = 'transport_request' | 'invoice' | 'packing_list' | 'bill_of_lading';

export const ATTACHABLE_DOCUMENT_LABELS: Record<AttachableDocumentType, string> = {
  transport_request: '운송의뢰서',
  invoice: 'Commercial Invoice',
  packing_list: 'Packing List',
  bill_of_lading: 'B/L',
};
