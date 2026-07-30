import { supabase } from '../lib/supabase';
import type {
  ImportAnalysisResult,
  ImportDocumentAnalysisResponse,
  ImportDocumentMeta,
  ImportDocumentType,
  ImportExtractedFields,
  ImportHSCodeSuggestion,
  ImportItem,
  ImportParty,
} from '../types/importTrade';

const TYPE_HINTS: Array<[RegExp, ImportDocumentType]> = [
  [/(commercial.?invoice|invoice|c[._ -]?i)/i, 'commercial_invoice'],
  [/(packing.?list|packing|p[._ -]?l)/i, 'packing_list'],
  [/(bill.?of.?lading|lading|b[._ -]?l)/i, 'bill_of_lading'],
  [/(certificate.?of.?origin|origin.?certificate|c[._ -]?o)/i, 'certificate_of_origin'],
];

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
    description: text(item.description),
    koreanDescription: text(item.koreanDescription),
    documentHSCode: text(item.documentHSCode ?? item.hsCode),
    confirmedHSCode: text(item.confirmedHSCode),
    modelName: text(item.modelName),
    specification: text(item.specification),
    material: text(item.material),
    composition: text(item.composition),
    intendedUse: text(item.intendedUse ?? item.use),
    originCountry: text(item.originCountry),
    quantity: text(item.quantity),
    quantityUnit: text(item.quantityUnit),
    unitPrice: text(item.unitPrice),
    currency: text(item.currency),
    amount: text(item.amount),
    sourceDocumentIds: textArray(item.sourceDocumentIds),
  };
}

export function normalizeImportExtractedFields(value: unknown): ImportExtractedFields {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  let items = Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [];
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
  return TYPE_HINTS.find(([pattern]) => pattern.test(file.name))?.[1] ?? 'other';
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
  const payload = await buildImportAnalysisRequestDocuments(documents, filesById);

  const { data, error } = await supabase.functions.invoke('import-document-analysis', {
    body: { documents: payload },
  });

  if (error) throw new Error(`AI 문서 분석 요청에 실패했습니다: ${error.message}`);
  if (!data?.success || !data?.analysis) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'AI 문서 분석 응답이 올바르지 않습니다.');
  }

  const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : []).map(
    (suggestion: ImportHSCodeSuggestion) => ({
      ...suggestion,
      source: 'ai_recommendation' as const,
      missingInformation: Array.isArray(suggestion.missingInformation)
        ? suggestion.missingInformation
        : [],
    }),
  );

  return {
    analysis: normalizeImportAnalysisResult(data.analysis),
    classifications: Array.isArray(data.classifications) ? data.classifications : [],
    suggestions,
    source: 'openai',
    model: typeof data.model === 'string' ? data.model : 'unknown',
  };
}
