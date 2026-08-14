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

export interface ImportRisk {
  id: string;
  level: RiskLevel;
  item: string;
  cause: string;
  recommendation: string;
  relatedDocuments: string[];
  differentValues?: string[];
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
  generatedAt: string;
  flowCompletedAt?: string;
}
