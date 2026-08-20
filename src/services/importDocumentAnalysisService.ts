import { supabase } from '../lib/supabase';
import type {
  ImportAnalysisResult,
  ImportDocumentAnalysisResponse,
  ImportDocumentMeta,
  ImportDocumentType,
  ImportExtractedFields,
  ImportItem,
  ImportParty,
} from '../types/importTrade';

export const IMPORT_DOCUMENT_TYPE_LABELS: Record<ImportDocumentType, string> = {
  commercial_invoice: '상업송장',
  packing_list: '포장명세서',
  bill_of_lading: '선하증권',
  certificate_of_origin: '원산지증명서',
  transport_request: '수출 운송의뢰서',
  export_declaration: '수출신고필증',
  other: '기타서류',
  unknown: '기타서류',
};

const STRONG_FILE_NAME_HINTS: Array<[RegExp, ImportDocumentType]> = [
  [/(?:상업\s*송장(?:서)?|COMMERCIAL\s+INVOICE|(?:^|\s)C\s*(?:\/\s*)?I(?=\s|$))/, 'commercial_invoice'],
  [/(?:포장\s*(?:명세서|내역서|목록)|[패팩]킹\s*(?:리스트|명세서?)|PACKING\s+LIST|(?:^|\s)P\s*(?:\/\s*)?L(?=\s|$))/, 'packing_list'],
  [/(?:해상\s*)?선하\s*증권(?:서)?|BILL\s+OF\s+LADING|(?:^|\s)B\s*(?:\/\s*)?L(?=\s|$)/, 'bill_of_lading'],
  [/(?:원산지\s*증명(?:서)?|CERTIFICATE\s+OF\s+ORIGIN|(?:^|\s)C\s*(?:\/\s*)?O(?=\s|$))/, 'certificate_of_origin'],
  [/(?:수출\s*운송\s*의뢰서|운송\s*의뢰서|선적\s*의뢰서|선적\s*요청|SHIPPING\s+(?:REQUEST|INSTRUCTION|ORDER)|EXPORT\s+TRANSPORT\s+REQUEST|TRANSPORT\s+REQUEST|(?:^|\s)(?:T\s*(?:\/\s*)?R|S\s*(?:\/\s*)?I)(?=\s|$))/, 'transport_request'],
  [/(?:수출\s*신고(?:필증|서)|EXPORT\s+DECLARATION|EXPORT\s+PERMIT)/, 'export_declaration'],
];

const WEAK_FILE_NAME_HINTS: Array<[RegExp, ImportDocumentType]> = [
  [/(?:^|\s)(?:송장|인보이스|INVOICE)(?=\s|$)/, 'commercial_invoice'],
];

function normalizedClassificationText(fileName: string): string {
  return fileName
    .normalize('NFKC')
    .replace(/\.(pdf|png|jpe?g)$/i, '')
    // '패킹리스트(P/L).pdf'처럼 약어가 괄호에 묶이면 토큰 경계가 사라지므로 괄호류도 구분자로 본다.
    .replace(/[._\-()[\]{}<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function classifyImportDocumentName(fileName: string): ImportDocumentType {
  const normalized = normalizedClassificationText(fileName);
  const strong = STRONG_FILE_NAME_HINTS.find(([pattern]) => pattern.test(normalized));
  if (strong) return strong[1];

  // 세금계산서·견적송장은 Commercial Invoice와 용도가 다르므로 약한 invoice 힌트에서 제외한다.
  if (/세금\s*계산서|TAX\s+INVOICE|PROFORMA\s+INVOICE|견적\s*송장/.test(normalized)) {
    return 'other';
  }
  return WEAK_FILE_NAME_HINTS.find(([pattern]) => pattern.test(normalized))?.[1] ?? 'other';
}

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 25 * 1024 * 1024;

const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const textArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);

export const EMPTY_IMPORT_PARTY: ImportParty = {
  name: '',
  address: '',
  country: '',
  contactName: '',
  phone: '',
  email: '',
};

function normalizeParty(value: unknown, legacyName = ''): ImportParty {
  const party = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    name: text(party.name) || legacyName,
    address: text(party.address),
    country: text(party.country),
    contactName: text(party.contactName),
    phone: text(party.phone),
    email: text(party.email),
  };
}

function normalizeItem(value: unknown, index: number): ImportItem {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    id: text(item.id) || `item-${index + 1}`,
    itemNo: text(item.itemNo),
    sku: text(item.sku),
    description: text(item.description),
    koreanDescription: text(item.koreanDescription),
    documentHSCode: text(item.documentHSCode ?? item.hsCode),
    confirmedHSCode: text(item.confirmedHSCode),
    modelName: text(item.modelName),
    specification: text(item.specification),
    material: text(item.material),
    composition: text(item.composition),
    fabricConstruction: text(item.fabricConstruction),
    productForm: text(item.productForm),
    processingState: text(item.processingState),
    gender: text(item.gender),
    intendedUse: text(item.intendedUse ?? item.use),
    originCountry: text(item.originCountry),
    quantity: text(item.quantity),
    quantityUnit: text(item.quantityUnit),
    unitPrice: text(item.unitPrice),
    currency: text(item.currency),
    amount: text(item.amount),
    packageCount: text(item.packageCount),
    packageUnit: text(item.packageUnit),
    netWeight: text(item.netWeight),
    grossWeight: text(item.grossWeight),
    measurement: text(item.measurement),
    shippingMarks: text(item.shippingMarks),
    sourceDocumentIds: textArray(item.sourceDocumentIds),
  };
}

const ITEM_MERGE_FIELDS: Array<keyof ImportItem> = [
  'itemNo',
  'sku',
  'description',
  'koreanDescription',
  'documentHSCode',
  'confirmedHSCode',
  'modelName',
  'specification',
  'material',
  'composition',
  'fabricConstruction',
  'productForm',
  'processingState',
  'gender',
  'intendedUse',
  'originCountry',
  'quantity',
  'quantityUnit',
  'unitPrice',
  'currency',
  'amount',
  'packageCount',
  'packageUnit',
  'netWeight',
  'grossWeight',
  'measurement',
  'shippingMarks',
];

function normalizedItemIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^\s*item\s*\d+\s*[:.)-]?\s*/i, '')
    .replace(/[^a-z0-9가-힣]/g, '');
}

function normalizedHSCode(value: string): string {
  return value.replace(/\D/g, '');
}

function canMergeCrossDocumentItems(existing: ImportItem, candidate: ImportItem): boolean {
  const existingSources = new Set(existing.sourceDocumentIds);
  const candidateSources = new Set(candidate.sourceDocumentIds);
  if (!existingSources.size || !candidateSources.size) return false;
  if (candidate.sourceDocumentIds.some((sourceId) => existingSources.has(sourceId))) return false;

  const existingDescription = normalizedItemIdentity(existing.description);
  const candidateDescription = normalizedItemIdentity(candidate.description);
  if (!existingDescription || existingDescription !== candidateDescription) return false;

  const conflicting = (left: string | undefined, right: string | undefined, normalize = normalizedItemIdentity) =>
    Boolean(left && right && normalize(left) !== normalize(right));

  if (conflicting(existing.itemNo, candidate.itemNo)) return false;
  if (conflicting(existing.sku, candidate.sku)) return false;
  if (conflicting(existing.modelName, candidate.modelName)) return false;
  if (conflicting(existing.documentHSCode, candidate.documentHSCode, normalizedHSCode)) return false;
  return true;
}

function mergeCrossDocumentItems(items: ImportItem[]): ImportItem[] {
  return items.reduce<ImportItem[]>((merged, candidate) => {
    const existing = merged.find((item) => canMergeCrossDocumentItems(item, candidate));
    if (!existing) {
      merged.push(candidate);
      return merged;
    }

    ITEM_MERGE_FIELDS.forEach((field) => {
      if (!existing[field] && candidate[field]) {
        (existing as unknown as Record<string, unknown>)[field] = candidate[field];
      }
    });
    existing.sourceDocumentIds = Array.from(new Set([
      ...existing.sourceDocumentIds,
      ...candidate.sourceDocumentIds,
    ]));
    return merged;
  }, []);
}

export function normalizeImportExtractedFields(value: unknown): ImportExtractedFields {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  let items = Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [];
  items = mergeCrossDocumentItems(items);
  if (
    items.length === 0
    && [raw.productDescription, raw.quantity, raw.originCountry].some((entry) => text(entry))
  ) {
    items = [normalizeItem({
      description: raw.productDescription,
      quantity: raw.quantity,
      originCountry: raw.originCountry,
      currency: raw.currency,
      amount: raw.totalAmount,
    }, 0)];
  }

  const exporterDetails = normalizeParty(raw.exporterDetails, text(raw.shipper));
  const importerDetails = normalizeParty(raw.importerDetails, text(raw.importer));
  const consigneeDetails = normalizeParty(raw.consigneeDetails, text(raw.consignee));
  const notifyPartyDetails = normalizeParty(raw.notifyPartyDetails, text(raw.notifyParty));
  const firstItem = items[0];
  const containerNumbers = textArray(raw.containerNumbers).length
    ? textArray(raw.containerNumbers)
    : textArray(raw.containerNo);
  const sealNumbers = textArray(raw.sealNumbers).length ? textArray(raw.sealNumbers) : textArray(raw.sealNo);

  return {
    shipper: exporterDetails.name,
    consignee: consigneeDetails.name,
    notifyParty: notifyPartyDetails.name,
    importer: importerDetails.name,
    invoiceNo: text(raw.invoiceNo),
    productDescription: firstItem?.description || text(raw.productDescription),
    quantity: firstItem?.quantity || text(raw.quantity),
    grossWeight: text(raw.grossWeight),
    netWeight: text(raw.netWeight),
    originCountry: firstItem?.originCountry || text(raw.originCountry),
    destinationCountry: text(raw.destinationCountry),
    currency: text(raw.currency) || firstItem?.currency || '',
    totalAmount: text(raw.totalAmount),
    loadPort: text(raw.loadPort),
    dischargePort: text(raw.dischargePort),
    blNo: text(raw.blNo),
    containerNo: containerNumbers.join(', '),
    sealNo: sealNumbers.join(', '),
    vesselName: text(raw.vesselName),
    voyageNo: text(raw.voyageNo),
    exportDeclarationNo: text(raw.exportDeclarationNo),
    loadingMode: text(raw.loadingMode).toUpperCase(),
    measurement: text(raw.measurement),
    shippingMarks: text(raw.shippingMarks),
    exporterDetails,
    importerDetails,
    consigneeDetails,
    notifyPartyDetails,
    invoiceDate: text(raw.invoiceDate),
    incoterms: text(raw.incoterms),
    paymentTerms: text(raw.paymentTerms),
    shipmentDate: text(raw.shipmentDate),
    estimatedArrivalDate: text(raw.estimatedArrivalDate),
    containerNumbers,
    sealNumbers,
    items,
    cargoTotals: {
      numberOfPackages: text((raw.cargoTotals as Record<string, unknown> | undefined)?.numberOfPackages)
        || text(raw.totalPackageCount),
      grossWeight: text((raw.cargoTotals as Record<string, unknown> | undefined)?.grossWeight)
        || text(raw.grossWeight),
      measurement: text((raw.cargoTotals as Record<string, unknown> | undefined)?.measurement)
        || text(raw.measurement),
    },
    certificateOfOriginAvailable: raw.certificateOfOriginAvailable === true,
    totalPackageCount: text(raw.totalPackageCount),
    packageUnit: text(raw.packageUnit),
    grossWeightUnit: text(raw.grossWeightUnit),
    netWeightUnit: text(raw.netWeightUnit),
    freight: text(raw.freight),
    insurance: text(raw.insurance),
    otherAdditions: text(raw.otherAdditions),
  };
}

export function normalizeImportAnalysisResult(value: unknown): ImportAnalysisResult {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    extracted: normalizeImportExtractedFields(raw.extracted),
    validations: Array.isArray(raw.validations) ? raw.validations as ImportAnalysisResult['validations'] : [],
    comparison: Array.isArray(raw.comparison) ? raw.comparison as ImportAnalysisResult['comparison'] : [],
  };
}

export function syncLegacyImportFields(fields: ImportExtractedFields): ImportExtractedFields {
  const firstItem = fields.items[0];
  return {
    ...fields,
    shipper: fields.exporterDetails.name,
    importer: fields.importerDetails.name,
    consignee: fields.consigneeDetails.name,
    notifyParty: fields.notifyPartyDetails.name,
    productDescription: firstItem?.description || '',
    quantity: firstItem?.quantity || '',
    originCountry: firstItem?.originCountry || '',
    containerNo: fields.containerNumbers.join(', '),
    sealNo: fields.sealNumbers.join(', '),
  };
}

function resolveMimeType(file: File): string {
  if (ALLOWED_MIME_TYPES.has(file.type)) return file.type;
  if (/\.pdf$/i.test(file.name)) return 'application/pdf';
  if (/\.png$/i.test(file.name)) return 'image/png';
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg';
  return file.type;
}

export async function classifyImportDocument(file: File): Promise<ImportDocumentType> {
  return classifyImportDocumentName(file.name);
}

function readFileAsDataUrl(file: File, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`${file.name} 파일을 읽지 못했습니다.`));
        return;
      }
      resolve(`data:${mimeType};base64,${reader.result.slice(reader.result.indexOf(',') + 1)}`);
    };
    reader.onerror = () => reject(new Error(`${file.name} 파일을 읽는 중 오류가 발생했습니다.`));
    reader.readAsDataURL(file);
  });
}

export interface ImportAnalysisRequestDocument {
  id: string;
  fileName: string;
  mimeType: string;
  documentType: ImportDocumentType;
  dataUrl: string;
}

export async function buildImportAnalysisRequestDocuments(
  documents: ImportDocumentMeta[],
  filesById: Record<string, File>,
): Promise<ImportAnalysisRequestDocument[]> {
  if (documents.length === 0) throw new Error('분석할 파일을 먼저 업로드해 주세요.');

  const files = documents.map((document) => {
    const file = filesById[document.id];
    if (!file) throw new Error(`${document.name} 원본 파일이 없습니다. 새로고침했다면 파일을 다시 선택해 주세요.`);
    const mimeType = resolveMimeType(file);
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error(`${file.name}은 지원하지 않는 파일 형식입니다.`);
    if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name}은 10MB를 초과합니다.`);
    return { document, file, mimeType };
  });

  if (files.reduce((total, item) => total + item.file.size, 0) > MAX_TOTAL_SIZE) {
    throw new Error('분석할 파일의 전체 크기는 25MB 이하여야 합니다.');
  }

  return Promise.all(files.map(async ({ document, file, mimeType }) => ({
    id: document.id,
    fileName: file.name,
    mimeType,
    documentType: document.type,
    dataUrl: await readFileAsDataUrl(file, mimeType),
  })));
}

export async function analyzeImportDocuments(
  documents: ImportDocumentMeta[],
  filesById: Record<string, File>,
): Promise<ImportDocumentAnalysisResponse> {
  const totalStartedAt = performance.now();
  const preprocessingStartedAt = performance.now();
  const payload = await buildImportAnalysisRequestDocuments(documents, filesById);
  const preprocessingMs = performance.now() - preprocessingStartedAt;

  if (import.meta.env.DEV) {
    console.debug('[Export Forwarder Analysis] AI request started', {
      documents: payload.map(({ id, documentType, mimeType, dataUrl }) => ({
        id,
        documentType,
        mimeType,
        inputBytesApprox: Math.floor(dataUrl.length * 0.75),
      })),
    });
  }

  const edgeStartedAt = performance.now();
  const { data, error } = await supabase.functions.invoke('import-document-analysis', {
    body: { documents: payload },
  });
  const edgeMs = performance.now() - edgeStartedAt;

  if (error) {
    if (import.meta.env.DEV) {
      console.error('[Export Forwarder Analysis] Edge request failed', {
        stage: 'edge_request',
        message: error.message,
        documentTypes: payload.map(({ documentType }) => documentType),
      });
    }
    throw new Error(`AI 문서 분석 요청에 실패했습니다: ${error.message}`);
  }
  if (!data?.success || !data?.analysis) {
    if (import.meta.env.DEV) {
      console.error('[Export Forwarder Analysis] invalid Edge response', {
        stage: 'edge_response',
        message: typeof data?.error === 'string' ? data.error : 'invalid response shape',
        documentTypes: payload.map(({ documentType }) => documentType),
      });
    }
    throw new Error(typeof data?.error === 'string' ? data.error : 'AI 문서 분석 응답이 올바르지 않습니다.');
  }

  const responseParseStartedAt = performance.now();
  const response: ImportDocumentAnalysisResponse = {
    analysis: normalizeImportAnalysisResult(data.analysis),
    classifications: Array.isArray(data.classifications) ? data.classifications : [],
    source: 'openai',
    model: typeof data.model === 'string' ? data.model : 'unknown',
    timing: data.timing && typeof data.timing === 'object'
      ? data.timing as ImportDocumentAnalysisResponse['timing']
      : undefined,
  };
  const responseParseMs = performance.now() - responseParseStartedAt;

  if (import.meta.env.DEV) {
    console.debug('[Export Forwarder Analysis] parsed and normalized result', {
      classifications: response.classifications.map(({ id, type, confidence }) => ({ id, type, confidence })),
      extractedFieldCount: Object.values(response.analysis.extracted)
        .filter((value) => Array.isArray(value) ? value.length > 0 : Boolean(value)).length,
    });
    console.debug('[Import Document Analysis] timing', {
      documentCount: documents.length,
      inputBytes: payload.reduce((total, document) => total + filesById[document.id].size, 0),
      preprocessingMs: Math.round(preprocessingMs),
      edgeRequestMs: Math.round(edgeMs),
      responseParseMs: Math.round(responseParseMs),
      totalMs: Math.round(performance.now() - totalStartedAt),
      edge: response.timing,
    });
  }

  return response;
}
