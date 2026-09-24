/** 비회원(외부) 포워더에게 생성 문서를 이메일로 직접 전송하는 서비스. */
import { supabase } from '../lib/supabase';
import type { SavedTrade } from '../types';
import type {
  AttachableDocumentType,
  ExternalForwarderRequest,
  ExternalForwarderRequestStatus,
} from '../types/forwarderRequest';
import { buildInvoiceDocx } from './invoiceDocxService';
import { buildPackingListDocx } from './packingListDocxService';
import { buildBillOfLadingDocx } from './billOfLadingDocxService';
import { buildTransportRequestDocx } from './transportRequestDocxService';
import { portaiFileName, type PortaiDocumentKey } from '../utils/documentFileName';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface ExternalForwarderRequestRow {
  id: string;
  trade_id: string;
  requester_user_id: string;
  recipient_email: string;
  recipient_company: string | null;
  recipient_name: string | null;
  message: string | null;
  sent_document_types: string[] | null;
  status: ExternalForwarderRequestStatus;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  created_at: string;
}

function mapExternalRequestRow(row: ExternalForwarderRequestRow): ExternalForwarderRequest {
  return {
    id: row.id,
    tradeId: row.trade_id,
    requesterUserId: row.requester_user_id,
    recipientEmail: row.recipient_email,
    recipientCompany: row.recipient_company,
    recipientName: row.recipient_name,
    message: row.message,
    sentDocumentTypes: (row.sent_document_types ?? []) as AttachableDocumentType[],
    status: row.status,
    sentAt: row.sent_at,
    failedAt: row.failed_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

/** 이 거래에 실제로 생성된(선택 가능한) 문서 종류만 반환한다. 존재하지 않는 문서는 절대 포함하지 않는다. */
export function getAttachableDocumentTypes(trade: SavedTrade): AttachableDocumentType[] {
  const docs = trade.generatedDocs;
  const types: AttachableDocumentType[] = [];
  if (docs?.transportRequest) types.push('transport_request');
  if (docs?.invoice) types.push('invoice');
  if (docs?.packingList) types.push('packing_list');
  if (docs?.billOfLading) types.push('bill_of_lading');
  return types;
}

/** 화주 본인의 외부 이메일 발송 이력. tradeId를 주면 해당 거래로만 좁힌다. */
export async function listExternalForwarderRequests(tradeId?: string): Promise<ExternalForwarderRequest[]> {
  let query = supabase
    .from('external_forwarder_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (tradeId) query = query.eq('trade_id', tradeId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => mapExternalRequestRow(row as ExternalForwarderRequestRow));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('파일 변환에 실패했습니다.'));
    reader.readAsDataURL(blob);
  });
}

async function buildAttachment(
  type: AttachableDocumentType,
  trade: SavedTrade,
  fileName: string,
): Promise<{ document_type: AttachableDocumentType; file_name: string; mime_type: string; data_url: string }> {
  const docs = trade.generatedDocs;
  let blob: Blob;
  switch (type) {
    case 'transport_request':
      if (!docs?.transportRequest) throw new Error('운송의뢰서가 생성되지 않았습니다.');
      blob = await buildTransportRequestDocx(docs.transportRequest);
      break;
    case 'invoice':
      if (!docs?.invoice) throw new Error('Commercial Invoice가 생성되지 않았습니다.');
      blob = await buildInvoiceDocx(docs.invoice);
      break;
    case 'packing_list':
      if (!docs?.packingList) throw new Error('Packing List가 생성되지 않았습니다.');
      blob = await buildPackingListDocx(docs.packingList);
      break;
    case 'bill_of_lading':
      if (!docs?.billOfLading) throw new Error('B/L이 생성되지 않았습니다.');
      blob = await buildBillOfLadingDocx(docs.billOfLading);
      break;
  }
  const dataUrl = await blobToDataUrl(blob);
  return { document_type: type, file_name: fileName, mime_type: DOCX_MIME_TYPE, data_url: dataUrl };
}

// 첨부 파일 이름도 다운로드와 같은 규칙(PortAI_문서명_월.일.docx)을 쓴다.
const DOCUMENT_FILE_KEYS: Record<AttachableDocumentType, PortaiDocumentKey> = {
  transport_request: 'transport_request',
  invoice: 'invoice',
  packing_list: 'packing_list',
  bill_of_lading: 'bl',
};

export interface SendExternalForwarderEmailInput {
  trade: SavedTrade;
  recipientEmail: string;
  recipientCompany: string;
  recipientName: string;
  message: string;
  documentTypes: AttachableDocumentType[];
  /** 생략하면 기존 화주 → 외부 포워더 운송의뢰 메일이다. */
  deliveryKind?: 'shipment_notice' | 'shipping_advice';
}

/** 프론트에는 항상 이 고정 문구만 노출하고, 실제 오류는 서버 로그에서만 확인한다. */
const GENERIC_SEND_ERROR = '이메일 전송에 실패했습니다. 이메일 주소 또는 네트워크 상태를 확인한 후 다시 시도해 주세요.';

/** 선택된 문서를 즉석에서 재생성해 base64로 변환하고, Edge Function으로 전송한다. */
export async function sendExternalForwarderEmail(input: SendExternalForwarderEmailInput): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error('로그인이 필요합니다.');

  if (input.documentTypes.length === 0) {
    throw new Error('보낼 문서를 하나 이상 선택해 주세요.');
  }

  const documents = await Promise.all(
    input.documentTypes.map((type) => buildAttachment(type, input.trade, portaiFileName(DOCUMENT_FILE_KEYS[type], 'docx'))),
  );

  const { data, error } = await supabase.functions.invoke<{ ok: boolean }>('send-forwarder-request-email', {
    body: {
      trade_id: input.trade.id,
      recipient_email: input.recipientEmail.trim(),
      recipient_company: input.recipientCompany.trim(),
      recipient_name: input.recipientName.trim(),
      message: input.message.trim(),
      documents,
      ...(input.deliveryKind ? { delivery_kind: input.deliveryKind } : {}),
    },
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  });

  if (error || !data?.ok) {
    console.error('[externalForwarderEmailService] 이메일 전송 실패:', error);
    throw new Error(GENERIC_SEND_ERROR);
  }
}

/** 포워더가 완료된 수출 거래의 H/B/L을 화주 또는 해외 파트너에게 전달한다. */
export function sendForwarderDocumentEmail(
  input: SendExternalForwarderEmailInput & { deliveryKind: 'shipment_notice' | 'shipping_advice' },
): Promise<void> {
  return sendExternalForwarderEmail(input);
}
