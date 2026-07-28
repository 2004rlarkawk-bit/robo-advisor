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
  selectedHSCode?: ImportHSCodeSuggestion;
  duty?: ImportDutyEstimate;
  risks: ImportRisk[];
  cargo?: CargoTrackingResult;
  generatedAt: string;
  flowCompletedAt: string;
}
