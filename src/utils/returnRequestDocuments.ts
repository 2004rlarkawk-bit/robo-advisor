/**
 * 기존 서류 단위 보완 요청의 문서명·문구 도우미.
 * 저장된 과거 요청을 계속 읽을 수 있도록 유지한다. 새 서술식 요청은 별도 자동 연결 흐름을 쓴다.
 */
import type { ImportDocumentType } from '../types/importTrade';

export type ReturnRequestDocumentType = Extract<
  ImportDocumentType,
  'commercial_invoice' | 'packing_list' | 'bill_of_lading' | 'certificate_of_origin' | 'other'
>;

export const RETURN_REQUEST_DOCUMENTS: { type: ReturnRequestDocumentType; label: string }[] = [
  { type: 'commercial_invoice', label: '상업송장(C/I)' },
  { type: 'packing_list', label: '포장명세서(P/L)' },
  { type: 'bill_of_lading', label: '선하증권(B/L)' },
  { type: 'certificate_of_origin', label: '원산지증명서(C/O)' },
  { type: 'other', label: '기타 서류' },
];

export type ReturnRequestReason = 'missing' | 'unreadable' | 'reissue' | 'check';

export const RETURN_REQUEST_REASONS: Record<ReturnRequestReason, { label: string; sentence: string }> = {
  missing: { label: '서류 누락', sentence: '첨부된 파일이 없습니다. 서류를 올려 주세요.' },
  unreadable: { label: '판독 어려움', sentence: '스캔 상태가 흐려 내용을 확인하기 어렵습니다. 선명한 파일로 다시 올려 주세요.' },
  reissue: { label: '원본·재발행 필요', sentence: '현재 파일로는 신고에 사용할 수 없습니다. 원본이나 재발행본을 보내 주세요.' },
  check: { label: '내용 확인 필요', sentence: '기재 내용 확인이 필요합니다. 전달 메모를 참고해 수정해 주세요.' },
};

export const RETURN_REQUEST_REASON_ORDER: ReturnRequestReason[] = ['missing', 'unreadable', 'reissue', 'check'];

export interface ReturnRequestItem {
  type: ReturnRequestDocumentType;
  reason: ReturnRequestReason;
}

const LABEL_BY_TYPE = new Map<string, string>(RETURN_REQUEST_DOCUMENTS.map((doc) => [doc.type, doc.label]));

export function returnRequestDocumentLabel(type: string): string {
  return LABEL_BY_TYPE.get(type) ?? type;
}

/** 요청 줄 순서를 화면의 서류 순서(C/I → P/L → B/L → C/O → 기타)로 맞춘다. */
function sortItems(items: ReturnRequestItem[]): ReturnRequestItem[] {
  const order = RETURN_REQUEST_DOCUMENTS.map((doc) => doc.type);
  return [...items].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

/**
 * 요청문 본문. 서류마다 한 줄씩 사유를 적고, 메모는 '(추가 안내)'로 덧붙인다.
 * 인사말·서명은 buildReturnRequestLetter가 감싼다.
 */
export function buildReturnRequestBody(items: ReturnRequestItem[], memo = ''): string {
  const lines = sortItems(items).map((item) => {
    const reason = RETURN_REQUEST_REASONS[item.reason];
    return `• ${returnRequestDocumentLabel(item.type)} · ${reason.label} — ${reason.sentence}`;
  });
  const note = memo.trim();
  return [
    ...(lines.length ? ['[반드시 수정]', ...lines] : []),
    ...(note ? [`(추가 안내) ${note}`] : []),
  ].join('\n');
}

/** 화주 화면의 서류 칩 — 서류 단위로 저장된 요청이면 그것을, 예전 요청이면 이슈 제목을 쓴다. */
export function returnRequestChips(request: { documentTypes?: string[]; issueTitles?: string[] }): string[] {
  if (request.documentTypes?.length) {
    const order = RETURN_REQUEST_DOCUMENTS.map((doc) => doc.type as string);
    return [...request.documentTypes]
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map(returnRequestDocumentLabel);
  }
  return request.issueTitles?.filter(Boolean) ?? [];
}
