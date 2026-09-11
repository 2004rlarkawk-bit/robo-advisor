/**
 * 화주 수출 — 업로드한 보유 서류와 입력값 대조.
 *
 * 서류 생성은 기존과 동일하게 폼 입력값으로 진행하고,
 * 사용자가 올린 원본 서류에서 추출한 값과 어긋나는 항목만 따로 알려준다.
 * (추출은 포워더 수출에서 쓰는 분석 파이프라인을 그대로 재사용한다.)
 */
import { analyzeImportDocuments } from './importDocumentAnalysisService';
import { loadTradeAttachmentFile } from './tradeAttachmentStorageService';
import type { ImportDocumentMeta, ImportExtractedFields } from '../types/importTrade';
import type { TradeAttachment, TradeAttachmentDocumentType } from '../types/tradeFormData';
import type { ShipperItem, TradeProfile } from '../types';
import { parseTradeNumber } from '../utils/number';

export type ExportMatchStatus = 'match' | 'mismatch' | 'unknown';

export interface ExportDocMatchRow {
  /** 폼 필드 키 — [이 값으로 수정]과 [입력 수정] 이동에 사용한다. */
  field: string;
  label: string;
  /** 업로드한 서류에서 추출한 값 */
  uploadedValue: string;
  /** 사용자가 폼에 입력한 값 */
  formValue: string;
  status: ExportMatchStatus;
}

export interface ExportDocMatchResult {
  attachmentId: string;
  fileName: string;
  documentType: TradeAttachmentDocumentType;
  documentLabel: string;
  rows: ExportDocMatchRow[];
  mismatchCount: number;
  /** 분석 자체가 실패한 경우의 사유 */
  error?: string;
}

const DOCUMENT_LABEL: Partial<Record<TradeAttachmentDocumentType, string>> = {
  commercial_invoice: '상업송장(C/I)',
  packing_list: '포장명세서(P/L)',
  transport_request: '수출 운송의뢰서(T/R)',
  export_declaration: '수출신고필증(E/D)',
  certificate_of_origin: '원산지증명서(C/O)',
  other: '기타서류',
};

/** 대조 대상 서류 — 값이 폼과 직접 대응되는 서류만 본다. */
const COMPARABLE_TYPES: TradeAttachmentDocumentType[] = [
  'commercial_invoice',
  'packing_list',
  'transport_request',
  'export_declaration',
  'certificate_of_origin',
];

const text = (value: unknown): string => String(value ?? '').trim();

/** 표기 차이(대소문자·공백·쉼표·통화기호)는 불일치로 보지 않는다. */
function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[,\s]/g, '')
    .replace(/[.]0+$/, '')
    .trim();
}

const NUMERIC_FIELDS = new Set([
  'quantity', 'unitPrice', 'totalAmount', 'invoiceAmount',
  'packageCount', 'netWeight', 'grossWeight', 'weight', 'eaPerBox',
]);

/**
 * 숫자로 비교할 필드. 날짜·문서번호처럼 숫자가 섞인 문자열은 여기서 빼야 한다 —
 * 첫 숫자만 읽으면 "2026-09-01"과 "2026-09-15"가 모두 2026이 되어 일치로 오판한다.
 */
const NUMERIC_COMPARE_FIELDS = new Set([...NUMERIC_FIELDS, 'measurement']);

function compare(field: string, uploadedValue: string, formValue: string): ExportMatchStatus {
  if (!uploadedValue || !formValue) return 'unknown';
  if (normalize(uploadedValue) === normalize(formValue)) return 'match';
  if (!NUMERIC_COMPARE_FIELDS.has(field)) return 'mismatch';
  // 숫자는 표기(1,800 / 1800.00 / 1.25 M3)가 달라도 값이 같으면 일치로 본다.
  const left = parseTradeNumber(uploadedValue);
  const right = parseTradeNumber(formValue);
  if (left !== null && right !== null) return left === right ? 'match' : 'mismatch';
  return 'mismatch';
}

function firstItem(items: ShipperItem[], profile: TradeProfile) {
  const item = items[0];
  return {
    description: text(item?.itemName || profile.itemName),
    hsCode: text(item?.hsCode || profile.hsCode),
    quantity: text(item?.quantity ?? profile.quantity),
    unitPrice: text(item?.unitPrice ?? profile.unitPrice),
  };
}

/** 서류 종류별로 "그 서류에 원래 실리는 항목"만 비교한다. */
function buildRows(
  documentType: TradeAttachmentDocumentType,
  extracted: ImportExtractedFields,
  profile: TradeProfile,
  items: ShipperItem[],
): ExportDocMatchRow[] {
  const item = firstItem(items, profile);
  const extractedItem = extracted.items[0];
  const candidates: Array<Omit<ExportDocMatchRow, 'status'>> = [];

  const add = (field: string, label: string, uploadedValue: string, formValue: string) => {
    candidates.push({ field, label, uploadedValue: text(uploadedValue), formValue: text(formValue) });
  };

  const partiesRows = () => {
    add('companyName', '수출자', extracted.exporterDetails.name || extracted.shipper, profile.companyName);
    add(
      'partnerName',
      '수입자',
      extracted.consigneeDetails.name || extracted.consignee || extracted.importerDetails.name,
      profile.partnerName ?? '',
    );
  };
  const itemRows = () => {
    add('itemName', '품목', extractedItem?.description || extracted.productDescription, item.description);
    add('hsCode', 'HS Code', extractedItem?.documentHSCode || extractedItem?.confirmedHSCode, item.hsCode);
    add('quantity', '수량', extractedItem?.quantity || extracted.quantity, item.quantity);
  };

  switch (documentType) {
    case 'commercial_invoice':
      partiesRows();
      add('invoiceNo', 'Invoice No.', extracted.invoiceNo, profile.invoiceNo ?? '');
      add('invoiceDate', 'Invoice 일자', extracted.invoiceDate, profile.invoiceDate ?? '');
      itemRows();
      add('unitPrice', '단가', extractedItem?.unitPrice, item.unitPrice);
      add('totalAmount', '총액', extracted.totalAmount, text(profile.totalAmount || profile.invoiceAmount));
      add('currency', '통화', extracted.currency, profile.currency ?? '');
      add('incoterms', 'Incoterms', extracted.incoterms, profile.incoterms);
      break;
    case 'packing_list':
      partiesRows();
      itemRows();
      add('packageCount', '포장 수량', extracted.totalPackageCount, text(profile.packageCount));
      add('packageType', '포장 종류', extracted.packageUnit, profile.packageType ?? '');
      add('netWeight', '순중량', extracted.netWeight, text(profile.netWeight));
      add('grossWeight', '총중량', extracted.grossWeight, text(profile.grossWeight || profile.weight));
      add('measurement', '용적(CBM)', extracted.measurement, profile.measurement ?? '');
      break;
    case 'transport_request':
      partiesRows();
      add('loadPort', '선적항', extracted.loadPort, profile.loadPort);
      add('dischargePort', '도착항', extracted.dischargePort, profile.dischargePort);
      add('incoterms', 'Incoterms', extracted.incoterms, profile.incoterms);
      add('packageCount', '포장 수량', extracted.totalPackageCount, text(profile.packageCount));
      add('grossWeight', '총중량', extracted.grossWeight, text(profile.grossWeight || profile.weight));
      break;
    case 'export_declaration':
      partiesRows();
      itemRows();
      add('totalAmount', '총액', extracted.totalAmount, text(profile.totalAmount || profile.invoiceAmount));
      add('countryOfOrigin', '원산지', extractedItem?.originCountry, profile.countryOfOrigin ?? '');
      break;
    case 'certificate_of_origin':
      partiesRows();
      itemRows();
      add('countryOfOrigin', '원산지', extractedItem?.originCountry, profile.countryOfOrigin ?? '');
      break;
    default:
      break;
  }

  return candidates
    // 양쪽 다 비어 있으면 보여줄 게 없다.
    .filter((row) => row.uploadedValue || row.formValue)
    .map((row) => ({ ...row, status: compare(row.field, row.uploadedValue, row.formValue) }));
}

function toDocumentMeta(attachment: TradeAttachment): ImportDocumentMeta {
  return {
    id: attachment.id,
    name: attachment.fileName,
    size: attachment.sizeBytes,
    mimeType: attachment.mimeType,
    type: attachment.documentType === 'arrival_notice' ? 'other' : attachment.documentType,
    status: 'ready',
    uploadStatus: 'uploaded',
    analysisStatus: 'pending',
    sourceId: attachment.id,
    storageBucket: attachment.storageBucket,
    storagePath: attachment.storagePath,
    uploadedAt: attachment.uploadedAt,
  };
}


/**
 * 동시 분석 요청 수 제한.
 * 여러 서류를 한꺼번에 쏘면 OpenAI가 과부하(503)·레이트리밋(429)으로 거절할 확률이 올라간다.
 */
const MAX_CONCURRENT_MATCHES = 2;

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export interface MatchDependencies {
  analyze: typeof analyzeImportDocuments;
  loadFile: typeof loadTradeAttachmentFile;
}

const DEFAULT_DEPENDENCIES: MatchDependencies = {
  analyze: analyzeImportDocuments,
  loadFile: loadTradeAttachmentFile,
};

/**
 * 업로드한 수출서류를 분석해 폼 입력값과 대조한다.
 * 한 건이 실패해도 나머지 서류의 대조 결과는 그대로 돌려준다.
 */
export async function matchUploadedExportDocuments(input: {
  attachments: TradeAttachment[];
  profile: TradeProfile;
  items: ShipperItem[];
  userId?: string;
  pendingFiles?: Record<string, File>;
  dependencies?: MatchDependencies;
}): Promise<ExportDocMatchResult[]> {
  const {
    attachments, profile, items, userId, pendingFiles = {},
    dependencies = DEFAULT_DEPENDENCIES,
  } = input;
  const targets = attachments.filter((attachment) => COMPARABLE_TYPES.includes(attachment.documentType));
  if (!targets.length) return [];

  const results = await mapWithConcurrency(targets, MAX_CONCURRENT_MATCHES, async (attachment): Promise<ExportDocMatchResult> => {
    const base = {
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      documentType: attachment.documentType,
      documentLabel: DOCUMENT_LABEL[attachment.documentType] ?? '첨부 서류',
    };
    try {
      const file = pendingFiles[attachment.id] ?? await dependencies.loadFile(attachment, userId);
      const response = await dependencies.analyze([toDocumentMeta(attachment)], { [attachment.id]: file });
      const rows = buildRows(attachment.documentType, response.analysis.extracted, profile, items);
      return { ...base, rows, mismatchCount: rows.filter((row) => row.status === 'mismatch').length };
    } catch (error) {
      console.error('[Export Match] 업로드 서류 대조 실패:', {
        fileName: attachment.fileName,
        storageBucket: attachment.storageBucket,
        code: (error as { code?: string })?.code,
        status: (error as { status?: string })?.status,
        error,
      });
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ...base,
        rows: [],
        mismatchCount: 0,
        error: `업로드한 서류를 읽지 못해 대조하지 못했습니다. (${detail})`,
      };
    }
  });

  return results;
}

/** 품목 단위로 관리되는 필드 — profile.shipperItems[0]에 반영해야 서류에 실제로 반영된다. */
const ITEM_FIELDS = new Set(['itemName', 'hsCode', 'quantity', 'unitPrice']);
/** 숫자로 저장되는 필드 — 문자열로 넣으면 계산·검증이 깨진다. */
// 숫자를 읽지 못한 값(빈 값·N/A)은 0이 아니라 공란으로 반영한다.
function toNumeric(value: string): number | '' {
  return parseTradeNumber(value) ?? '';
}

/**
 * 대조 결과의 '수정 권장' 값들을 프로필에 반영한다.
 * 품목 필드는 shipperItems 첫 품목에 함께 반영해야 생성 서류에 나타난다.
 */
export function applyMatchPatchToProfile(
  current: TradeProfile,
  patch: Record<string, string>,
): TradeProfile {
  const next: Record<string, unknown> = { ...current };
  const itemPatch: Record<string, unknown> = {};

  Object.entries(patch).forEach(([field, rawValue]) => {
    const value = NUMERIC_FIELDS.has(field) ? toNumeric(rawValue) : rawValue;
    next[field] = value;
    if (ITEM_FIELDS.has(field)) itemPatch[field] = value;
  });

  const items = current.shipperItems;
  if (items?.length && Object.keys(itemPatch).length) {
    next.shipperItems = items.map((item, index) => (
      index === 0 ? { ...item, ...itemPatch } : item
    ));
  }
  return next as unknown as TradeProfile;
}

/** 첨부 문서 종류 → 수출 문서함의 서류 ID. 생성본 미리보기를 열 때 쓴다. */
const ATTACHMENT_TO_DOCUMENT: Partial<Record<TradeAttachmentDocumentType, string>> = {
  commercial_invoice: 'invoice',
  packing_list: 'packing_list',
  transport_request: 'transport_request',
  export_declaration: 'customs_dec',
  certificate_of_origin: 'co',
};

export function documentIdForAttachmentType(
  documentType: TradeAttachmentDocumentType,
): string | undefined {
  return ATTACHMENT_TO_DOCUMENT[documentType];
}
