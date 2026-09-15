import type { ImportDocumentMeta, ImportDocumentType } from '../types/importTrade';

/** 교차 검증에서 거래당 1부만 있어야 하는 서류 */
const SINGLE_COPY_TYPES: ImportDocumentType[] = [
  'commercial_invoice',
  'packing_list',
  'bill_of_lading',
  'certificate_of_origin',
  'insurance_policy',
];

const LABEL: Partial<Record<ImportDocumentType, string>> = {
  commercial_invoice: '상업송장(Commercial Invoice)',
  packing_list: '포장명세서(Packing List)',
  bill_of_lading: '선하증권(B/L)',
  certificate_of_origin: '원산지증명서(C/O)',
  insurance_policy: '적하보험증권',
};

export interface DuplicateImportDocument {
  type: ImportDocumentType;
  label: string;
  count: number;
}

/** 같은 종류가 2부 이상 올라온 서류 — 서류끼리 대조할 수 없으므로 분석 전에 막는다. */
export function findDuplicateImportDocuments(documents: Pick<ImportDocumentMeta, 'type'>[]): DuplicateImportDocument[] {
  return SINGLE_COPY_TYPES
    .map((type) => ({ type, label: LABEL[type] ?? type, count: documents.filter((document) => document.type === type).length }))
    .filter((entry) => entry.count > 1);
}

export function duplicateImportDocumentsMessage(duplicates: DuplicateImportDocument[]): string {
  if (duplicates.length === 0) return '';
  const list = duplicates.map((entry) => `${entry.label} ${entry.count}개`).join(', ');
  return `${list}가 올라가 있어 분석할 수 없습니다. 서류끼리 대조하려면 종류마다 1개만 필요하니, 중복된 파일은 삭제하고 다른 서류를 올려 주세요.`;
}
