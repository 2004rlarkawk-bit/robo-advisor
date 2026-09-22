import { CO_HOLDING_KEY, FTA_CHOICE_KEY, isFtaReviewChoice } from '../types/importTrade';
import type {
  ImportAnalysisResult,
  ImportDocumentMeta,
  ImportDocumentType,
  ImportHSCodeSuggestion,
  ImportRisk,
  ImportRiskFix,
  ImportRiskPickGroup,
  ImportReconciliationInput,
  UserTradeRole,
} from '../types/importTrade';
import { buildReconciliationInput, runImportReconciliation } from './importReconciliationEngine';
import { STANDARD_INCOTERMS } from './importReconciliationRules';
import {
  CHOICE_FIELD_LABEL,
  RULE_CHOICE_KEYS,
  choiceKeyForValidation,
  fieldChoiceKey,
  isValidationChosen,
  validationDocKey,
} from './importValueChoiceService';
import { parseTradeNumber } from '../utils/number';

const DOC_LABEL: Record<ImportDocumentType, string> = {
  commercial_invoice: 'Commercial Invoice',
  packing_list: 'Packing List',
  bill_of_lading: 'Bill of Lading',
  certificate_of_origin: 'Certificate of Origin',
  transport_request: 'Export Transport Request',
  export_declaration: 'Export Declaration',
  insurance_policy: 'Insurance Policy',
  other: '기타서류',
  unknown: '기타서류',
};
const numberValue = (value: string): number => parseTradeNumber(value) ?? 0;
const SHORT_DOC_LABEL: Partial<Record<ImportDocumentType, string>> = {
  commercial_invoice: 'C/I', packing_list: 'P/L', bill_of_lading: 'B/L',
  certificate_of_origin: 'C/O', insurance_policy: '보험증권',
};

const INCOTERMS_OPTIONS = [...STANDARD_INCOTERMS];
const incotermsFix: ImportRiskFix = { kind: 'value', label: 'Incoterms 고르기', target: { type: 'choice', key: fieldChoiceKey('incoterms') }, options: INCOTERMS_OPTIONS };
const totalAmountFix = (choices?: Array<{ source: string; value: string }>): ImportRiskFix => ({
  kind: 'value', label: 'Invoice 총금액 입력', target: { type: 'choice', key: fieldChoiceKey('totalAmount') }, placeholder: '숫자만', ...(choices?.length ? { choices } : {}),
});
const weightFixes: ImportRiskFix[] = [
  { kind: 'value', label: '순중량(kg) 입력', target: { type: 'choice', key: fieldChoiceKey('netWeight') }, placeholder: '숫자만' },
  { kind: 'value', label: '총중량(kg) 입력', target: { type: 'choice', key: fieldChoiceKey('grossWeight') }, placeholder: '숫자만' },
];

/** 서류 대사 규칙별로 카드 안에서 고칠 방법 */
function ruleFixes(ruleId: string, analysis: ImportAnalysisResult): ImportRiskFix[] {
  const firstItemId = analysis.extracted.items[0]?.id;
  switch (ruleId) {
    case 'IR4': return weightFixes;
    case 'IR6': return [totalAmountFix()];
    case 'IR7': return [{ kind: 'value', label: '통화 입력', target: { type: 'choice', key: fieldChoiceKey('currency') }, placeholder: 'USD' }];
    case 'IR8': return firstItemId ? [{ kind: 'hs', itemId: firstItemId }] : [];
    case 'IR9': return [incotermsFix];
    case 'IR10': return [{ kind: 'upload' }];
    default: return [];
  }
}

/** 같은 값이 여러 서류에 적혀 있으면 한 번만 보여준다(표기만 같은 경우). */
function uniqueChoices(choices: Array<{ source: string; value: string }>) {
  const seen = new Map<string, { source: string; value: string }>();
  choices.forEach((choice) => {
    const key = choice.value.trim().toLowerCase();
    const found = seen.get(key);
    if (found) found.source = `${found.source}·${choice.source}`;
    else seen.set(key, { ...choice });
  });
  return [...seen.values()];
}

/**
 * LLM 검증이 넘겨주는 영문 필드 키 → 사용자용 한글 제목.
 * 목록에 없는 키는 camelCase를 띄어쓰기로 풀어 표기한다 (raw 키 노출 방지).
 */
const FIELD_TITLE: Record<string, string> = {
  weightclassification: '중량 표기 방식 불일치',
  billofladingstatus: 'B/L 문구 확인 필요',
  importer: 'Importer 정보 불일치',
  consignee: 'Consignee 정보 불일치',
  shipper: 'Shipper 정보 불일치',
  invoicenumber: 'Invoice 번호 불일치',
  invoicedate: 'Invoice 날짜 불일치',
  totalamount: 'Invoice 총금액 불일치',
  invoicetotal: 'Invoice 총금액 불일치',
  currency: '통화 표기 불일치',
  hscode: 'HS Code 불일치',
  incoterms: 'Incoterms 불일치',
  portofloading: '선적항 불일치',
  portofdischarge: '도착항 불일치',
  netweight: '순중량 불일치',
  grossweight: '총중량 불일치',
  packagecount: '포장 수량 불일치',
  packageunit: '포장 단위 불일치',
  sealnumber: 'Seal 번호 불일치',
  containernumber: '컨테이너 번호 불일치',
  origincountry: '원산지 표기 불일치',
  description: '품명 표기 불일치',
  vesselname: '선박명 불일치',
  quantity: '수량 표기 불일치',
};

function titleForField(field: string): string {
  const known = FIELD_TITLE[field.replace(/[^a-zA-Z]/g, '').toLowerCase()];
  if (known) return known;
  if (/[가-힣]/.test(field)) return field; // 이미 한글 제목이면 그대로
  // camelCase → "Weight Classification" 식으로 풀어서라도 raw 키 노출은 막는다
  const spaced = field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 수입신고에 직접 영향을 주는 값만 화주에게 확인시킨다.
 * 회사명·주소·연락처·Invoice 번호·컨테이너/Seal·선박명처럼 신고 금액이나 세액을 바꾸지 않는
 * 표기 차이는 목록에서 제외한다.
 */
const CORE_VALIDATION_FIELDS = [
  'description', 'productdescription', 'goods', 'commodity', 'item', '품명', '품목',
  'quantity', 'qty', '수량',
  'amount', 'total', 'unitprice', 'price', 'value', 'currency', '금액', '단가', '통화',
  'weight', '중량',
  'origin', '원산지',
  'hscode', 'hsk', 'hs',
  'incoterms', '인코텀',
];

/** LLM 검증 항목이 신고에 영향을 주는 핵심 값인지 판단한다. */
function isCoreValidationField(field: string): boolean {
  const normalized = field.replace(/[^a-zA-Z가-힣]/g, '').toLowerCase();
  if (!normalized) return false;
  // 포장 수량(packageCount)·포장 단위는 '수량'이 아니라 포장 정보라 제외한다.
  if (/package|포장/.test(normalized)) return false;
  return CORE_VALIDATION_FIELDS.some((core) => normalized.includes(core));
}

/**
 * 화주 수입 화면에 띄울 서류 대사 규칙 — 신고 항목에 직접 영향을 주는 것만 남긴다.
 * 제외: IR5(포장 수량), IR12(선적항·도착항), IR13(Consignee), IR14(보험금액).
 */
const CORE_RULE_IDS = new Set(['IR1', 'IR2', 'IR3', 'IR4', 'IR6', 'IR7', 'IR8', 'IR9', 'IR10', 'IR11']);

function recommendationFor(field: string): string {
  const normalized = field.toLowerCase();
  if (normalized.includes('package') || normalized.includes('포장')) return 'C/I와 P/L의 포장 단위·수량을 대조하고 실제 선적 수량으로 확정하세요.';
  if (normalized.includes('weight') || normalized.includes('중량')) return 'P/L과 B/L의 순중량·총중량을 대조하고 운송인 확인값을 반영하세요.';
  if (normalized.includes('origin') || normalized.includes('원산지')) return 'C/O를 우선 확인하고 품목별 원산지와 증명서 적용 범위를 확정하세요.';
  if (normalized.includes('consignee')) return 'C/I와 B/L의 Consignee가 동일한 법인인지 주소까지 확인하세요.';
  if (normalized.includes('invoice')) return 'Invoice 원본의 번호·금액·통화를 다시 확인하고 품목 합계와 일치시키세요.';
  if (normalized.includes('container')) return 'B/L 및 선사 반출입 자료의 컨테이너 번호를 대조하세요.';
  if (normalized.includes('seal')) return 'B/L과 Packing List의 Seal 번호를 대조하고 현물 봉인번호를 확인하세요.';
  if (normalized.includes('hs')) return '품명·재질·용도·규격을 보완한 뒤 후보를 검토하고 사용자가 최종 HS Code를 확정하세요.';
  return '표시된 출처 문서의 서로 다른 값을 대조하고 확인된 최종값으로 수정하세요.';
}

/**
 * 영상 시연용 고정 리스크.
 * 업로드한 파일 내용과 무관하게 항상 동일한 3건(반드시 수정 1 · 확인 권장 2)을 노출한다.
 * 시연이 끝나면 DEMO_FIXED_IMPORT_RISKS 를 false 로 바꾸면 실제 분석 결과가 그대로 표시된다.
 */
export const DEMO_FIXED_IMPORT_RISKS = false;

const DEMO_IMPORT_RISKS: ImportRisk[] = [
  {
    id: 'demo-quantity-mismatch',
    level: 'high',
    item: '수량 표기 불일치',
    cause: '상업송장에는 100 EA, 포장명세서에는 110 EA로 기재되어 수량이 일치하지 않습니다.',
    recommendation: 'C/I와 P/L의 포장 단위·수량을 대조하고 실제 선적 수량으로 확정하세요.',
    relatedDocuments: ['Commercial Invoice', 'Packing List'],
    differentValues: ['상업송장: 100 EA', '포장명세서: 110 EA'],
    status: 'unresolved',
  },
  {
    id: 'demo-shipping-marks',
    level: 'medium',
    item: 'Shipping Marks',
    cause: "선하증권의 Marks & No.에는 상업송장 및 포장명세서에 기재된 'MADE IN KOREA'가 없습니다.",
    recommendation: 'B/L의 Marks & No.와 C/I·P/L의 화인을 대조하고 운송인에게 정정을 요청하세요.',
    relatedDocuments: ['Commercial Invoice', 'Packing List', 'Bill of Lading'],
    differentValues: [
      '상업송장: DEMO CASHMERE / LOS ANGELES / C/T 1-10 / MADE IN KOREA',
      '포장명세서: DEMO CASHMERE / LOS ANGELES / C/T 1-10 / MADE IN KOREA',
      '선하증권: DEMO CASHMERE / LOS ANGELES / C/T 1-10',
    ],
    status: 'unresolved',
  },
  {
    id: 'demo-missing-co',
    level: 'medium',
    item: '원산지증명서 누락',
    cause: 'Certificate of Origin이 첨부되지 않아 협정세율 적용 여부를 확인할 수 없습니다.',
    recommendation: 'FTA 적용을 검토하려면 협정 요건에 맞는 C/O를 수출자에게 요청하세요.',
    relatedDocuments: ['Certificate of Origin'],
    status: 'unresolved',
  },
];

/**
 * 화면에 표시할 리스크를 결정한다.
 * 시연 플래그가 꺼지면 assessImportRisks 의 실제 분석 결과를 그대로 사용한다.
 */
export function resolveImportRisks(
  documents: ImportDocumentMeta[],
  analysis: ImportAnalysisResult,
  suggestions: ImportHSCodeSuggestion[] = [],
  dutyError = '',
  reconciliationInput?: ImportReconciliationInput,
  role: UserTradeRole = 'shipper',
): ImportRisk[] {
  if (DEMO_FIXED_IMPORT_RISKS) return DEMO_IMPORT_RISKS.map((risk) => ({ ...risk }));
  const presentTypes = documents.map((document) => document.type);
  const input = reconciliationInput ?? buildReconciliationInput(analysis, presentTypes);
  const reconciliation = runImportReconciliation(input);
  const chosen = analysis.chosenValues ?? {};
  // 화주가 맞는 값을 고른 뒤에도 카드는 남긴다 — 고르기 전 원본 값으로 불일치를 찾고,
  // 고른 값은 눌린 버튼으로 보여준다(해결된 카드로 취급).
  const hasFieldChoice = !reconciliationInput && Object.keys(chosen).some((key) => key.startsWith('field:'));
  const originalInput = hasFieldChoice
    ? buildReconciliationInput({ ...analysis, chosenValues: undefined }, presentTypes)
    : input;
  const originalFails = new Map(hasFieldChoice
    ? runImportReconciliation(originalInput).filter((result) => result.status === 'fail').map((result) => [result.ruleId, result] as const)
    : []);
  const ruleRisks: ImportRisk[] = reconciliation
    // 화주에게는 신고 항목에 직접 영향을 주는 규칙만 보여준다(포워더는 전체 규칙 그대로).
    .filter((result) => role !== 'shipper' || CORE_RULE_IDS.has(result.ruleId))
    .filter((result) => result.status === 'fail' || originalFails.has(result.ruleId))
    .flatMap((current) => {
      const stillFails = current.status === 'fail';
      const result = stillFails ? current : originalFails.get(current.ruleId)!;
      // 서류마다 같아야 하는 값이면, 서류별 값을 보여주고 맞는 값을 고르게 한다.
      const pickGroups: ImportRiskPickGroup[] = (RULE_CHOICE_KEYS[result.ruleId] ?? [])
        .map((key) => {
          const selected = chosen[fieldChoiceKey(key)]?.trim();
          return {
            key: fieldChoiceKey(key),
            label: CHOICE_FIELD_LABEL[key],
            choices: uniqueChoices(result.documents
              .map((type) => ({ source: SHORT_DOC_LABEL[type] ?? type, value: (originalInput[type]?.[key] ?? '').trim() }))
              .filter((choice) => choice.value)),
            ...(selected ? { selected } : {}),
          };
        })
        .filter((group) => group.choices.length >= 2);
      const isChosen = !stillFails && pickGroups.some((group) => group.selected);
      // 고른 값 없이 다른 수정으로 해소된 규칙은 목록에서 뺀다.
      if (!stillFails && !isChosen) return [];
      // 서류에 HS CODE가 없어도(IR8) G 섹션에서 모든 품목의 HSK를 확정했으면 해결된 카드로 남긴다.
      const confirmedCodes = result.ruleId === 'IR8'
        ? analysis.extracted.items.map((item) => item.confirmedHSCode?.trim()).filter(Boolean)
        : [];
      const hsConfirmed = confirmedCodes.length > 0 && confirmedCodes.length === analysis.extracted.items.length;
      const resolved = isChosen || hsConfirmed;
      return [{
        id: `reconcile-${result.ruleId}`,
        level: result.severity === 'error' ? 'high' : 'medium',
        // 규칙 번호(IR8 등)는 내부 기준이라 제목에 붙이지 않는다 — id에만 남긴다.
        item: result.label,
        cause: hsConfirmed ? `대한민국 HSK 확정: ${[...new Set(confirmedCodes)].join(', ')}` : result.evidence,
        recommendation: pickGroups.length
          ? '원본 서류를 확인하고 맞는 값을 고르세요. 둘 다 틀렸다면 직접 입력하면 됩니다.'
          : 'C/I·P/L·B/L·C/O·보험증권 원본을 대조하고 확인된 값으로 정정하세요.',
        relatedDocuments: result.documents.map((document) => DOC_LABEL[document] ?? document),
        ...(pickGroups.length ? { pickGroups } : {}),
        ...(pickGroups.length ? {} : (() => { const fixes = ruleFixes(result.ruleId, analysis); return fixes.length ? { fixes } : {}; })()),
        ...(isChosen ? { chosen: true } : {}),
        ...(hsConfirmed ? { autoResolved: true } : {}),
        status: resolved ? 'resolved' as const : 'unresolved' as const,
      }];
    });
  const existing = assessImportRisks(documents, analysis, suggestions, dutyError, role)
    .filter((risk) => risk.id !== 'reference');
  return [...ruleRisks, ...existing.filter((risk) => !ruleRisks.some((ruleRisk) => ruleRisk.id === risk.id))];
}

export function assessImportRisks(
  documents: ImportDocumentMeta[],
  analysis: ImportAnalysisResult,
  suggestions: ImportHSCodeSuggestion[] = [],
  dutyError = '',
  // 포워더 화면에는 대한민국 HSK를 확정하는 입력이 없다 — 화주만 확정 가능하므로
  // "HS Code 미확정" 리스크를 포워더에게 띄우면 영원히 해소할 방법이 없는 항목이 된다.
  role: UserTradeRole = 'shipper',
): ImportRisk[] {
  // documentId(UUID)가 사용자 화면에 그대로 노출되지 않도록 서류 이름으로 치환
  const docNameOf = (documentId: string): string => {
    const doc = documents.find((entry) => entry.id === documentId);
    if (doc) return DOC_LABEL[doc.type] ?? doc.name;
    return UUID_PATTERN.test(documentId) ? '첨부 문서' : documentId;
  };

  // 품목 출처 서류 ID를 배지용 서류 이름으로 바꾼다(중복 제거).
  const sourceDocumentNames = (ids: string[]) => [...new Set(ids.map(docNameOf))];

  // 화주가 이미 맞는 값을 고른 항목은 해결된 것으로 보되, 카드는 남기고 고른 값을 눌린 버튼으로 보여준다.
  const chosen = analysis.chosenValues ?? {};
  const risks: ImportRisk[] = analysis.validations
    // 신고에 영향을 주지 않는 표기 차이(회사명·주소·연락처·Invoice 번호 등)는 화주 화면에서 제외한다.
    .filter((validation) => role !== 'shipper' || isCoreValidationField(validation.field))
    .flatMap((validation) => {
      const choices = uniqueChoices((validation.values ?? [])
        .map((entry) => ({ source: docNameOf(entry.documentId), value: (entry.value ?? '').trim() }))
        .filter((choice) => choice.value));
      const docKey = validationDocKey(validation.field);
      const isChosen = isValidationChosen(analysis, validation);
      const groupKey = choiceKeyForValidation(validation);
      const selected = (chosen[groupKey] ?? chosen[`validation:${validation.id}`])?.trim();
      const pickGroups: ImportRiskPickGroup[] = choices.length >= 2
        ? [{ key: groupKey, label: docKey ? CHOICE_FIELD_LABEL[docKey] : titleForField(validation.field).replace(/\s*불일치$/, ''), choices, ...(selected ? { selected } : {}) }]
        : [];
      // 고를 선택지가 없는데 해결된 항목은 보여줄 게 없으니 뺀다.
      if (isChosen && !pickGroups.length) return [];
      return [{
        id: validation.id,
        level: validation.severity === 'error' ? 'high' : 'medium',
        item: titleForField(validation.field),
        cause: validation.message,
        recommendation: recommendationFor(validation.field),
        relatedDocuments: validation.documents.map((document) => DOC_LABEL[document] ?? document),
        differentValues: validation.values?.map((entry) => `${docNameOf(entry.documentId)}: ${entry.value}`),
        ...(pickGroups.length ? { pickGroups } : {}),
        ...(isChosen ? { chosen: true } : {}),
        status: isChosen ? 'resolved' as const : 'unresolved' as const,
      }];
    });
  const add = (risk: ImportRisk) => {
    if (!risks.some((entry) => entry.id === risk.id)) risks.push(risk);
  };

  (['commercial_invoice', 'packing_list', 'bill_of_lading'] as ImportDocumentType[]).forEach((type) => {
    if (!documents.some((document) => document.type === type)) {
      add({
        id: `missing-${type}`,
        level: 'high',
        item: `${DOC_LABEL[type]} 누락`,
        cause: '해상 수입 분석에 필요한 기본서류가 첨부되지 않았습니다.',
        recommendation: `${DOC_LABEL[type]} 원본을 해외 수출자 또는 운송인에게 요청해 첨부하세요.`,
        relatedDocuments: [DOC_LABEL[type]],
        fixes: [{ kind: 'upload' }],
        status: 'unresolved',
      });
    }
  });

  const fields = analysis.extracted;
  // Importer 회사명이 로그인 회사와 달라도 신고 금액·세액에는 영향이 없어 확인 항목으로 띄우지 않는다.
  // 추출값 자체는 분석 결과 화면에서 그대로 보고 고칠 수 있다.
  // C/O는 모든 수입신고의 필수서류가 아니라 FTA 협정세율을 적용할 때 필요한 조건부 서류다.
  // 화주가 "적용 가능 여부 확인"을 고르고 C/O를 갖고 있다고 답했는데 서류가 없을 때만 추가를 안내한다.
  const ftaChoice = analysis.chosenValues?.[FTA_CHOICE_KEY];
  const coHolding = analysis.chosenValues?.[CO_HOLDING_KEY];
  const hasCoDocument = documents.some((document) => document.type === 'certificate_of_origin');
  if (isFtaReviewChoice(ftaChoice) && coHolding === '있음' && !hasCoDocument) {
    add({
      id: 'missing-co',
      relatedDocuments: ['Certificate of Origin'],
      level: 'medium',
      item: '원산지증명서 추가 필요',
      cause: '원산지증명서를 갖고 있다고 하셨는데 서류가 아직 첨부되지 않았습니다.',
      recommendation: '원산지증명서를 서류로 추가하면 협정세율 적용 가능 여부를 함께 확인할 수 있습니다.',
      fixes: [{ kind: 'upload' }],
      status: 'unresolved',
    });
  }
  if (!fields.incoterms) {
    add({ id: 'missing-incoterms', level: 'medium', item: 'Incoterms 누락', cause: '운임·보험료 부담 주체와 과세가격 가산 범위를 확인할 수 없습니다.', recommendation: 'Commercial Invoice 또는 계약서에서 Incoterms와 장소를 확인하세요.', relatedDocuments: ['Commercial Invoice'], fixes: [incotermsFix], status: 'unresolved' });
  }
  if (numberValue(fields.netWeight) > 0 && numberValue(fields.grossWeight) > 0 && numberValue(fields.netWeight) > numberValue(fields.grossWeight)) {
    add({ id: 'net-over-gross', level: 'high', item: '순중량 오류', cause: '순중량이 총중량보다 큽니다.', recommendation: 'Packing List의 순중량과 총중량 열이 바뀌어 추출되지 않았는지 확인하세요.', relatedDocuments: ['Packing List', 'Bill of Lading'], differentValues: [fields.netWeight, fields.grossWeight], fixes: weightFixes, status: 'unresolved' });
  }
  const itemSum = fields.items.reduce((sum, item) => sum + numberValue(item.amount), 0);
  const invoiceTotal = numberValue(fields.totalAmount);
  if (itemSum > 0 && invoiceTotal > 0 && Math.abs(itemSum - invoiceTotal) > 0.01) {
    add({ id: 'item-total-mismatch', level: 'high', item: '품목 금액 합계 불일치', cause: '품목별 금액 합계와 Invoice 총금액이 다릅니다.', recommendation: '할인·운임 등 별도 행이 있는지 확인하고 각 품목 금액 또는 Invoice 총액을 수정하세요.', relatedDocuments: ['Commercial Invoice'], differentValues: [`품목 합계 ${itemSum}`, `Invoice ${invoiceTotal}`], fixes: [totalAmountFix([{ source: '품목 합계', value: String(itemSum) }])], status: 'unresolved' });
  }
  fields.items.forEach((item, index) => {
    if (!item.originCountry) add({ id: `origin-${item.id}`, level: 'high', item: `품목 ${index + 1} 원산지 누락`, cause: '첨부문서에서 품목 원산지가 확인되지 않았습니다.', recommendation: 'C/O, C/I, P/L 순으로 품목 원산지를 확인하세요.', relatedDocuments: ['Certificate of Origin', 'Commercial Invoice', 'Packing List'], fixes: [{ kind: 'value', label: '원산지 입력', target: { type: 'itemOrigin', itemId: item.id }, placeholder: 'VIETNAM' }], status: 'unresolved' });
    if (role === 'shipper' && !item.confirmedHSCode) add({ id: `hs-${item.id}`, level: 'high', item: `품목 ${index + 1} HS Code 미확정`, cause: item.documentHSCode ? '문서 HS Code가 있으나 사용자가 최종 확정하지 않았습니다.' : '문서 HS Code가 없고 추천 후보도 아직 확정되지 않았습니다.', recommendation: recommendationFor('hs'), relatedDocuments: sourceDocumentNames(item.sourceDocumentIds), fixes: [{ kind: 'hs', itemId: item.id }], status: 'unresolved' });
    const itemSuggestions = suggestions.filter((suggestion) => !suggestion.itemId || suggestion.itemId === item.id);
    if (itemSuggestions.length && Math.max(...itemSuggestions.map((suggestion) => suggestion.confidence)) < 0.7) {
      add({ id: `hs-confidence-${item.id}`, level: 'medium', item: `품목 ${index + 1} HS Code 신뢰도 낮음`, cause: 'AI 추천 후보의 최고 신뢰도가 70% 미만입니다.', recommendation: '추천에 부족하다고 표시된 재질·용도·규격을 확인하고 관세사 검토를 받으세요.', relatedDocuments: sourceDocumentNames(item.sourceDocumentIds), fixes: [{ kind: 'hs', itemId: item.id }], status: 'unresolved' });
    }
  });
  if (dutyError) {
    const exchange = dutyError.includes('환율');
    add({
      id: exchange ? 'exchange-api-failed' : 'tariff-api-failed',
      level: 'high',
      item: exchange ? '환율 API 조회 실패' : '관세율/예상세액 계산 실패',
      cause: dutyError,
      recommendation: exchange ? '환율 기준일과 통화를 확인한 뒤 API가 복구되면 다시 계산하세요.' : '확정 HS Code와 금액을 확인한 뒤 관세율 API를 다시 조회하세요.',
      relatedDocuments: ['API'],
      status: 'unresolved',
    });
  }
  if (!risks.length) {
    risks.push({ id: 'reference', level: 'info', item: '분석 참고', cause: '현재 입력값 기준으로 자동 탐지된 주요 위험이 없습니다.', recommendation: '최종 의뢰 전 원본 문서와 다시 대조하세요.', relatedDocuments: [], status: 'resolved' });
  }
  return risks;
}
