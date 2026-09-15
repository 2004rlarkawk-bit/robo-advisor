/**
 * 수입 서류 불일치에서 화주가 "맞는 값"을 고른 결과를 다룬다.
 *
 * 해외에서 받은 C/I·P/L·B/L 원본 자체는 앱에서 고칠 수 없으므로,
 * 화주가 확인한 값을 analysis.chosenValues 에 남기고
 *  - 서류 대사 규칙(IR)은 그 필드를 모든 서류가 같은 값으로 가진 것으로 보고,
 *  - 같은 필드의 AI 검증 항목은 해결된 것으로 보며,
 *  - 추출 결과(extracted)에도 그 값을 넣어 세액·의뢰서가 같은 값을 쓰게 한다.
 */
import type {
  ImportAnalysisResult,
  ImportExtractedFields,
  ImportRiskFixTarget,
} from '../types/importTrade';
import { syncLegacyImportFields } from './importDocumentAnalysisService';
import { parseTradeNumber } from '../utils/number';

export type ChoiceDocKey =
  | 'productDescription' | 'quantity' | 'packageCount' | 'grossWeight' | 'netWeight'
  | 'originCountry' | 'loadPort' | 'dischargePort' | 'consignee'
  | 'incoterms' | 'currency' | 'totalAmount';

const FIELD_PREFIX = 'field:';
const VALIDATION_PREFIX = 'validation:';

export const CHOICE_FIELD_LABEL: Record<ChoiceDocKey, string> = {
  productDescription: '품명',
  quantity: '수량',
  packageCount: '포장 수량',
  grossWeight: '총중량',
  netWeight: '순중량',
  originCountry: '원산지',
  loadPort: '선적항',
  dischargePort: '도착항',
  consignee: 'Consignee',
  incoterms: 'Incoterms',
  currency: '통화',
  totalAmount: 'Invoice 총금액',
};

const NUMERIC_KEYS = new Set<ChoiceDocKey>(['quantity', 'packageCount', 'grossWeight', 'netWeight', 'totalAmount']);

/** 서류 간 같은 값이어야 하는 규칙만 "맞는 값 고르기"를 제공한다. */
export const RULE_CHOICE_KEYS: Record<string, ChoiceDocKey[]> = {
  IR1: ['productDescription'],
  IR2: ['quantity'],
  IR3: ['grossWeight'],
  IR5: ['packageCount'],
  IR11: ['originCountry'],
  IR12: ['loadPort', 'dischargePort'],
  IR13: ['consignee'],
};

/** AI 검증 항목의 필드 이름 → 서류 대사 필드. 겹치면 한 번 고른 값으로 둘 다 해결된다. */
const VALIDATION_DOC_KEY: Record<string, ChoiceDocKey> = {
  description: 'productDescription',
  productdescription: 'productDescription',
  goodsdescription: 'productDescription',
  quantity: 'quantity',
  packagecount: 'packageCount',
  numberofpackages: 'packageCount',
  grossweight: 'grossWeight',
  netweight: 'netWeight',
  origincountry: 'originCountry',
  countryoforigin: 'originCountry',
  portofloading: 'loadPort',
  loadport: 'loadPort',
  portofdischarge: 'dischargePort',
  dischargeport: 'dischargePort',
  consignee: 'consignee',
};

/** 서류 대사 필드가 없는 AI 검증 항목도, 추출 결과의 한 칸에 대응하면 그 칸에 값을 넣는다. */
const VALIDATION_EXTRACTED_KEY: Record<string, keyof ImportExtractedFields> = {
  invoicenumber: 'invoiceNo',
  invoiceno: 'invoiceNo',
  invoicedate: 'invoiceDate',
  currency: 'currency',
  totalamount: 'totalAmount',
  invoicetotal: 'totalAmount',
  incoterms: 'incoterms',
  vesselname: 'vesselName',
  blnumber: 'blNo',
  blno: 'blNo',
};

const normalizeFieldName = (field: string) => field.replace(/[^a-zA-Z]/g, '').toLowerCase();

export function validationDocKey(field: string): ChoiceDocKey | undefined {
  return VALIDATION_DOC_KEY[normalizeFieldName(field)];
}

export const fieldChoiceKey = (key: ChoiceDocKey) => `${FIELD_PREFIX}${key}`;
export const validationChoiceKey = (validationId: string) => `${VALIDATION_PREFIX}${validationId}`;

/** AI 검증 항목에서 값을 고를 때 쓸 키 — 서류 대사 필드가 있으면 그 필드로 묶는다. */
export function choiceKeyForValidation(validation: { id: string; field: string }): string {
  const docKey = validationDocKey(validation.field);
  return docKey ? fieldChoiceKey(docKey) : validationChoiceKey(validation.id);
}

/** chosenValues 중 서류 대사 필드에 해당하는 값만 꺼낸다. */
export function chosenDocFields(analysis: ImportAnalysisResult): Partial<Record<ChoiceDocKey, string>> {
  const result: Partial<Record<ChoiceDocKey, string>> = {};
  Object.entries(analysis.chosenValues ?? {}).forEach(([key, value]) => {
    if (!key.startsWith(FIELD_PREFIX) || !value.trim()) return;
    const docKey = key.slice(FIELD_PREFIX.length) as ChoiceDocKey;
    if (docKey in CHOICE_FIELD_LABEL) result[docKey] = value.trim();
  });
  return result;
}

export function isValidationChosen(analysis: ImportAnalysisResult, validation: { id: string; field: string }): boolean {
  const chosen = analysis.chosenValues ?? {};
  if (chosen[validationChoiceKey(validation.id)]?.trim()) return true;
  const docKey = validationDocKey(validation.field);
  return Boolean(docKey && chosen[fieldChoiceKey(docKey)]?.trim());
}

/** 사람이 읽는 라벨 — 카드 위 "직접 고른 값" 목록에 쓴다. */
export function choiceLabel(key: string, analysis: ImportAnalysisResult): string {
  if (key.startsWith(FIELD_PREFIX)) {
    return CHOICE_FIELD_LABEL[key.slice(FIELD_PREFIX.length) as ChoiceDocKey] ?? key;
  }
  const id = key.slice(VALIDATION_PREFIX.length);
  const field = analysis.validations.find((validation) => validation.id === id)?.field ?? id;
  return field.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** 추출 결과에서 서류 대사 필드에 해당하는 현재 값 — 직접 편집 감지용. */
export function docFieldsFromExtracted(extracted: ImportExtractedFields): Record<ChoiceDocKey, string> {
  const first = extracted.items[0];
  return {
    productDescription: first?.description ?? '',
    quantity: first?.quantity ?? '',
    packageCount: extracted.totalPackageCount ?? '',
    grossWeight: extracted.grossWeight ?? '',
    netWeight: extracted.netWeight ?? '',
    originCountry: first?.originCountry ?? '',
    loadPort: extracted.loadPort ?? '',
    dischargePort: extracted.dischargePort ?? '',
    consignee: extracted.consigneeDetails?.name ?? '',
    incoterms: extracted.incoterms ?? '',
    currency: extracted.currency ?? '',
    totalAmount: extracted.totalAmount ?? '',
  };
}

function normalizeChoiceValue(key: ChoiceDocKey, value: string): string {
  const trimmed = value.trim();
  if (!NUMERIC_KEYS.has(key)) return trimmed;
  const number = parseTradeNumber(trimmed);
  return number == null ? trimmed : String(number);
}

function applyDocFieldToExtracted(extracted: ImportExtractedFields, key: ChoiceDocKey, value: string): ImportExtractedFields {
  const next: ImportExtractedFields = { ...extracted };
  const withFirstItem = (patch: Partial<ImportExtractedFields['items'][number]>) => {
    if (!next.items.length) return;
    next.items = next.items.map((item, index) => (index === 0 ? { ...item, ...patch } : item));
  };
  switch (key) {
    case 'productDescription': withFirstItem({ description: value }); break;
    case 'quantity': withFirstItem({ quantity: value }); break;
    case 'originCountry': withFirstItem({ originCountry: value }); break;
    case 'packageCount':
      next.totalPackageCount = value;
      next.cargoTotals = { ...next.cargoTotals, numberOfPackages: value };
      break;
    case 'grossWeight':
      next.grossWeight = value;
      next.cargoTotals = { ...next.cargoTotals, grossWeight: value };
      break;
    case 'netWeight': next.netWeight = value; break;
    case 'loadPort': next.loadPort = value; break;
    case 'dischargePort': next.dischargePort = value; break;
    case 'consignee': next.consigneeDetails = { ...next.consigneeDetails, name: value }; break;
    case 'incoterms': next.incoterms = value.toUpperCase(); break;
    case 'currency': next.currency = value.toUpperCase(); break;
    case 'totalAmount': next.totalAmount = value; break;
  }
  return syncLegacyImportFields(next);
}

/** 화주가 맞는 값을 골랐다 — chosenValues 에 남기고 추출 결과에도 반영한다. */
export function applyChosenValue(analysis: ImportAnalysisResult, key: string, rawValue: string): ImportAnalysisResult {
  const value = rawValue.trim();
  if (!value) return analysis;
  let extracted = analysis.extracted;
  let stored = value;
  if (key.startsWith(FIELD_PREFIX)) {
    const docKey = key.slice(FIELD_PREFIX.length) as ChoiceDocKey;
    stored = normalizeChoiceValue(docKey, value);
    extracted = applyDocFieldToExtracted(extracted, docKey, stored);
  } else if (key.startsWith(VALIDATION_PREFIX)) {
    const id = key.slice(VALIDATION_PREFIX.length);
    const field = analysis.validations.find((validation) => validation.id === id)?.field ?? '';
    const extractedKey = VALIDATION_EXTRACTED_KEY[normalizeFieldName(field)];
    if (extractedKey && typeof extracted[extractedKey] === 'string') {
      extracted = { ...extracted, [extractedKey]: value };
    }
  }
  return { ...analysis, extracted, chosenValues: { ...(analysis.chosenValues ?? {}), [key]: stored } };
}

/** 고른 값을 되돌린다 — 추출 결과는 사용자가 이미 본 값이므로 그대로 두고 경고만 다시 살린다. */
export function clearChosenValue(analysis: ImportAnalysisResult, key: string): ImportAnalysisResult {
  const next = { ...(analysis.chosenValues ?? {}) };
  delete next[key];
  return { ...analysis, chosenValues: next };
}

/**
 * 분석 결과 표에서 직접 고친 값도 "화주가 확인한 값"으로 본다.
 * 서류 대사 필드에 해당하는 칸이 바뀌었으면 chosenValues 에 그 값을 남겨 경고가 다시 계산되게 한다.
 */
export function mergeEditedChoices(
  analysis: ImportAnalysisResult,
  nextExtracted: ImportExtractedFields,
): ImportAnalysisResult {
  const before = docFieldsFromExtracted(analysis.extracted);
  const after = docFieldsFromExtracted(nextExtracted);
  const chosenValues = { ...(analysis.chosenValues ?? {}) };
  (Object.keys(after) as ChoiceDocKey[]).forEach((key) => {
    if (before[key] === after[key]) return;
    const value = after[key].trim();
    if (value) chosenValues[fieldChoiceKey(key)] = normalizeChoiceValue(key, value);
    else delete chosenValues[fieldChoiceKey(key)];
  });
  return { ...analysis, extracted: nextExtracted, chosenValues };
}

/** 카드 안에서 고친 값을 분석 결과에 반영한다 — 반영되면 경고 목록이 다시 계산된다. */
export function applyRiskFix(analysis: ImportAnalysisResult, target: ImportRiskFixTarget, rawValue: string): ImportAnalysisResult {
  const value = rawValue.trim();
  if (!value) return analysis;
  if (target.type === 'choice') {
    const key = target.key;
    const docKey = key.startsWith(FIELD_PREFIX) ? key.slice(FIELD_PREFIX.length) : '';
    const stored = docKey === 'incoterms' || docKey === 'currency' ? value.toUpperCase() : value;
    return applyChosenValue(analysis, key, stored);
  }
  if (target.type === 'importer') {
    return {
      ...analysis,
      extracted: syncLegacyImportFields({
        ...analysis.extracted,
        importerDetails: { ...analysis.extracted.importerDetails, name: value },
      }),
    };
  }
  return {
    ...analysis,
    extracted: syncLegacyImportFields({
      ...analysis.extracted,
      items: analysis.extracted.items.map((item) => (item.id === target.itemId ? { ...item, originCountry: value } : item)),
    }),
  };
}
