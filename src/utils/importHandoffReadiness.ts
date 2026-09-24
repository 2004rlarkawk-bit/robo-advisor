/**
 * 포워더 전달 준비 상태 — "서류가 있는지"만 본다.
 *
 * 수출자→수입자 단계에서 서류에 오류가 있으면 애초에 물건이 넘어오지 않는다(현직자 피드백).
 * 그래서 수입 화주 단계에서 값 불일치를 다시 경고로 만들지 않는다. DRAFT B/L처럼
 * 정상 상태인 것도 경고가 아니다. 이 단계의 판단은 "필수 전달자료가 모였는가" 하나다.
 */
import type { ImportDocumentType, ImportExtractedFields } from '../types/importTrade';

/** 포워더·관세사에게 넘길 때 없으면 진행이 막히는 서류. */
export const HANDOFF_REQUIRED_DOCUMENTS: ImportDocumentType[] = [
  'commercial_invoice',
  'packing_list',
  'bill_of_lading',
];

export const HANDOFF_DOCUMENT_LABEL: Record<string, string> = {
  commercial_invoice: '상업송장(C/I)',
  packing_list: '포장명세서(P/L)',
  bill_of_lading: '선하증권(B/L)',
  certificate_of_origin: '원산지증명서(C/O)',
};

/** 신고 준비 정보 — 값이 비어 있으면 포워더가 신고를 시작할 수 없는 항목. */
const REQUIRED_FIELDS: { key: keyof ImportExtractedFields; label: string }[] = [
  { key: 'blNo', label: 'B/L 번호' },
  { key: 'productDescription', label: '품명' },
  { key: 'totalAmount', label: '금액' },
  { key: 'currency', label: '통화' },
];

export interface HandoffReadiness {
  /** 없어서 더 올려야 하는 서류 */
  missingDocuments: ImportDocumentType[];
  /** 비어 있는 신고 준비 정보 */
  missingFields: string[];
  /** 서류·정보가 모두 있으면 true */
  ready: boolean;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : value != null && value !== '';
}

export function evaluateHandoffReadiness(input: {
  documentTypes: ImportDocumentType[];
  fields?: ImportExtractedFields | null;
  /** 품목별 HSK 확정 여부 — 확정 전이면 신고 준비 정보가 덜 찬 것으로 본다. */
  confirmedHsCodes?: (string | undefined)[];
}): HandoffReadiness {
  const present = new Set(input.documentTypes);
  const missingDocuments = HANDOFF_REQUIRED_DOCUMENTS.filter((type) => !present.has(type));

  const missingFields: string[] = [];
  if (input.fields) {
    for (const field of REQUIRED_FIELDS) {
      if (!hasText(input.fields[field.key])) missingFields.push(field.label);
    }
  }
  const hsCodes = input.confirmedHsCodes;
  if (hsCodes && hsCodes.length > 0 && hsCodes.some((code) => !hasText(code))) {
    missingFields.push('품목별 HSK 확정');
  }

  return {
    missingDocuments,
    missingFields,
    ready: missingDocuments.length === 0 && missingFields.length === 0,
  };
}

export function handoffDocumentLabel(type: ImportDocumentType): string {
  return HANDOFF_DOCUMENT_LABEL[type] ?? type;
}
