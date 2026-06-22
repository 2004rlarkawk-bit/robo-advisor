// ========== 거래 프로필 ==========
export interface TradeProfile {
  tradeType: 'export' | 'import';
  itemName: string;
  hsCode: string;
  loadPort: string;
  dischargePort: string;
  incoterms: 'FOB' | 'CIF' | 'EXW' | 'DDP' | '';
  quantity: number | '';
  weight: number | '';
  departureDate: string;
  arrivalDate: string;
  companyName: string;
  contact: string;
  partnerName?: string;
}

// ========== 문서 상태 ==========
export type DocumentType = 'invoice' | 'packing_list' | 'bl' | 'co' | 'customs_dec' | 'insurance';

export interface DocumentStatus {
  id: DocumentType;
  name: string;
  status: 'completed' | 'review_required' | 'not_started' | 'not_needed';
  statusText: string;
  lastReviewed?: string;
}

// ========== 검증 이슈 ==========
export interface ValidationIssue {
  id: string;
  docType: DocumentType;
  severity: 'warning' | 'info' | 'error';
  message: string;
  field: keyof TradeProfile;
  /** LLM이 생성한 자연어 맥락 피드백 (ComplianceAgent가 채움) */
  aiFeedback?: string;
}

// ========== 실제 문서 데이터 모델 ==========
export interface PartyInfo {
  name: string;
  address: string;
  contact: string;
}

export interface LineItem {
  no: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface InvoiceData {
  invoiceNo: string;
  date: string;
  exporter: PartyInfo;
  importer: PartyInfo;
  items: LineItem[];
  totalAmount: number;
  currency: string;
  incoterms: string;
  loadPort: string;
  dischargePort: string;
  paymentTerms: string;
}

export interface PackingItem {
  no: number;
  description: string;
  quantity: number;
  netWeight: number;
  grossWeight: number;
  dimensions: string;
}

export interface PackingListData {
  plNo: string;
  date: string;
  invoiceRef: string;
  exporter: PartyInfo;
  importer: PartyInfo;
  items: PackingItem[];
  totalPackages: number;
  totalNetWeight: number;
  totalGrossWeight: number;
}

export interface CertificateOfOriginData {
  coNo: string;
  date: string;
  exporter: PartyInfo;
  importer: PartyInfo;
  itemDescription: string;
  hsCode: string;
  quantity: string;
  originCountry: string;
  invoiceRef: string;
}

export interface GeneratedDocuments {
  invoice?: InvoiceData;
  packingList?: PackingListData;
  certificateOfOrigin?: CertificateOfOriginData;
}

// ========== 에이전트 로그 ==========
export interface AgentLog {
  timestamp: string;
  agentName: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

// ========== HS Code 데이터 ==========
export interface HSCodeEntry {
  code: string;
  description: string;
  descriptionKo: string;
  category: string;
}

// ========== 저장된 거래 이력 ==========
export interface SavedTrade {
  id: string;
  profile: TradeProfile;
  documents: DocumentStatus[];
  generatedDocs?: GeneratedDocuments;
  issues: ValidationIssue[];
  createdAt: string;
  updatedAt: string;
}

// ========== 앱 전체 페이지 ==========
export type PageId = 
  | 'dashboard' 
  | 'generation' 
  | 'doc_manage' 
  | 'trade_manage' 
  | 'history' 
  | 'analytics' 
  | 'settings';
