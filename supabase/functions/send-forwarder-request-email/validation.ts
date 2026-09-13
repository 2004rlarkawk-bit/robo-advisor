// Pure validation logic for send-forwarder-request-email, split out from
// index.ts so it can be unit-tested with vitest (no Deno runtime required).

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const ATTACHABLE_DOCUMENT_TYPES = [
  'transport_request',
  'invoice',
  'packing_list',
  'bill_of_lading',
] as const;

export type AttachableDocumentType = (typeof ATTACHABLE_DOCUMENT_TYPES)[number];

/** trade.document_data.generatedDocuments 안에서 각 문서 타입이 실제로 있는지 확인할 키. */
export const DOCUMENT_TYPE_TO_GENERATED_KEY: Record<AttachableDocumentType, string> = {
  transport_request: 'transportRequest',
  invoice: 'invoice',
  packing_list: 'packingList',
  bill_of_lading: 'billOfLading',
};

export const MAX_DOCUMENTS = 4;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
export const MAX_RECIPIENT_TEXT_LENGTH = 200;
export const MAX_MESSAGE_LENGTH = 4000;

export interface RequestDocument {
  documentType: AttachableDocumentType;
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

export interface ParsedSendRequest {
  tradeId: string;
  recipientEmail: string;
  recipientCompany: string;
  recipientName: string;
  message: string;
  documents: RequestDocument[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** 요청 바디의 shape/형식만 검증한다 — 소유권·문서 실존 여부는 index.ts에서 DB 조회 후 별도로 확인한다. */
export function parseSendRequest(value: unknown): ParsedSendRequest {
  if (!isRecord(value)) throw new Error('요청 형식이 올바르지 않습니다.');

  const tradeId = cleanString(value.trade_id, 100);
  if (!tradeId || !isUuid(tradeId)) throw new Error('거래 정보가 올바르지 않습니다.');

  const recipientEmail = cleanString(value.recipient_email, MAX_RECIPIENT_TEXT_LENGTH).toLowerCase();
  if (!recipientEmail || !isValidEmail(recipientEmail)) throw new Error('포워더 이메일 주소가 올바르지 않습니다.');

  const recipientCompany = cleanString(value.recipient_company, MAX_RECIPIENT_TEXT_LENGTH);
  const recipientName = cleanString(value.recipient_name, MAX_RECIPIENT_TEXT_LENGTH);
  const message = cleanString(value.message, MAX_MESSAGE_LENGTH);

  const documents = parseDocuments(value.documents);

  return { tradeId, recipientEmail, recipientCompany, recipientName, message, documents };
}

function parseDocuments(value: unknown): RequestDocument[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DOCUMENTS) {
    throw new Error(`보낼 문서는 1개 이상 ${MAX_DOCUMENTS}개 이하로 선택해 주세요.`);
  }

  let totalBytes = 0;
  const seenTypes = new Set<string>();

  return value.map((item) => {
    if (!isRecord(item)) throw new Error('문서 데이터 형식이 올바르지 않습니다.');

    const documentType = cleanString(item.document_type, 50);
    if (!ATTACHABLE_DOCUMENT_TYPES.includes(documentType as AttachableDocumentType)) {
      throw new Error('지원하지 않는 문서 종류입니다.');
    }
    if (seenTypes.has(documentType)) throw new Error('같은 문서 종류가 중복되었습니다.');
    seenTypes.add(documentType);

    const fileName = cleanString(item.file_name, 255);
    if (!fileName) throw new Error('파일명이 없습니다.');

    const mimeType = cleanString(item.mime_type, 200).toLowerCase();
    if (mimeType !== DOCX_MIME_TYPE) throw new Error(`${fileName}은 지원하지 않는 파일 형식입니다.`);

    const dataUrl = typeof item.data_url === 'string' ? item.data_url : '';
    const prefix = `data:${mimeType};base64,`;
    if (!dataUrl.startsWith(prefix)) throw new Error(`${fileName}의 파일 데이터가 올바르지 않습니다.`);

    const base64 = dataUrl.slice(prefix.length);
    if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new Error(`${fileName}의 파일 데이터가 올바르지 않습니다.`);
    }

    const approximateBytes = Math.floor(base64.length * 0.75);
    if (approximateBytes > MAX_FILE_BYTES) throw new Error(`${fileName}의 용량이 너무 큽니다.`);
    totalBytes += approximateBytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('첨부파일 전체 용량이 너무 큽니다.');

    return {
      documentType: documentType as AttachableDocumentType,
      fileName,
      mimeType,
      dataUrl,
    };
  });
}

/**
 * 요청된 각 문서 타입이 서버에서 조회한 실제 거래의 generatedDocuments에 존재하는지 확인한다.
 * 클라이언트가 무엇을 보냈다고 주장하는지가 아니라, DB에 저장된 문서 존재 여부만 신뢰한다.
 */
export function findMissingDocumentTypes(
  documents: RequestDocument[],
  generatedDocuments: Record<string, unknown> | null | undefined,
): AttachableDocumentType[] {
  const missing: AttachableDocumentType[] = [];
  for (const document of documents) {
    const key = DOCUMENT_TYPE_TO_GENERATED_KEY[document.documentType];
    if (!generatedDocuments || generatedDocuments[key] == null) {
      missing.push(document.documentType);
    }
  }
  return missing;
}
