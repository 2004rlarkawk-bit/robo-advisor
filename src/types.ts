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
}

export type DocumentType = 'invoice' | 'packing_list' | 'bl' | 'co' | 'customs_dec';

export interface DocumentStatus {
  id: DocumentType;
  name: string;
  status: 'completed' | 'review_required' | 'not_started' | 'not_needed';
  statusText: string;
  lastReviewed?: string;
}

export interface ValidationIssue {
  id: string;
  docType: DocumentType;
  severity: 'warning' | 'info' | 'error';
  message: string;
  field: keyof TradeProfile;
}
