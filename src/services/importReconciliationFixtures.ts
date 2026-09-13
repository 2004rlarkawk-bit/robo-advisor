import { normalizeImportAnalysisResult } from './importDocumentAnalysisService';
import type {
  ImportAnalysisResult,
  ImportDocumentMeta,
  ImportReconciliationInput,
} from '../types/importTrade';

export interface ImportDemoScenario {
  id: string;
  label: string;
  documents: ImportDocumentMeta[];
  analysis: ImportAnalysisResult;
  input: ImportReconciliationInput;
}

const documents: ImportDocumentMeta[] = [
  { id: 'demo-ci', name: 'Commercial_Invoice.pdf', size: 0, mimeType: 'application/pdf', type: 'commercial_invoice', status: 'analyzed', analysisStatus: 'success', analysisSuccess: true },
  { id: 'demo-pl', name: 'Packing_List.pdf', size: 0, mimeType: 'application/pdf', type: 'packing_list', status: 'analyzed', analysisStatus: 'success', analysisSuccess: true },
  { id: 'demo-bl', name: 'Bill_of_Lading.pdf', size: 0, mimeType: 'application/pdf', type: 'bill_of_lading', status: 'analyzed', analysisStatus: 'success', analysisSuccess: true },
];

export const IMPORT_DEMO_INPUT: ImportReconciliationInput = {
  commercial_invoice: {
    productDescription: 'Wireless Earphone',
    quantity: '1,000 EA',
    unitPrice: 'USD 8.00',
    totalAmount: 'USD 8,000.00',
    currency: 'USD',
    incoterms: 'FOB',
  },
  packing_list: {
    productDescription: 'Wireless Earphone (Bluetooth)',
    quantity: '1,020 EA',
    netWeight: '102 kg',
    grossWeight: '120 kg',
    packageCount: '34 CTN',
  },
  bill_of_lading: {
    productDescription: 'Bluetooth Headset',
    grossWeight: '128 kg',
    packageCount: '34 CTN',
  },
};

export const IMPORT_DEMO_SCENARIO: ImportDemoScenario = {
  id: 'wireless-earphone-mismatch',
  label: '이어폰 수입 오류 세트',
  documents,
  input: IMPORT_DEMO_INPUT,
  analysis: normalizeImportAnalysisResult({
    extracted: {
      shipper: 'HANOI AUDIO TECH CO., LTD.',
      consignee: 'INCHEON SOUND KOREA INC.',
      importer: 'INCHEON SOUND KOREA INC.',
      invoiceNo: 'HAT-2026-0417',
      productDescription: 'Wireless Earphone',
      quantity: '1,000 EA',
      grossWeight: '120 kg',
      netWeight: '102 kg',
      originCountry: 'Vietnam',
      destinationCountry: 'Korea',
      currency: 'USD',
      totalAmount: '8000',
      incoterms: 'FOB',
      loadPort: 'Ho Chi Minh',
      dischargePort: 'Busan',
      blNo: 'HCMBUS26041701',
      items: [{
        id: 'demo-item-1',
        description: 'Wireless Earphone',
        quantity: '1,000',
        quantityUnit: 'EA',
        unitPrice: '8.00',
        currency: 'USD',
        amount: '8000',
        originCountry: 'Vietnam',
        sourceDocumentIds: ['demo-ci', 'demo-pl', 'demo-bl'],
      }],
    },
    validations: [],
    comparison: [
      { field: '품명', invoice: 'Wireless Earphone', packingList: 'Wireless Earphone (Bluetooth)', billOfLading: 'Bluetooth Headset', matches: false, detail: '표기 상이' },
      { field: '수량', invoice: '1,000 EA', packingList: '1,020 EA', billOfLading: '-', matches: false, detail: '20 EA 차이' },
      { field: '단가', invoice: 'USD 8.00', packingList: '-', billOfLading: '-', matches: true, detail: '' },
      { field: '총액', invoice: 'USD 8,000.00', packingList: '-', billOfLading: '-', matches: true, detail: '' },
      { field: '통화', invoice: 'USD', packingList: '-', billOfLading: '-', matches: true, detail: '' },
      { field: '인코텀즈', invoice: 'FOB', packingList: '-', billOfLading: '-', matches: true, detail: '' },
      { field: 'HS CODE', invoice: '(미기재)', packingList: '-', billOfLading: '-', matches: false, detail: 'HS 미기재' },
      { field: '순중량(N/W)', invoice: '-', packingList: '102 kg', billOfLading: '-', matches: true, detail: '' },
      { field: '총중량(G/W)', invoice: '-', packingList: '120 kg', billOfLading: '128 kg', matches: false, detail: '8 kg 차이' },
      { field: '포장수', invoice: '-', packingList: '34 CTN', billOfLading: '34 CTN', matches: true, detail: '' },
    ],
  }),
};
