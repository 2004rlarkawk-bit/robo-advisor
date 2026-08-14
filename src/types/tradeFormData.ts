import type {
  GeneratedDocuments,
  Incoterms,
  NumericInput,
  TradeRole,
  TradeType,
} from '../types';
import type {
  CargoTrackingResult,
  ImportAnalysisResult,
  ImportDocumentMeta,
  ImportDutyEstimate,
  ImportHSCodeSuggestion,
  ImportRisk,
  ImportTradeSnapshot,
} from './importTrade';

export const TRADE_FORM_SCHEMA_VERSION = 3 as const;

export type TradeAttachmentDocumentType =
  | 'commercial_invoice'
  | 'packing_list'
  | 'bill_of_lading'
  | 'certificate_of_origin'
  | 'transport_request'
  | 'export_declaration'
  | 'arrival_notice'
  | 'other';

export interface TradeAttachment {
  id: string;
  documentType: TradeAttachmentDocumentType;
  fileName: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface TradeFormParty {
  name: string;
  address: string;
  country: string;
  contactName: string;
  contact: string;
  businessNumber: string;
  taxNumber: string;
}

export interface TradeFormParties {
  company: TradeFormParty;
  partner: TradeFormParty;
  buyer: TradeFormParty;
  notifyParty: TradeFormParty;
  signer: {
    name: string;
    position: string;
    signedBy: string;
  };
}

export interface TradeFormItem {
  id: string;
  itemNo?: string;
  sku?: string;
  description: string;
  koreanDescription: string;
  hsCode: string;
  documentHSCode: string;
  modelName: string;
  specification: string;
  material: string;
  composition: string;
  intendedUse: string;
  originCountry: string;
  quantity: NumericInput | string;
  unit: string;
  unitPrice: NumericInput | string;
  currency: string;
  netWeight: NumericInput | string;
  grossWeight: NumericInput | string;
  measurement: string;
  packageCount: NumericInput | string;
  packageUnit: string;
  shippingMarks: string;
  sourceDocumentIds: string[];
}

export interface TradeFormTerms {
  incoterms: Incoterms | string;
  incotermsPlace: string;
  paymentTerms: string;
  currency: string;
  invoiceAmount: NumericInput | string;
  totalAmount: NumericInput | string;
  reasonForExport: string;
  freightTerms: string;
  freightCharges: string;
  freightPrepaidAt: string;
  freightPayableAt: string;
  lcNo: string;
  lcDate: string;
  lcBank: string;
  insuranceConfirmed: boolean;
  coIssuanceConfirmed: boolean;
  originCriterion: string;
}

export interface TradeFormShipment {
  loadPort: string;
  dischargePort: string;
  placeOfReceipt: string;
  placeOfDelivery: string;
  finalDestination: string;
  departureDate: string;
  arrivalDate: string;
  requestedDepartureDate: string;
  vesselOrFlight: string;
  carrier: string;
  exportDeclarationNo: string;
  bookingNo: string;
  bookingStatus: string;
  loadingMode: string;
  voyageNo: string;
  flag: string;
  blNo: string;
  containerNo: string;
  sealNo: string;
  documentNo: string;
  invoiceNo: string;
  invoiceDate: string;
  referenceNo: string;
  otherReferences: string;
  issuePlace: string;
  issueDate: string;
}

export interface TradeFormPackaging {
  packageCount: NumericInput | string;
  packageType: string;
  netWeight: NumericInput | string;
  grossWeight: NumericInput | string;
  measurement: string;
  shippingMarks: string;
  containerSize: string;
  containerQuantity: NumericInput | string;
}

export interface TradeFormDataV3 {
  schemaVersion: typeof TRADE_FORM_SCHEMA_VERSION;
  direction: TradeType;
  role: TradeRole;
  parties: TradeFormParties;
  items: TradeFormItem[];
  terms: TradeFormTerms;
  shipment: TradeFormShipment;
  packaging: TradeFormPackaging;
  attachments: TradeAttachment[];
}

export interface ImportTradeWorkflowData {
  tradeId?: string;
  analysis: ImportAnalysisResult;
  selectedHSCode?: ImportHSCodeSuggestion;
  duty?: ImportDutyEstimate;
  risks: ImportRisk[];
  cargo?: CargoTrackingResult;
  generatedAt: string;
  flowCompletedAt?: string;
}

export interface TradeWorkflowData {
  importTrade?: ImportTradeWorkflowData;
}

export interface TradeDocumentData {
  generatedDocuments?: GeneratedDocuments;
}

export interface ReconstructedImportTrade extends ImportTradeSnapshot {
  documents: ImportDocumentMeta[];
}
