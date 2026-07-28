/**
 * 수입 서류 대조 데모 픽스처 (OpenAI 없이 결정론적 시연용)
 *
 * OCR(엣지함수)은 키 의존 + 폴백이 없어 로컬/심사장에서 서류를 실제로 못 읽는다.
 * 이 픽스처는 문서별 추출 결과(ImportReconciliationInput)와 화면 표시용 analysis를
 * 코드로 심어, "데모 데이터" 버튼 한 번에 대조 화면이 동일하게 재현되도록 한다.
 *
 * 시나리오: 무선 블루투스 이어폰 수입 (베트남 → 한국).
 *  - MISMATCH: 수량·총중량·품명·HS에 오류를 의도적으로 심음 (error 2 + warning 2 + pass 6)
 *  - CLEAN: 전부 일치하는 정상 케이스 (pass 10) — 발표에서 "정상 → 오류" 대비용
 *
 * 값은 오라클(테스트 importReconciliationFixtures.test.ts)과 1:1로 고정한다.
 */
import type {
  ImportAnalysisResult,
  ImportComparisonRow,
  ImportDocumentMeta,
  ImportReconciliationInput,
} from '../types/importTrade';

export interface ImportDemoScenario {
  id: string;
  label: string;
  description: string;
  documents: ImportDocumentMeta[];
  /** 화면 표시용(추출 요약·원본 비교표·AI 참고 의견). 판정에는 쓰지 않는다. */
  analysis: ImportAnalysisResult;
  /** 대조 엔진 입력(판정의 근거). */
  input: ImportReconciliationInput;
}

const DASH = '—';

function demoDocuments(): ImportDocumentMeta[] {
  return [
    { id: 'demo-ci', name: 'Commercial_Invoice.pdf', size: 184320, mimeType: 'application/pdf', type: 'commercial_invoice', status: 'ready' },
    { id: 'demo-pl', name: 'Packing_List.pdf', size: 151552, mimeType: 'application/pdf', type: 'packing_list', status: 'ready' },
    { id: 'demo-bl', name: 'Bill_of_Lading.pdf', size: 172032, mimeType: 'application/pdf', type: 'bill_of_lading', status: 'ready' },
  ];
}

function baseExtracted(overrides: Partial<ImportAnalysisResult['extracted']>): ImportAnalysisResult['extracted'] {
  return {
    shipper: 'HANOI AUDIO TECH CO., LTD.',
    consignee: 'INCHEON SOUND KOREA INC.',
    notifyParty: 'INCHEON SOUND KOREA INC.',
    importer: 'INCHEON SOUND KOREA INC.',
    invoiceNo: 'HAT-2026-0417',
    productDescription: 'Wireless Earphone',
    quantity: '1,000 EA',
    grossWeight: '120.0 kg',
    netWeight: '102.0 kg',
    originCountry: 'Vietnam',
    destinationCountry: 'Korea',
    currency: 'USD',
    totalAmount: 'USD 8,000.00',
    loadPort: 'Ho Chi Minh',
    dischargePort: 'Busan',
    blNo: 'HCMBUS26041701',
    containerNo: 'TCLU1234567',
    sealNo: 'VN0417889',
    vesselName: 'HMM NURI',
    voyageNo: '025E',
    ...overrides,
  };
}

// ===== 시나리오 1: 오류를 심은 대조 (MISMATCH) =====

const MISMATCH_COMPARISON: ImportComparisonRow[] = [
  { field: '품명', invoice: 'Wireless Earphone', packingList: 'Wireless Earphone (Bluetooth)', billOfLading: 'Bluetooth Headset', matches: false, detail: '표기 상이 — 동일 물품 여부 확인' },
  { field: '수량', invoice: '1,000 EA', packingList: '1,020 EA', billOfLading: DASH, matches: false, detail: 'C/I·P/L 20개 차이' },
  { field: '단가', invoice: 'USD 8.00', packingList: DASH, billOfLading: DASH, matches: true, detail: '' },
  { field: '총액', invoice: 'USD 8,000.00', packingList: DASH, billOfLading: DASH, matches: true, detail: '' },
  { field: '통화', invoice: 'USD', packingList: DASH, billOfLading: DASH, matches: true, detail: '' },
  { field: '인코텀즈', invoice: 'FOB', packingList: DASH, billOfLading: DASH, matches: true, detail: '' },
  { field: 'HS CODE', invoice: '(미기재)', packingList: DASH, billOfLading: DASH, matches: false, detail: 'HS 미기재' },
  { field: '순중량(N/W)', invoice: DASH, packingList: '102.0 kg', billOfLading: DASH, matches: true, detail: '' },
  { field: '총중량(G/W)', invoice: DASH, packingList: '120.0 kg', billOfLading: '128.0 kg', matches: false, detail: '8kg 차이' },
  { field: '포장수', invoice: DASH, packingList: '34 CTN', billOfLading: '34 CTN', matches: true, detail: '' },
];

export const IMPORT_DEMO_MISMATCH: ImportDemoScenario = {
  id: 'earphone-mismatch',
  label: '데모: 이어폰 수입 (오류 포함)',
  description: '무선 블루투스 이어폰 수입 — 수량·총중량·품명·HS에 불일치를 심은 시연 세트',
  documents: demoDocuments(),
  analysis: {
    extracted: baseExtracted({}),
    validations: [
      // AI 참고 채널 예시 (판정 아님 — 코드 대조와 별도 표기됨)
      { id: 'ai-desc', field: '품명', message: 'C/I와 B/L의 품명 표기가 달라 동일 물품 여부 확인이 필요합니다.', severity: 'warning', documents: ['commercial_invoice', 'bill_of_lading'] },
    ],
    comparison: MISMATCH_COMPARISON,
  },
  input: {
    commercial_invoice: {
      productDescription: 'Wireless Earphone',
      quantity: '1,000 EA',
      unitPrice: 'USD 8.00',
      totalAmount: 'USD 8,000.00',
      currency: 'USD',
      incoterms: 'FOB',
      // hsCode 미기재 → IR8 warning
    },
    packing_list: {
      productDescription: 'Wireless Earphone (Bluetooth)',
      quantity: '1,020 EA',
      netWeight: '102.0 kg',
      grossWeight: '120.0 kg',
      packageCount: '34 CTN',
    },
    bill_of_lading: {
      productDescription: 'Bluetooth Headset',
      grossWeight: '128.0 kg',
      packageCount: '34 CTN',
    },
  },
};

// ===== 시나리오 2: 정상 대조 (CLEAN) =====

const CLEAN_COMPARISON: ImportComparisonRow[] = [
  { field: '품명', invoice: 'Wireless Bluetooth Earphone', packingList: 'Wireless Bluetooth Earphone', billOfLading: 'Wireless Bluetooth Earphone', matches: true, detail: '' },
  { field: '수량', invoice: '1,000 EA', packingList: '1,000 EA', billOfLading: DASH, matches: true, detail: '' },
  { field: '단가', invoice: 'USD 8.00', packingList: DASH, billOfLading: DASH, matches: true, detail: '' },
  { field: '총액', invoice: 'USD 8,000.00', packingList: DASH, billOfLading: DASH, matches: true, detail: '' },
  { field: '통화', invoice: 'USD', packingList: DASH, billOfLading: DASH, matches: true, detail: '' },
  { field: '인코텀즈', invoice: 'FOB', packingList: DASH, billOfLading: DASH, matches: true, detail: '' },
  { field: 'HS CODE', invoice: '8518.30', packingList: DASH, billOfLading: DASH, matches: true, detail: '' },
  { field: '순중량(N/W)', invoice: DASH, packingList: '102.0 kg', billOfLading: DASH, matches: true, detail: '' },
  { field: '총중량(G/W)', invoice: DASH, packingList: '120.0 kg', billOfLading: '120.0 kg', matches: true, detail: '' },
  { field: '포장수', invoice: DASH, packingList: '34 CTN', billOfLading: '34 CTN', matches: true, detail: '' },
];

export const IMPORT_DEMO_CLEAN: ImportDemoScenario = {
  id: 'earphone-clean',
  label: '데모: 이어폰 수입 (정상)',
  description: '동일 이어폰 수입 — 모든 항목이 일치하는 정상 대조 세트',
  documents: demoDocuments(),
  analysis: {
    extracted: baseExtracted({ productDescription: 'Wireless Bluetooth Earphone' }),
    validations: [],
    comparison: CLEAN_COMPARISON,
  },
  input: {
    commercial_invoice: {
      productDescription: 'Wireless Bluetooth Earphone',
      quantity: '1,000 EA',
      unitPrice: 'USD 8.00',
      totalAmount: 'USD 8,000.00',
      currency: 'USD',
      incoterms: 'FOB',
      hsCode: '8518.30',
    },
    packing_list: {
      productDescription: 'Wireless Bluetooth Earphone',
      quantity: '1,000 EA',
      netWeight: '102.0 kg',
      grossWeight: '120.0 kg',
      packageCount: '34 CTN',
    },
    bill_of_lading: {
      productDescription: 'Wireless Bluetooth Earphone',
      grossWeight: '120.0 kg',
      packageCount: '34 CTN',
    },
  },
};

export const IMPORT_DEMO_SCENARIOS: ImportDemoScenario[] = [IMPORT_DEMO_MISMATCH, IMPORT_DEMO_CLEAN];
