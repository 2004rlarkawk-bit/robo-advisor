import type { ValidationSeverity } from '../types';

export type TradeDirection = 'export' | 'import';
export type UserTradeRole = 'shipper' | 'forwarder';
export type ImportDocumentType =
  | 'commercial_invoice'
  | 'packing_list'
  | 'bill_of_lading'
  | 'certificate_of_origin'
  | 'transport_request'
  | 'export_declaration'
  | 'insurance_policy'
  | 'other'
  | 'unknown';
export type ImportAnalysisStatus =
  | 'classifying'
  | 'ready'
  | 'analyzing'
  | 'analyzed'
  | 'error';
export type RiskLevel = 'low' | 'medium' | 'high' | 'info';
export type CargoLookupStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'simulation';

export interface ImportDocumentMeta {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  type: ImportDocumentType;
  status: ImportAnalysisStatus;
  uploadStatus?: 'ready' | 'uploaded' | 'error';
  analysisStatus?: 'pending' | 'analyzing' | 'success' | 'error';
  analysisSuccess?: boolean;
  errorMessage?: string;
  sourceId?: string;
  storageBucket?: string;
  storagePath?: string;
  uploadedAt?: string;
}

export interface ArrivalNoticeMeta {
  id: string;
  documentType: 'arrival_notice';
  storageBucket?: string;
  storagePath?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface ImportParty {
  name: string;
  address: string;
  country: string;
  contactName: string;
  phone: string;
  email: string;
}

export interface ImportItem {
  id: string;
  itemNo?: string;
  sku?: string;
  description: string;
  koreanDescription: string;
  documentHSCode: string;
  confirmedHSCode: string;
  modelName: string;
  specification: string;
  material: string;
  composition: string;
  fabricConstruction: string;
  productForm: string;
  processingState: string;
  gender: string;
  intendedUse: string;
  originCountry: string;
  quantity: string;
  quantityUnit: string;
  unitPrice: string;
  currency: string;
  amount: string;
  packageCount?: string;
  packageUnit?: string;
  netWeight?: string;
  grossWeight?: string;
  measurement?: string;
  shippingMarks?: string;
  sourceDocumentIds: string[];
}

export interface ImportCargoTotals {
  numberOfPackages: string;
  grossWeight: string;
  measurement: string;
}

export interface ImportExtractedFields {
  // Legacy flat fields are retained for stored draft/snapshot compatibility.
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
  exportDeclarationNo: string;
  loadingMode: string;
  measurement: string;
  shippingMarks: string;
  /** 적하보험증권의 보험금액·통화 (insurance_policy 첨부 시) */
  insuredAmount: string;
  insuredCurrency: string;

  exporterDetails: ImportParty;
  importerDetails: ImportParty;
  consigneeDetails: ImportParty;
  notifyPartyDetails: ImportParty;
  invoiceDate: string;
  incoterms: string;
  paymentTerms: string;
  shipmentDate: string;
  estimatedArrivalDate: string;
  containerNumbers: string[];
  sealNumbers: string[];
  items: ImportItem[];
  cargoTotals: ImportCargoTotals;
  certificateOfOriginAvailable: boolean;
  totalPackageCount: string;
  packageUnit: string;
  grossWeightUnit: string;
  netWeightUnit: string;
  freight: string;
  insurance: string;
  otherAdditions: string;
}

export interface ImportValidation {
  id: string;
  field: string;
  message: string;
  severity: ValidationSeverity;
  documents: ImportDocumentType[];
  values?: Array<{ documentId: string; value: string }>;
}

export interface ImportComparisonRow {
  field: string;
  invoice: string;
  packingList: string;
  billOfLading: string;
  certificateOfOrigin?: string;
  matches: boolean;
  detail: string;
}

export interface ImportAnalysisResult {
  extracted: ImportExtractedFields;
  validations: ImportValidation[];
  comparison: ImportComparisonRow[];
  /**
   * 서류 간 불일치에서 화주가 확인해 고른 값. 원본 서류 값(comparison)은 그대로 두고 따로 보관한다.
   * 키: "field:<서류 대사 필드>"(예: field:grossWeight) 또는 "validation:<검증 id>".
   */
  chosenValues?: Record<string, string>;
}

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
  /** 교차대조 확장(IR11~IR14): 원산지·항구·수하인·보험금액 */
  originCountry?: string;
  loadPort?: string;
  dischargePort?: string;
  consignee?: string;
  insuredAmount?: string;
  insuredCurrency?: string;
}

export type ImportReconciliationInput = Partial<Record<ImportDocumentType, ImportDocFields>>;
export type ReconciliationStatus = 'pass' | 'fail' | 'skip';

export interface ReconciliationRuleResult {
  ruleId: string;
  label: string;
  severity: ValidationSeverity;
  status: ReconciliationStatus;
  passed: boolean;
  blocking: boolean;
  evidence: string;
  documents: ImportDocumentType[];
}

export interface ImportDocumentClassification {
  id: string;
  type: ImportDocumentType;
  confidence: number;
  summary: string;
  sourceId?: string;
}

export interface ImportHSCodeSuggestion {
  itemId?: string;
  code: string;
  description: string;
  reasoning: string;
  confidence: number;
  missingInformation?: string[];
  source?: 'official_hsk_ai_ranked' | 'official_hsk_fallback';
}

export interface ImportDocumentAnalysisResponse {
  analysis: ImportAnalysisResult;
  classifications: ImportDocumentClassification[];
  source: 'openai';
  model: string;
  timing?: {
    requestParseMs: number;
    openAiMs: number;
    responseParseMs: number;
    totalMs: number;
    inputBytes: number;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  };
}

export interface ImportDutyItemEstimate {
  itemId: string;
  hsCode: string;
  customsValue: number;
  basicRate: number;
  basicDuty: number;
}

export interface ImportDutyEstimate {
  status: 'calculated';
  invoiceCurrency: string;
  invoiceAmount: number;
  exchangeRate: number;
  exchangeRateDate: string;
  convertedInvoiceKrw: number;
  customsValue: number;
  basicRate: number;
  basicDuty: number;
  ftaAgreement: string;
  ftaRate: number | null;
  ftaDuty: number | null;
  estimatedSavings: number | null;
  vat: number;
  otherTaxes: number | null;
  totalTax: number;
  items: ImportDutyItemEstimate[];
  source: 'api';
}

/** 카드에서 값을 고치면 어디에 반영할지 */
export type ImportRiskFixTarget =
  | { type: 'choice'; key: string }
  | { type: 'importer' }
  | { type: 'itemOrigin'; itemId: string }
  /** C/O 없음 카드의 FTA 적용 여부 선택 — chosenValues[FTA_CHOICE_KEY]에 저장 */
  | { type: 'fta' };

/** C/O 없이 FTA를 어떻게 할지 화주가 고른 값의 chosenValues 키 */
export const FTA_CHOICE_KEY = 'fta:apply';
export const FTA_CHOICES = ['FTA 적용 안 함', '적용 여부 미확인', 'FTA 적용 요청'] as const;
export type FtaChoice = typeof FTA_CHOICES[number];

/**
 * 화면에 보여주는 선택은 두 갈래다 — 적용 안 함 / 적용 가능 여부 확인.
 * 저장값은 기존 그대로 쓰고(과거 거래 호환), '적용 여부 미확인'을 '적용 가능 여부 확인'으로 보여준다.
 * 'FTA 적용 요청'으로 저장된 옛 거래도 같은 상태로 취급한다.
 */
export const FTA_REVIEW_CHOICE: FtaChoice = '적용 여부 미확인';
export const isFtaReviewChoice = (value?: string): boolean =>
  value === '적용 여부 미확인' || value === 'FTA 적용 요청';

/** 원산지증명서 보유 여부 — chosenValues[CO_HOLDING_KEY] */
/**
 * 화주가 포워더에게 알려주는 배송 요청.
 * 배송지·희망 일시·수령 담당자는 서류에 없고 화주만 아는 값이라 직접 입력받는다.
 */
export interface ImportDeliveryRequest {
  deliveryAddress: string;
  /** 희망 배송일시 — datetime-local 문자열 */
  deliveryAt: string;
  contactName: string;
  contactTel: string;
  /** 화주가 운송사에 전달할 요청사항 */
  remarks: string;
  updatedAt: string;
}

export const CO_HOLDING_KEY = 'fta:co';
export const CO_HOLDING_CHOICES = ['있음', '없음 / 발급 예정'] as const;
export type CoHolding = typeof CO_HOLDING_CHOICES[number];

/** 카드 안에서 바로 고치는 방법 — 값 입력, HS 확정 칸으로 이동, 서류 추가 업로드로 이동 */
export type ImportRiskFix =
  | {
    kind: 'value';
    label: string;
    target: ImportRiskFixTarget;
    placeholder?: string;
    /** 정해진 값 중에서 고르는 항목(예: Incoterms 11종) */
    options?: string[];
    /** 눌러서 바로 채울 후보 값 */
    choices?: Array<{ source: string; value: string }>;
  }
  | { kind: 'hs'; itemId: string }
  | { kind: 'upload' }
  /** FTA 적용 여부 3택 — 적용 안 함이면 정상, 요청이면 반드시 수정 */
  | { kind: 'fta' };

/** 불일치 카드에서 "맞는 값 고르기" 한 줄 — 서류별 값을 보여주고 하나를 고르거나 직접 입력한다. */
export interface ImportRiskPickGroup {
  /** applyChosenValue 에 넘길 키 */
  key: string;
  label: string;
  choices: Array<{ source: string; value: string }>;
  /** 화주가 이미 고른 값 — 카드는 그대로 두고 이 값 버튼만 눌린 상태로 보여준다 */
  selected?: string;
}

export interface ImportRisk {
  id: string;
  level: RiskLevel;
  item: string;
  cause: string;
  recommendation: string;
  relatedDocuments: string[];
  differentValues?: string[];
  /** 값을 골라 해결할 수 있는 불일치일 때만 채운다. */
  pickGroups?: ImportRiskPickGroup[];
  /** 맞는 값을 골라서 해결된 카드 — 목록에 남기되 해결된 것으로 본다 */
  chosen?: boolean;
  /** 카드 안에서 바로 고칠 수 있는 방법 */
  fixes?: ImportRiskFix[];
  /** C/O 없음 카드에서 화주가 고른 FTA 적용 여부 — 고른 버튼을 눌린 상태로 보여준다 */
  ftaChoice?: string;
  /** 다른 입력(HSK 확정 등)으로 자동 해결된 카드 — 저장된 '검토 전' 상태로 되돌리지 않는다 */
  autoResolved?: boolean;
  status: 'unresolved' | 'resolved';
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
  selectedHSCode?: ImportHSCodeSuggestion;
  duty?: ImportDutyEstimate;
  risks: ImportRisk[];
  cargo?: CargoTrackingResult;
  /** 화주가 입력한 배송 요청 — 포워더가 운송사에 전달할 때 참고한다 */
  deliveryRequest?: ImportDeliveryRequest;
  generatedAt: string;
  flowCompletedAt?: string;
}
