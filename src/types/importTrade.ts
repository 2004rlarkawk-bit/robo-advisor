import type { ValidationSeverity } from '../types';

export type TradeDirection = 'export' | 'import';
export type UserTradeRole = 'shipper' | 'forwarder';
export type ImportDocumentType =
  | 'commercial_invoice'
  | 'packing_list'
  | 'bill_of_lading'
  | 'unknown';
export type ImportAnalysisStatus = 'classifying' | 'ready' | 'error';
export type RiskLevel = 'low' | 'medium' | 'high';
export type CargoLookupStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'simulation';

export interface ImportDocumentMeta {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  type: ImportDocumentType;
  status: ImportAnalysisStatus;
}

export interface ArrivalNoticeMeta {
  storagePath?: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface ImportExtractedFields {
  shipper: string;
  consignee: string;
  notifyParty: string;
  importer: string;
  invoiceNo: string;
  productDescription: string;
  quantity: string;
  grossWeight: string;
  netWeight: string;
  originCountry: string;
  destinationCountry: string;
  currency: string;
  totalAmount: string;
  loadPort: string;
  dischargePort: string;
  blNo: string;
  containerNo: string;
  sealNo: string;
  vesselName: string;
  voyageNo: string;
}

export interface ImportValidation {
  id: string;
  field: string;
  message: string;
  severity: ValidationSeverity;
  documents: ImportDocumentType[];
}

export interface ImportComparisonRow {
  field: string;
  invoice: string;
  packingList: string;
  billOfLading: string;
  matches: boolean;
  detail: string;
}

export interface ImportAnalysisResult {
  extracted: ImportExtractedFields;
  validations: ImportValidation[];
  comparison: ImportComparisonRow[];
}

/**
 * 문서별(per-document) 추출 필드 — 대조(對照) 룰 엔진의 입력 단위.
 * OCR/LLM이 추출하든 데모 픽스처가 주입하든, 엔진은 이 구조만 소비한다.
 * (엣지함수 analysis.extracted는 문서 구분 없는 머지 객체라 교차검증 불가.)
 */
export interface ImportDocFields {
  productDescription?: string;
  quantity?: string;
  packageCount?: string;
  grossWeight?: string;
  netWeight?: string;
  unitPrice?: string;
  totalAmount?: string;
  currency?: string;
  hsCode?: string;
  incoterms?: string;
}

/** 문서 종류별 추출 필드 묶음. 키 존재 = 해당 서류 업로드됨(IR10 판정 근거). */
export type ImportReconciliationInput = Partial<Record<ImportDocumentType, ImportDocFields>>;

export type ReconciliationStatus = 'pass' | 'fail' | 'skip';

/** 대조 룰 1건 실행 결과. passed = (status === 'pass'). */
export interface ReconciliationRuleResult {
  ruleId: string;              // 'IR1' ~ 'IR10'
  label: string;               // 룰 이름 (품명 일치 등)
  severity: ValidationSeverity;
  status: ReconciliationStatus; // pass(일치) / fail(불일치) / skip(확인불가·정보없음)
  passed: boolean;
  blocking: boolean;           // 하드 차단(사유 override 불가) 여부 — 룰 정의에서 전파
  evidence: string;            // 근거 문자열 (예: "C/I 수량 1,000 vs P/L 수량 1,020 → 20개 차이")
  documents: ImportDocumentType[];
}

export type ReconciliationGateStatus = 'clear' | 'blocked' | 'override_required';

/** 2→3단계 전이 판정 결과 (역할 기반 소프트 게이트). */
export interface ReconciliationGate {
  status: ReconciliationGateStatus;
  blocking: ReconciliationRuleResult[];    // 하드 차단(IR10 등) — 사유로도 못 넘김
  overridable: ReconciliationRuleResult[]; // 사유 입력 시 우회 가능한 미해결 오류
  message: string;
}

export interface ImportDocumentClassification {
  id: string;
  type: ImportDocumentType;
  confidence: number;
  summary: string;
}

export interface ImportHSCodeSuggestion {
  code: string;
  description: string;
  reasoning: string;
  confidence: number;
}

export interface ImportDocumentAnalysisResponse {
  analysis: ImportAnalysisResult;
  classifications: ImportDocumentClassification[];
  suggestions: ImportHSCodeSuggestion[];
  source: 'openai';
  model: string;
}

export interface ImportDutyEstimate {
  customsValue: number;
  basicRate: number;
  basicDuty: number;
  ftaAgreement: string;
  ftaRate: number;
  ftaDuty: number;
  estimatedSavings: number;
  vat: number;
  totalTax: number;
  source: 'api' | 'simulation';
}

export interface ImportRisk {
  id: string;
  level: RiskLevel;
  item: string;
  cause: string;
  recommendation: string;
  relatedDocuments: string[];
  status: string;
}

export interface CargoTimelineItem {
  label: string;
  completed: boolean;
  current?: boolean;
}

export interface CargoTrackingResult {
  lookupStatus: CargoLookupStatus;
  cargoNo: string;
  status: string;
  detail: string;
  arrivalPort: string;
  source?: 'api' | 'simulation';
  timeline: CargoTimelineItem[];
}

export interface ImportTradeSnapshot {
  tradeId?: string;
  direction: 'import';
  role: UserTradeRole;
  documents: ImportDocumentMeta[];
  arrivalNotice?: ArrivalNoticeMeta;
  analysis: ImportAnalysisResult;
  /** 대조 overridable 오류를 사유로 우회한 기록 (ruleId → 사유). 없으면 생략. */
  reconciliationOverrides?: Record<string, string>;
  selectedHSCode?: ImportHSCodeSuggestion;
  duty?: ImportDutyEstimate;
  risks: ImportRisk[];
  cargo?: CargoTrackingResult;
  generatedAt: string;
  flowCompletedAt: string;
}
