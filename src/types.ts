export type TradeType = 'export' | 'import';

export type Incoterms =
  | ''
  | 'FOB'
  | 'CIF'
  | 'EXW'
  | 'DDP'
  | 'DAP'
  | 'FCA';

export type NumericInput = number | '';

export interface TradeProfile {
  // 기존 필수 입력값
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

  // 기존 App.tsx에서 사용 중이던 값
  partnerName?: string;
  currency?: string;
  invoiceAmount?: NumericInput;
  businessRegistrationNo?: string;

  // 1. 기본 거래 / 문서 정보
  documentNo?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  referenceNo?: string;

  // 선하증권 Bill of Lading 정보
  blNo?: string;
  issuePlace?: string;
  issueDate?: string;

  // 2. 상품 정보
  countryOfOrigin?: string;
  unit?: string;

  // 3. 가격 / 금액 정보
  unitPrice?: NumericInput;
  totalAmount?: NumericInput;

  // 4. 포장 / 중량 / 부피 정보
  packageCount?: NumericInput;
  packageType?: string;
  netWeight?: NumericInput;
  grossWeight?: NumericInput;
  measurement?: string;
  shippingMarks?: string;

  // 5. 운송 정보
  vesselOrFlight?: string;
  carrier?: string;

  // 선하증권 운송 세부 정보
  placeOfReceipt?: string;
  placeOfDelivery?: string;
  finalDestination?: string;
  voyageNo?: string;
  flag?: string;

  // 6. 컨테이너 정보
  containerNo?: string;
  sealNo?: string;

  // 7. 거래 조건 / 운임 정보
  paymentTerms?: string;
  reasonForExport?: string;
  freightTerms?: string;
  freightCharges?: string;
  freightPrepaidAt?: string;
  freightPayableAt?: string;

  // 8. 수출자 / 판매자 / Shipper 정보
  companyAddress?: string;
  companyCountry?: string;
  taxNo?: string;

  // 9. 수입자 / 수하인 / Consignee 정보
  partnerAddress?: string;
  partnerCountry?: string;
  partnerContact?: string;

  // 10. 구매자 / Bill To 정보
  buyerName?: string;
  buyerAddress?: string;
  buyerCountry?: string;

  // 11. Notify Party 정보
  notifyPartyName?: string;
  notifyPartyAddress?: string;
  notifyPartyContact?: string;

  // 12. 서명 정보
  signedBy?: string;
  signerName?: string;
  signerPosition?: string;
}

export type DocumentStatusType =
  | 'not_started'
  | 'completed'
  | 'review_required'
  | 'not_needed';

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
  docType: string;
  field: keyof TradeProfile | string;
  message: string;
  severity: ValidationSeverity;
}

export interface GeneratedDocuments {
  documents: DocumentStatus[];
  htmlTemplates?: Record<string, string>;
}

export interface PartyInfo {
  name: string;
  address: string;
  contact: string;
}

export interface InvoiceItem {
  description: string;
  hsCode: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  countryOfOrigin?: string;
  weight?: number;
  packageCount?: number;
  packageType?: string;
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
  signedBy: string;

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

export interface SavedTrade {
  id: string;
  profile: TradeProfile;
  documents?: GeneratedDocuments;
  status?: string;
  createdAt: string;
  updatedAt?: string;
}
