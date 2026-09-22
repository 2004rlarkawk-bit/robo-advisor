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
import { areEquivalentTradeFieldValues, isAbsentTradeValue } from '../utils/tradeValueNormalization';
import { isSameCbmAtDocumentPrecision } from '../utils/packageCbm';
import { portComparisonKey } from './importReconciliationRules';

export type ExportMatchStatus = 'match' | 'mismatch' | 'unknown';

/**
 * 불일치 항목에서 화주가 고른 쪽.
 *  - 'form'     현재 입력값이 맞다 — 입력값을 그대로 둔다.
 *  - 'uploaded' 업로드한 서류 값이 맞다 — 입력값을 그 값으로 바꾼다.
 */
export type MatchChoice = 'form' | 'uploaded';

export interface ExportDocMatchRow {
  /** 폼 필드 키 — 값 선택 반영과 [입력 수정] 이동에 사용한다. */
  field: string;
  label: string;
  /** 업로드한 서류에서 추출한 값 */
  uploadedValue: string;
  /** 사용자가 폼에 입력한 값 */
  formValue: string;
  status: ExportMatchStatus;
  /**
   * 폼 값이 다른 입력에서 계산된 값이라 직접 덮어쓸 수 없는 항목(예: 포장 규격에서 나온 CBM).
   * 업로드 서류 값 선택 대상에서 빼고, 원래 입력을 고치도록 안내한다.
   */
  computed?: boolean;
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
  insurance_policy: '적하보험증권',
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
  'insurance_policy',
];

/** CIF·CIP 관행상 보험금액은 송장금액의 110% 이상이어야 한다 (Incoterms 2020 A5, UCP 600 제28조). */
const INSURANCE_COVERAGE_RATIO = 1.1;

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

/**
 * HS부호는 숫자만 비교한다("8471.30-1000" = "8471301000").
 * 국제 서류는 6단위, 폼은 10단위(HSK)로 적는 경우가 흔해 앞 6자리 이상이 겹치면 일치로 본다.
 */
function isSameHSCode(left: string, right: string): boolean {
  const a = left.replace(/\D/g, '');
  const b = right.replace(/\D/g, '');
  if (a.length < 6 || b.length < 6) return a === b;
  return a.startsWith(b) || b.startsWith(a);
}

function compare(field: string, uploadedValue: string, formValue: string): ExportMatchStatus {
  // "N/A", "-", "미기재"는 값이 없는 것 — 불일치가 아니라 확인 불가로 둔다.
  if (isAbsentTradeValue(uploadedValue) || isAbsentTradeValue(formValue)) return 'unknown';
  // 보험금액은 같아야 하는 값이 아니라 "필요 담보액 이상"이면 된다.
  if (field === 'insuredAmount') {
    const insured = parseTradeNumber(uploadedValue);
    const required = parseTradeNumber(formValue);
    if (insured === null || required === null) return 'unknown';
    return insured + 0.005 >= required ? 'match' : 'mismatch';
  }
  // 용적(CBM)은 포장 규격에서 계산한 값이라 서류보다 자릿수가 길다.
  // 서류에 적힌 자릿수로 반올림해 비교한다(P/L "0.35" ↔ 계산값 0.369 → 0.37, 불일치).
  if (field === 'measurement') {
    const computed = parseTradeNumber(formValue);
    if (computed === null) return 'unknown';
    return isSameCbmAtDocumentPrecision(uploadedValue, computed) ? 'match' : 'mismatch';
  }
  if (normalize(uploadedValue) === normalize(formValue)) return 'match';
  if (field === 'hsCode') return isSameHSCode(uploadedValue, formValue) ? 'match' : 'mismatch';
  // 항구명은 "BUSAN, KOREA" / "Busan Port" / "KRPUS Busan" 을 같은 항구로 본다.
  if ((field === 'loadPort' || field === 'dischargePort')
    && portComparisonKey(uploadedValue) === portComparisonKey(formValue)) return 'match';
  // 항구명(Busan / Busan Port), 포장 종류(CT / CARTON), Incoterms(FOB BUSAN / FOB)는 의미로 비교한다.
  if (areEquivalentTradeFieldValues(field, uploadedValue, formValue)) return 'match';
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

  const add = (
    field: string,
    label: string,
    uploadedValue: string,
    formValue: string,
    options: { computed?: boolean } = {},
  ) => {
    candidates.push({
      field,
      label,
      uploadedValue: text(uploadedValue),
      formValue: text(formValue),
      ...(options.computed ? { computed: true } : {}),
    });
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
      // 직접 적어 넣은 CBM은 고칠 칸이 있으니 서류 값 반영을 열어 준다.
      add('measurement', '용적(CBM)', extracted.measurement, profile.measurement ?? '', { computed: !profile.measurementManual });
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
    case 'insurance_policy': {
      // 보험증권은 폼 값과 1:1 대응이 아니라 "송장금액 × 110% 이상 담보"를 본다.
      const invoiceTotal = parseTradeNumber(text(profile.totalAmount || profile.invoiceAmount));
      const required = invoiceTotal === null ? '' : String(Math.round(invoiceTotal * INSURANCE_COVERAGE_RATIO * 100) / 100);
      add('insuredAmount', '보험금액 (송장금액 × 110% 이상)', extracted.insuredAmount, required);
      add('insuredCurrency', '보험 통화', extracted.insuredCurrency, profile.currency ?? '');
      add('loadPort', '선적항', extracted.loadPort, profile.loadPort);
      add('dischargePort', '도착항', extracted.dischargePort, profile.dischargePort);
      break;
    }
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
    type: attachment.documentType === 'arrival_notice' || attachment.documentType === 'booking_confirmation' ? 'other' : attachment.documentType,
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

// ── 서류 간 교차 대조 ──────────────────────────────────────────
// 위 대조는 "업로드 서류 ↔ 입력값"이고, 여기서는 업로드한 서류끼리 직접 비교한다.
// 예) B/L 선적항 ↔ C/I 선적항, C/O 원산지 ↔ C/I 원산지, 보험증권 보험금액 ↔ C/I 총액 × 110%.
// 은행·세관은 서류끼리 대조하므로 입력값이 맞아도 서류 간 어긋남은 따로 보여줘야 한다.

export interface ExportCrossCheckValue {
  attachmentId: string;
  documentLabel: string;
  value: string;
}
export interface ExportCrossCheck {
  field: string;
  label: string;
  values: ExportCrossCheckValue[];
  status: 'match' | 'mismatch';
  /** 불일치 사유(보험 담보 부족 등 단순 비교가 아닌 경우) */
  note?: string;
}

/** 두 서류 이상에 실린 항목만 교차 대조한다. 순서는 사람이 보는 서류 우선순위(C/I → P/L → …). */
const CROSS_CHECK_FIELDS: Array<{ field: string; label: string }> = [
  { field: 'companyName', label: '수출자' },
  { field: 'partnerName', label: '수입자' },
  { field: 'itemName', label: '품목' },
  { field: 'hsCode', label: 'HS Code' },
  { field: 'quantity', label: '수량' },
  { field: 'totalAmount', label: '총액' },
  { field: 'countryOfOrigin', label: '원산지' },
  { field: 'loadPort', label: '선적항' },
  { field: 'dischargePort', label: '도착항' },
  { field: 'packageCount', label: '포장 수량' },
  { field: 'grossWeight', label: '총중량' },
  { field: 'incoterms', label: 'Incoterms' },
];

export function buildExportCrossChecks(matches: ExportDocMatchResult[]): ExportCrossCheck[] {
  const usable = matches.filter((match) => !match.error);
  const checks: ExportCrossCheck[] = [];

  for (const { field, label } of CROSS_CHECK_FIELDS) {
    const values: ExportCrossCheckValue[] = [];
    for (const match of usable) {
      const row = match.rows.find((r) => r.field === field);
      if (row && !isAbsentTradeValue(row.uploadedValue)) {
        values.push({ attachmentId: match.attachmentId, documentLabel: match.documentLabel, value: row.uploadedValue });
      }
    }
    if (values.length < 2) continue;
    const base = values[0].value;
    const allSame = values.every((v) => compare(field, v.value, base) === 'match');
    checks.push({ field, label, values, status: allSame ? 'match' : 'mismatch' });
  }

  // 보험증권 ↔ 상업송장: 보험금액 ≥ 송장 총액 × 110%
  const insurance = usable.find((m) => m.documentType === 'insurance_policy');
  const invoice = usable.find((m) => m.documentType === 'commercial_invoice');
  if (insurance && invoice) {
    const insuredRaw = insurance.rows.find((r) => r.field === 'insuredAmount')?.uploadedValue ?? '';
    const totalRaw = invoice.rows.find((r) => r.field === 'totalAmount')?.uploadedValue ?? '';
    const insured = parseTradeNumber(insuredRaw);
    const total = parseTradeNumber(totalRaw);
    if (insured !== null && total !== null) {
      const required = Math.round(total * INSURANCE_COVERAGE_RATIO * 100) / 100;
      const ok = insured + 0.005 >= required;
      checks.push({
        field: 'insuranceCoverage',
        label: '보험 담보 (보험금액 ≥ 송장금액 × 110%)',
        values: [
          { attachmentId: insurance.attachmentId, documentLabel: insurance.documentLabel, value: insuredRaw },
          { attachmentId: invoice.attachmentId, documentLabel: invoice.documentLabel, value: `${totalRaw} → 필요 담보 ${required.toLocaleString()}` },
        ],
        status: ok ? 'match' : 'mismatch',
        note: ok ? undefined : 'CIF·CIP 조건의 관행적 최소 담보(송장금액의 110%)에 미달합니다. 보험사에 증액을 요청하세요.',
      });
    }
  }

  return checks;
}

/** 품목 단위로 관리되는 필드 — profile.shipperItems[0]에 반영해야 서류에 실제로 반영된다. */
const ITEM_FIELDS = new Set(['itemName', 'hsCode', 'quantity', 'unitPrice']);
/** 숫자로 저장되는 필드 — 문자열로 넣으면 계산·검증이 깨진다. */
// 숫자를 읽지 못한 값(빈 값·N/A)은 0이 아니라 공란으로 반영한다.
function toNumeric(value: string): number | '' {
  return parseTradeNumber(value) ?? '';
}

/**
 * 업로드 서류의 품명에서 영문 품명만 꺼낸다.
 * 상업송장·포장명세서 품명은 영문이어야 하는데(getGoodsDescriptionValidationMessage),
 * 국내 서류는 "냉동 갈치 (Frozen Hairtail)"처럼 한글을 함께 적는 경우가 많다.
 *  - 한글이 없으면 그대로 사용
 *  - 괄호 안에 영문이 있으면 그 영문 (→ "Frozen Hairtail")
 *  - 그 밖에는 한글만 지우고 남은 영문 (→ "" 이면 null: 영문이 없어 직접 정리해야 한다)
 */
export function extractEnglishGoodsName(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (!/[가-힣]/.test(text)) return text;

  const parenthesized = text.match(/[(（]([^)）]*[A-Za-z][^)）]*)[)）]/);
  const candidate = parenthesized
    ? parenthesized[1]
    : text.replace(/[(（][^)）]*[)）]/g, ' ').replace(/[가-힣]+/g, ' ');

  const cleaned = candidate
    .replace(/\s+/g, ' ')
    .replace(/^[\s,./·-]+|[\s,./·-]+$/g, '')
    .trim();
  return /[A-Za-z]/.test(cleaned) ? cleaned : null;
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
