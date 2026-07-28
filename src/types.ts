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
  | 'not_needed';

export type TradeStatus =
  | 'draft'
  | 'generating'
  | 'generated'
  | 'submitting'
  | 'in_progress'
  | 'submitted'
  | 'failed';

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
}

export interface PartyInfo {
  name: string;
  address: string;
  contact: string;
  country?: string;
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

export interface GeneratedDocuments {
  documents?: DocumentStatus[];
  invoice?: InvoiceData;
  packingList?: PackingListData;
  certificateOfOrigin?: CertificateOfOriginData;
  insurance?: InsuranceData;
  htmlTemplates?: Record<string, string>;

  [key: string]: any;
}

export interface SavedTrade {
  id: string;
  profile: TradeProfile;
  tradeDirection?: TradeType;
  tradeRole?: TradeRole;
  arrivalNotice?: Record<string, unknown> | null;
  analysisResult?: Record<string, unknown>;
  riskSummary?: unknown[];
  customsProgress?: Record<string, unknown>;
  documents: DocumentStatus[];
  issues: ValidationIssue[];
  status?: TradeStatus;
  generatedDocs?: GeneratedDocuments;
  generatedAt?: string | null;
  submittedAt?: string | null;
  flowCompletedAt?: string | null;
  createdAt: string;
  updatedAt?: string;

  [key: string]: any;
}
