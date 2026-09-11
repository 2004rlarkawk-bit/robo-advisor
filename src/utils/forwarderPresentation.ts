import type { ImportComparisonRow } from '../types/importTrade';

export function hasDocumentValue(value?: string): boolean {
  return Boolean(value?.trim() && !/^(?:[-–—]+|n\/?a|null|undefined|미기재|미확인|없음)$/i.test(value.trim()));
}

export function firstDocumentValue(...values: Array<string | undefined>): string {
  return values.find(hasDocumentValue)?.trim() ?? '';
}

/** Parse explicit calendar dates only. Never guess a year or truncate an OCR date. */
export function forwarderDateKey(value: string): string | null {
  const text = value.trim();
  const numeric = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/);
  const named = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if (!numeric && !named) return null;
  const year = Number(numeric?.[1] ?? named?.[3]);
  const month = numeric ? Number(numeric[2]) : months.indexOf(named![1].slice(0, 3).toLowerCase()) + 1;
  const day = Number(numeric?.[3] ?? named?.[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatForwarderDate(value?: string): string {
  return value && hasDocumentValue(value) ? forwarderDateKey(value) ?? value.trim() : '미등록';
}

export const IMPORT_FIELD_LABELS: Record<string, string> = {
  invoiceNo: '송장 번호', productDescription: '품목·규격', quantity: '수량',
  consignee: '수하인', importer: '수입자', shipper: '송하인', notifyParty: '통지처',
  packages: '포장 수량', packageCount: '포장 수량', totalPackageCount: '포장 수량',
  grossWeight: '총중량', netWeight: '순중량', currency: '통화', totalAmount: '총금액',
  unitPrice: '단가', originCountry: '원산지', containerNo: '컨테이너 번호', sealNo: '봉인 번호',
  hsCode: 'HS 코드', blNo: 'B/L 번호', vesselName: '선박명', voyageNo: '항차',
  loadPort: '선적항', dischargePort: '도착항', incoterms: '인코텀즈',
  invoiceDate: '송장 발행일', estimatedArrivalDate: '도착 예정일', measurement: '용적', shippingMarks: '화인',
};

export type ComparisonStatus = 'mismatch' | 'match' | 'single' | 'missing';
export const COMPARISON_LABELS: Record<ComparisonStatus, string> = {
  mismatch: '불일치', match: '기재 문서 간 일치', single: '단일 문서 기재', missing: '비교 자료 없음',
};
export function comparisonStatus(row: ImportComparisonRow): ComparisonStatus {
  const count = [row.invoice, row.packingList, row.billOfLading].filter(hasDocumentValue).length;
  if (count === 0) return 'missing';
  if (count === 1) return 'single';
  return row.matches ? 'match' : 'mismatch';
}
