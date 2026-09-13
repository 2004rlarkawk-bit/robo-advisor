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
  | 'trade_request_rejected';

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

export interface ForwarderLookupResult {
  id: string;
  companyName: string | null;
  contactName: string | null;
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
