import type {
  ImportAnalysisResult,
  ImportDocumentMeta,
  ImportDocumentType,
  ImportHSCodeSuggestion,
  ImportRisk,
} from '../types/importTrade';

const DOC_LABEL: Record<ImportDocumentType, string> = {
  commercial_invoice: 'Commercial Invoice',
  packing_list: 'Packing List',
  bill_of_lading: 'Bill of Lading',
  certificate_of_origin: 'Certificate of Origin',
  transport_request: 'Export Transport Request',
  export_declaration: 'Export Declaration',
  other: '기타서류',
  unknown: '기타서류',
};
const numberValue = (value: string): number => Number(value.replace(/,/g, '')) || 0;

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
 * 업로드한 파일 내용과 무관하게 항상 동일한 3건(반드시 수정 1 · 보완 권장 2)을 노출한다.
 * 시연이 끝나면 DEMO_FIXED_IMPORT_RISKS 를 false 로 바꾸면 실제 분석 결과가 그대로 표시된다.
 */
export const DEMO_FIXED_IMPORT_RISKS = true;

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
  importerCompanyName = '',
): ImportRisk[] {
  if (DEMO_FIXED_IMPORT_RISKS) return DEMO_IMPORT_RISKS.map((risk) => ({ ...risk }));
  return assessImportRisks(documents, analysis, suggestions, dutyError, importerCompanyName);
}

export function assessImportRisks(
  documents: ImportDocumentMeta[],
  analysis: ImportAnalysisResult,
  suggestions: ImportHSCodeSuggestion[] = [],
  dutyError = '',
  importerCompanyName = '',
): ImportRisk[] {
  // documentId(UUID)가 사용자 화면에 그대로 노출되지 않도록 서류 이름으로 치환
  const docNameOf = (documentId: string): string => {
    const doc = documents.find((entry) => entry.id === documentId);
    if (doc) return DOC_LABEL[doc.type] ?? doc.name;
    return UUID_PATTERN.test(documentId) ? '첨부 문서' : documentId;
  };

  const risks: ImportRisk[] = analysis.validations.map((validation) => ({
    id: validation.id,
    level: validation.severity === 'error' ? 'high' : 'medium',
    item: titleForField(validation.field),
    cause: validation.message,
    recommendation: recommendationFor(validation.field),
    relatedDocuments: validation.documents.map((document) => DOC_LABEL[document] ?? document),
    differentValues: validation.values?.map((entry) => `${docNameOf(entry.documentId)}: ${entry.value}`),
    status: 'unresolved',
  }));
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
        status: 'unresolved',
      });
    }
  });

  const fields = analysis.extracted;
  if (importerCompanyName && fields.importerDetails.name
    && importerCompanyName.trim().toLowerCase() !== fields.importerDetails.name.trim().toLowerCase()) {
    add({
      id: 'importer-profile-mismatch',
      level: 'high',
      item: 'Importer 불일치',
      cause: '문서의 Importer와 로그인 회사정보가 다릅니다.',
      recommendation: '문서가 해당 회사의 거래인지 확인하세요. 문서값은 자동으로 덮어쓰지 않습니다.',
      relatedDocuments: ['Commercial Invoice', 'Bill of Lading', '회원프로필'],
      differentValues: [fields.importerDetails.name, importerCompanyName],
      status: 'unresolved',
    });
  }
  if (!documents.some((document) => document.type === 'certificate_of_origin')) {
    add({
      id: 'missing-co',
      level: 'medium',
      item: '원산지증명서 누락',
      cause: 'Certificate of Origin이 첨부되지 않아 협정세율 적용 여부를 확인할 수 없습니다.',
      recommendation: 'FTA 적용을 검토하려면 협정 요건에 맞는 C/O를 수출자에게 요청하세요.',
      relatedDocuments: ['Certificate of Origin'],
      status: 'unresolved',
    });
  }
  if (!fields.incoterms) {
    add({ id: 'missing-incoterms', level: 'medium', item: 'Incoterms 누락', cause: '운임·보험료 부담 주체와 과세가격 가산 범위를 확인할 수 없습니다.', recommendation: 'Commercial Invoice 또는 계약서에서 Incoterms와 장소를 확인하세요.', relatedDocuments: ['Commercial Invoice'], status: 'unresolved' });
  }
  if (numberValue(fields.netWeight) > 0 && numberValue(fields.grossWeight) > 0 && numberValue(fields.netWeight) > numberValue(fields.grossWeight)) {
    add({ id: 'net-over-gross', level: 'high', item: '순중량 오류', cause: '순중량이 총중량보다 큽니다.', recommendation: 'Packing List의 순중량과 총중량 열이 바뀌어 추출되지 않았는지 확인하세요.', relatedDocuments: ['Packing List', 'Bill of Lading'], differentValues: [fields.netWeight, fields.grossWeight], status: 'unresolved' });
  }
  const itemSum = fields.items.reduce((sum, item) => sum + numberValue(item.amount), 0);
  const invoiceTotal = numberValue(fields.totalAmount);
  if (itemSum > 0 && invoiceTotal > 0 && Math.abs(itemSum - invoiceTotal) > 0.01) {
    add({ id: 'item-total-mismatch', level: 'high', item: '품목 금액 합계 불일치', cause: '품목별 금액 합계와 Invoice 총금액이 다릅니다.', recommendation: '할인·운임 등 별도 행이 있는지 확인하고 각 품목 금액 또는 Invoice 총액을 수정하세요.', relatedDocuments: ['Commercial Invoice'], differentValues: [`품목 합계 ${itemSum}`, `Invoice ${invoiceTotal}`], status: 'unresolved' });
  }
  fields.items.forEach((item, index) => {
    if (!item.originCountry) add({ id: `origin-${item.id}`, level: 'high', item: `품목 ${index + 1} 원산지 누락`, cause: '첨부문서에서 품목 원산지가 확인되지 않았습니다.', recommendation: 'C/O, C/I, P/L 순으로 품목 원산지를 확인하세요.', relatedDocuments: ['Certificate of Origin', 'Commercial Invoice', 'Packing List'], status: 'unresolved' });
    if (!item.confirmedHSCode) add({ id: `hs-${item.id}`, level: 'high', item: `품목 ${index + 1} HS Code 미확정`, cause: item.documentHSCode ? '문서 HS Code가 있으나 사용자가 최종 확정하지 않았습니다.' : '문서 HS Code가 없고 추천 후보도 아직 확정되지 않았습니다.', recommendation: recommendationFor('hs'), relatedDocuments: item.sourceDocumentIds, status: 'unresolved' });
    const itemSuggestions = suggestions.filter((suggestion) => !suggestion.itemId || suggestion.itemId === item.id);
    if (itemSuggestions.length && Math.max(...itemSuggestions.map((suggestion) => suggestion.confidence)) < 0.7) {
      add({ id: `hs-confidence-${item.id}`, level: 'medium', item: `품목 ${index + 1} HS Code 신뢰도 낮음`, cause: 'AI 추천 후보의 최고 신뢰도가 70% 미만입니다.', recommendation: '추천에 부족하다고 표시된 재질·용도·규격을 확인하고 관세사 검토를 받으세요.', relatedDocuments: item.sourceDocumentIds, status: 'unresolved' });
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
