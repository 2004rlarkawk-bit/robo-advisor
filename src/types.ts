export type TradeType = 'export' | 'import';
export type TradeRole = 'shipper' | 'forwarder';

export type Incoterms =
  | ''
  | 'FOB'
  | 'CFR'
  | 'CIF'
  | 'EXW'
  | 'DDP'
  | 'DAP'
  | 'FCA';

export type NumericInput = number | '';

// 2026-07-23 편의성 업그레이드: 화주용 통관 입력 폼 확장
export type ShipperItemUnit = 'EA' | 'PCS' | 'SET' | 'CTN' | 'BOX' | 'KG' | 'TON' | 'M' | 'M2' | 'M3' | 'L';
export type ShipperCurrency = 'USD' | 'EUR' | 'JPY' | 'CNY' | 'KRW' | 'GBP';

export interface ShipperItem {
  id: string;
  itemName: string;
  hsCode: string;
  quantity: NumericInput;
  unit: ShipperItemUnit;
  unitPrice: NumericInput;
  currency: ShipperCurrency;
}

export interface ShipperSupplementalState {
  buyerMatchesConsignee: boolean;
  consigneeMatchesNotifyParty: boolean;
  incotermsPlace: string;
  originCriterion: '' | '세번변경기준' | '부가가치기준' | '완전생산기준';
  isSignerSameAsCompany?: boolean;
  signerNameBeforeCompany?: string;
  hasNoShippingMarks?: boolean;
  shippingMarksBeforeNoMarks?: string;
}

// 2026-07-23 편의성 업그레이드: 포워더용 선적 및 부킹 입력 폼 추가
export type BookingStatus = 'requested' | 'confirmed' | 'cancelled';
export type ForwarderLoadingMode = 'FCL' | 'LCL';
export type ContainerSize = '20GP' | '40GP' | '40HC' | '45HC';

export interface TradeProfile {
  tradeType: TradeType;
  itemName: string;
  hsCode: string;
  loadPort: string;
  dischargePort: string;
  incoterms: Incoterms;
  quantity: NumericInput;
  weight: NumericInput;
  departureDate: string;
  arrivalDate: string;
  companyName: string;
  contact: string;
  contactName?: string;

  partnerName?: string;
  currency?: string;
  invoiceAmount?: NumericInput;
  businessRegistrationNo?: string;

  documentNo?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  referenceNo?: string;
  otherReferences?: string;

  blNo?: string;
  issuePlace?: string;
  issueDate?: string;

  countryOfOrigin?: string;
  unit?: string;

  unitPrice?: NumericInput;
  totalAmount?: NumericInput;

  packageCount?: NumericInput;
  packageType?: string;
  netWeight?: NumericInput;
  grossWeight?: NumericInput;
  measurement?: string;
  shippingMarks?: string;

  vesselOrFlight?: string;
  carrier?: string;
  exportDeclarationNo?: string;
  bookingNo?: string;
  bookingStatus?: BookingStatus;
  loadingMode?: ForwarderLoadingMode;
  containerSize?: ContainerSize;
  containerQuantity?: NumericInput;

  placeOfReceipt?: string;
  placeOfDelivery?: string;
  finalDestination?: string;
  voyageNo?: string;
  flag?: string;

  containerNo?: string;
  sealNo?: string;

  paymentTerms?: string;
  // 신용장(L/C) 정보 — 결제조건이 L/C일 때만 유효. 비신용장(T/T 등)이면 파생 단계에서 강제 공란 처리.
  lcNo?: string;
  lcDate?: string;
  lcBank?: string;
  reasonForExport?: string;
  freightTerms?: string;
  freightCharges?: string;
  freightPrepaidAt?: string;
  freightPayableAt?: string;

  companyAddress?: string;
  companyCountry?: string;
  taxNo?: string;

  partnerAddress?: string;
  partnerCountry?: string;
  partnerContact?: string;

  buyerName?: string;
  buyerAddress?: string;
  buyerCountry?: string;

  notifyPartyName?: string;
  notifyPartyAddress?: string;
  notifyPartyContact?: string;

  signedBy?: string;
  signerName?: string;
  signerPosition?: string;

  /** CIF 조건에서 적하보험증권을 준비했음을 사용자가 확인 (insurance-missing 이슈 해소) */
  insuranceConfirmed?: boolean;
  /** 원산지증명서 발급 요청을 확인 (co-required 이슈 해소 — 원산지 판정 로직 도입 전 단계) */
  coIssuanceConfirmed?: boolean;

  /** 수출 화주 폼 전용 JSON 상태. 기존 profile JSON 저장/복원 흐름을 그대로 사용한다. */
  shipperItems?: ShipperItem[];
  shipperSupplemental?: ShipperSupplementalState;
}

// 주의: '| string'을 붙이면 유니언이 사실상 string으로 붕괴되어 오타를 컴파일이 못 잡는다
export type DocumentType =
  | 'invoice'
  | 'packing_list'
  | 'co'
  | 'customs_dec'
  | 'bl'
  | 'insurance';

export type DocumentStatusType =
  | 'not_started'
  | 'completed'
  | 'review_required'
  | 'not_needed'
  // 타 주체(포워더/세관/상공회의소)가 발급 — 화주가 여기서 생성하지 않고 대기하는 서류.
  | 'external_pending';

export type PersistedTradeStatus =
  | 'generated'
  | 'in_progress'
  | 'submitted'
  | 'failed';

export type TradeUiStatus = 'draft' | 'generating' | 'submitting';
export type TradeStatus = PersistedTradeStatus | TradeUiStatus;

export interface DocumentStatus {
  id: string;
  name: string;
  status: DocumentStatusType;
  statusText: string;
  lastReviewed?: string;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  id: string;
  docType: DocumentType;
  field: keyof TradeProfile | string;
  message: string;
  severity: ValidationSeverity;
  /**
   * error 정책 이슈가 "사유 입력 시 생성 우회"를 허용하는지.
   * severity==='error'일 때만 의미. warning/info는 undefined(생성 차단 안 함).
   */
  overridable?: boolean;
  /** 짧은 제목(확인 항목 카드용). 없으면 docType 라벨로 대체. */
  title?: string;
  /** 근거 법령(구조화) — message에 문자열로 붙이는 대신 배지로 렌더. */
  basis?: FeedbackBasis;
  /**
   * 계산 결과 사실 카드(과세가격 환산·예상 관세액 등).
   * 존재하면 이 이슈는 "확인 항목"이 아니라 "사실 카드"로 렌더된다.
   * 금액·법근거는 여기서 결정론적으로 채워짐 — GPT가 나중 껴도 이 숫자는 안 바뀜.
   */
  card?: FeedbackFactCard;
}

// ===== AI 검토 리포트 "틀" — 룰(지금)과 GPT(나중)가 같은 구조를 채운다 =====
// 3층 분리: 숫자·법근거(결정론) / 구조·어떤 카드·체크(룰) / 산문 설명(룰→GPT 교체).
// GPT는 리포트 저자가 아니라 빈 산문 슬롯을 채우는 필러 — 금액·법조문은 못 지어낸다.

/** 근거 배지 — 예: { label: '근거', law: '관세법 제30조', summary: '과세가격 결정의 원칙' } */
export interface FeedbackBasis {
  label: string;
  law?: string;
  /** 조문 간략 설명(펼침 UI용). 사용자가 배지를 클릭해 펼치면 표시. */
  summary?: string;
}

/** 계산 결과 사실 카드 — 과세가격 환산 등. 값은 실 API/룰에서 결정론적으로 산출. */
export interface FeedbackFactCard {
  id: string;
  title: string;             // 예: 과세가격 환산
  value: string;             // 예: 약 36,961,000원
  formula?: string;          // 예: USD 25,000 × 1,478.44원
  meta?: string;             // 예: 여성 캐시미어 코트 · 관세청 주간환율 · 적용일 2026-07-26
  basis?: FeedbackBasis;     // 예: 근거 · 관세법 제30조
}

/** 확인이 필요한 항목 — 오류/보완/참고. */
export interface FeedbackCheckItem {
  id: string;
  title: string;             // 짧은 제목
  detail: string;            // 설명 문장(근거 접미사 제거된 순수 메시지)
  severity: ValidationSeverity;
  docType?: DocumentType;
  field?: keyof TradeProfile | string;
  basis?: FeedbackBasis;
}

/** AI 검토 리포트 전체 틀. facts·checks 구조는 룰이, narrative 산문은 룰→GPT가 채운다. */
export interface FeedbackReport {
  summary: { reviewed: number; needsCheck: number };
  facts: FeedbackFactCard[];
  checks: FeedbackCheckItem[];
  narrative?: string;
}

export interface PartyInfo {
  name: string;
  address: string;
  contact: string;
  country?: string;
}

/**
 * 품목 하나의 canonical 모델 — C/I·P/L이 각자 필요한 필드만 가져간다.
 * 결정: currency는 Shipment 레벨(혼합통화 error 차단), amount는 저장 않고 계산(extractedAmount로 추출값 분리),
 * packages는 packageCount(number)+packageUnit(string)로 분해.
 */
export interface TradeItem {
  description: string;    // 품명 → C/I·P/L goods_description
  hsCode: string;         // → C/I goods_spec
  quantity: number;       // 수량(개수) → C/I quantity. net_weight와 다른 값이다.
  unit: string;
  unitPrice: number;      // → C/I unit_price
  extractedAmount?: number; // 추출된 금액(있으면). amount는 저장하지 않고 tradeItemAmount로 계산.
  // ── 물류필드(P/L) — 입력 경로가 생기기 전까지 공란(0/'')으로 둔다.
  //    첫 품목·문서레벨 값으로 채우지 않는다(junk 기본값 재발 방지). 미입력은 검증이 잡는다.
  netWeight: number;      // 순중량 → C/I net_weight, P/L quantity_or_net_weight
  grossWeight: number;    // → P/L gross_weight
  measurement: string;    // 용적(CBM) → P/L measurement
  packageCount: number;   // → P/L packages(수)
  packageUnit: string;    // → P/L packages(단위: CTNS 등)
  shippingMarks?: string; // 품목별 화인 override — 비면 문서레벨 상속. C/I로 승격하지 않음.
}

/**
 * 선적 건 하나 = 문서레벨 정보(profile) + 품목 배열(items).
 * 통화는 profile.currency 단일 — 혼합 통화는 생성 전 error로 차단한다.
 */
export interface Shipment {
  profile: TradeProfile;
  items: TradeItem[];
}

export interface InvoiceItem {
  no: number | string;
  description: string;
  hsCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;

  countryOfOrigin?: string;
  weight?: number;
  netWeight: number;
  grossWeight: number;
  dimensions: string;
  packageCount?: number;
  packageType?: string;

  [key: string]: any;
}

export interface InvoiceData {
  seller: PartyInfo;
  consignee: PartyInfo;
  buyer?: PartyInfo;
  invoiceNo: string;
  invoiceDate: string;
  currency: string;
  incoterms: string;
  loadPort: string;
  dischargePort: string;
  departureDate: string;
  arrivalDate: string;
  items: InvoiceItem[];
  totalAmount: number;
  signedBy?: string;

  [key: string]: any;
}

export interface PackingListData {
  seller: PartyInfo;
  consignee: PartyInfo;
  invoiceNo: string;
  packingListNo?: string;
  date: string;
  shippingMarks: string;
  packageCount: number;
  packageType: string;
  netWeight: number;
  grossWeight: number;
  measurement: string;
  items: InvoiceItem[];

  [key: string]: any;
}

export interface CertificateOfOriginData {
  exporter: PartyInfo;
  consignee: PartyInfo;
  invoiceNo: string;
  issueDate: string;
  countryOfOrigin: string;
  destinationCountry: string;
  items: InvoiceItem[];
  signedBy: string;

  [key: string]: any;
}

export interface InsuranceData {
  certNo: string;
  assured: PartyInfo;
  invoiceNo: string;
  amountInsured: number;
  currency: string;
  conditions: string;
  vesselName: string;
  fromPort: string;
  toPort: string;
  sailingOn: string;
  goods: string;
  signedBy: string;

  [key: string]: any;
}
export interface CustomsDeclarationData {
  declarationNo: string;
  declarationDate: string;
  tradeType: TradeType;
  exporter: PartyInfo;
  importer: PartyInfo;
  itemName: string;
  hsCode: string;
  quantity: number;
  unit: string;
  weight: number;
  currency: string;
  invoiceAmount: number;
  incoterms: string;
  loadPort: string;
  dischargePort: string;
  countryOfOrigin: string;
  customsValue?: number;
  dutyRate?: string;
  dutyAmount?: number;
  signedBy?: string;

  // ── 수출신고서(초안) docx 전환용 확장 필드 (기존 HTML 필드는 그대로 유지) ──
  // 갑지=items[0], 을지=items.slice(1). 서비스가 포맷/공란/FOB환산을 담당한다.
  items?: TradeItem[];
  // 관세청 수출환율(원/외화 1단위). null이면 환율 미확보 → FOB 원화 공란.
  fobRate?: number | null;
  // 당사자(소스 있는 것만; 통관고유부호·대표자 등 소스 없는 건 서비스에서 공란).
  ownerAddress?: string;
  ownerBizNo?: string;
  makerName?: string;
  buyerName?: string;
  buyerCountry?: string;
  // 선적 정보
  destCountry?: string;
  carrier?: string;
  vessel?: string;
  departureDate?: string;
  transportType?: string;
  lcNo?: string;
  // 합계·기타
  totalWeight?: number;
  totalPackages?: number;
  paymentAmount?: number;
  containerNo?: string;
  invoiceNo?: string;
  invoiceDate?: string;

  [key: string]: any;
}
export interface GeneratedDocuments {
  documents?: DocumentStatus[];
  invoice?: InvoiceData;
  packingList?: PackingListData;
  certificateOfOrigin?: CertificateOfOriginData;
  insurance?: InsuranceData;
  customsDeclaration?: CustomsDeclarationData;
  htmlTemplates?: Record<string, string>;

  [key: string]: any;
}

export interface SavedTrade {
  id: string;
  profile: TradeProfile;
  tradeDirection?: TradeType;
  tradeRole?: TradeRole;
  arrivalNotice?: object | null;
  analysisResult?: object;
  riskSummary?: unknown[];
  customsProgress?: object;
  documents: DocumentStatus[];
  issues: ValidationIssue[];
  status?: PersistedTradeStatus;
  generatedDocs?: GeneratedDocuments;
  generatedAt?: string | null;
  submittedAt?: string | null;
  flowCompletedAt?: string | null;
  createdAt: string;
  updatedAt?: string;

  [key: string]: any;
}
