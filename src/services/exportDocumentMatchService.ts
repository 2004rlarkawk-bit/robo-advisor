/**
 * 내 서류 대조 — 화주가 업로드한 보유 서류(원본)를 AI로 읽어
 * 폼 입력값(TradeProfile·품목)과 항목별로 대조한다.
 *
 * 서류 생성 결과에는 영향을 주지 않는 확인용 기능이며, 분석 실패는
 * 건별 error로만 보고하고 전체 흐름을 막지 않는다.
 * (main에 커밋이 누락되어 App.tsx 사용부 기준으로 재작성한 모듈)
 */
import type { ShipperItem, TradeProfile } from '../types';
import type { TradeAttachment } from '../types/tradeFormData';
import type { ImportDocumentMeta, ImportExtractedFields } from '../types/importTrade';
import {
  analyzeImportDocuments,
  IMPORT_DOCUMENT_TYPE_LABELS,
} from './importDocumentAnalysisService';
import { loadTradeAttachmentFile } from './tradeAttachmentStorageService';

export type ExportDocMatchStatus = 'match' | 'mismatch' | 'unknown';

export interface ExportDocMatchRow {
  /** TradeProfile 키 — [이 값으로 수정]이 profile에 그대로 기록한다 */
  field: string;
  label: string;
  uploadedValue: string;
  formValue: string;
  status: ExportDocMatchStatus;
}

export interface ExportDocMatchResult {
  attachmentId: string;
  documentLabel: string;
  fileName: string;
  rows: ExportDocMatchRow[];
  mismatchCount: number;
  error?: string;
}

const MATCHABLE_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

const normalizeText = (value: string): string =>
  value.normalize('NFKC').toUpperCase().replace(/\s+/g, ' ').trim();

const normalizeNumber = (value: string): number | null => {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const asText = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value).trim();

type CompareKind = 'text' | 'number' | 'contains';

function compareValues(uploaded: string, form: string, kind: CompareKind): ExportDocMatchStatus {
  if (uploaded === '' ) return 'unknown';
  if (form === '') return 'mismatch';
  if (kind === 'number') {
    const a = normalizeNumber(uploaded);
    const b = normalizeNumber(form);
    if (a === null) return 'unknown';
    if (b === null) return 'mismatch';
    return Math.abs(a - b) < 0.005 ? 'match' : 'mismatch';
  }
  const a = normalizeText(uploaded);
  const b = normalizeText(form);
  if (kind === 'contains') {
    return a.includes(b) || b.includes(a) ? 'match' : 'mismatch';
  }
  return a === b ? 'match' : 'mismatch';
}

interface RowSpec {
  field: keyof TradeProfile & string;
  label: string;
  uploaded: (extracted: ImportExtractedFields) => string;
  form: (profile: TradeProfile, items: ShipperItem[]) => string;
  kind: CompareKind;
}

const ROW_SPECS: RowSpec[] = [
  { field: 'invoiceNo', label: '송장 번호', uploaded: (e) => e.invoiceNo, form: (p) => asText(p.invoiceNo), kind: 'text' },
  { field: 'itemName', label: '품목명', uploaded: (e) => e.productDescription, form: (p, items) => asText(items[0]?.itemName ?? p.itemName), kind: 'contains' },
  { field: 'hsCode', label: 'HS코드', uploaded: (e) => e.items[0]?.documentHSCode ?? '', form: (p, items) => asText(items[0]?.hsCode ?? p.hsCode), kind: 'number' },
  { field: 'quantity', label: '수량', uploaded: (e) => e.quantity, form: (p, items) => asText(items[0]?.quantity ?? p.quantity), kind: 'number' },
  { field: 'invoiceAmount', label: '총 금액', uploaded: (e) => e.totalAmount, form: (p) => asText(p.invoiceAmount), kind: 'number' },
  { field: 'currency', label: '통화', uploaded: (e) => e.currency, form: (p, items) => asText(items[0]?.currency ?? p.currency), kind: 'text' },
  { field: 'grossWeight', label: '총중량', uploaded: (e) => e.grossWeight, form: (p) => asText(p.grossWeight ?? p.weight), kind: 'number' },
  { field: 'netWeight', label: '순중량', uploaded: (e) => e.netWeight, form: (p) => asText(p.netWeight), kind: 'number' },
  { field: 'loadPort', label: '선적항', uploaded: (e) => e.loadPort, form: (p) => asText(p.loadPort), kind: 'contains' },
  { field: 'dischargePort', label: '도착항', uploaded: (e) => e.dischargePort, form: (p) => asText(p.dischargePort), kind: 'contains' },
  { field: 'incoterms', label: '인코텀즈', uploaded: (e) => e.incoterms.split(/[\s]/)[0] ?? '', form: (p) => asText(p.incoterms), kind: 'text' },
  { field: 'blNo', label: 'B/L 번호', uploaded: (e) => e.blNo, form: (p) => asText(p.blNo), kind: 'text' },
];

function documentLabelOf(attachment: TradeAttachment): string {
  if (attachment.documentType === 'arrival_notice') return '도착통지서';
  return IMPORT_DOCUMENT_TYPE_LABELS[attachment.documentType] ?? '업로드 서류';
}

function buildRows(
  extracted: ImportExtractedFields,
  profile: TradeProfile,
  items: ShipperItem[],
): ExportDocMatchRow[] {
  return ROW_SPECS
    .map((spec) => {
      const uploadedValue = asText(spec.uploaded(extracted));
      const formValue = spec.form(profile, items);
      return {
        field: spec.field,
        label: spec.label,
        uploadedValue,
        formValue,
        status: compareValues(uploadedValue, formValue, spec.kind),
      };
    })
    // 양쪽 다 비어 있는 항목은 대조 대상이 아니다
    .filter((row) => row.uploadedValue !== '' || row.formValue !== '');
}

export async function matchUploadedExportDocuments(input: {
  attachments: TradeAttachment[];
  profile: TradeProfile;
  items: ShipperItem[];
  userId: string;
}): Promise<ExportDocMatchResult[]> {
  const results: ExportDocMatchResult[] = [];

  // 첨부를 순차 분석 — Edge Function 동시 호출 부하와 실패 전파를 줄인다.
  for (const attachment of input.attachments) {
    const base = {
      attachmentId: attachment.id,
      documentLabel: documentLabelOf(attachment),
      fileName: attachment.fileName,
    };
    if (!MATCHABLE_MIME_TYPES.has(attachment.mimeType)) {
      results.push({ ...base, rows: [], mismatchCount: 0, error: '분석을 지원하지 않는 파일 형식입니다. (PDF/PNG/JPG만 가능)' });
      continue;
    }
    try {
      const file = await loadTradeAttachmentFile(attachment, input.userId);
      const meta: ImportDocumentMeta = {
        id: attachment.id,
        name: attachment.fileName,
        size: attachment.sizeBytes,
        mimeType: attachment.mimeType,
        type: attachment.documentType === 'arrival_notice' ? 'other' : attachment.documentType,
        status: 'ready',
      };
      const { analysis } = await analyzeImportDocuments([meta], { [meta.id]: file });
      const rows = buildRows(analysis.extracted, input.profile, input.items);
      results.push({
        ...base,
        rows,
        mismatchCount: rows.filter((row) => row.status === 'mismatch').length,
      });
    } catch (error) {
      console.error('[Export Match] 서류 대조 실패:', attachment.fileName, error);
      results.push({
        ...base,
        rows: [],
        mismatchCount: 0,
        error: error instanceof Error ? error.message : '서류를 읽지 못했습니다.',
      });
    }
  }

  return results;
}
