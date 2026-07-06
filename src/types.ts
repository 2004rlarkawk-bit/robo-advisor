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
}

export type DocumentType =
  | 'invoice'
  | 'packing_list'
  | 'co'
  | 'customs_dec'
  | 'bl'
  | string;

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
  docType: DocumentType;
  field: keyof TradeProfile | string;
  message: string;
  severity: ValidationSeverity;
}

export interface PartyInfo {
  name: string;
  address: string;
  contact: string;
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

export interface GeneratedDocuments {
  documents?: DocumentStatus[];
  invoice?: InvoiceData;
  packingList?: PackingListData;
  certificateOfOrigin?: CertificateOfOriginData;
  htmlTemplates?: Record<string, string>;

  [key: string]: any;
}

export interface SavedTrade {
  id: string;
  profile: TradeProfile;
  documents: DocumentStatus[];
  issues: ValidationIssue[];
  status?: string;
  createdAt: string;
  updatedAt?: string;

  [key: string]: any;
}
