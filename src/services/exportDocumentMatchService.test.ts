import { describe, it, expect, vi } from 'vitest';
import { matchUploadedExportDocuments } from './exportDocumentMatchService';
import type { ShipperItem, TradeProfile } from '../types';
import type { TradeAttachment } from '../types/tradeFormData';
import type { ImportExtractedFields } from '../types/importTrade';

const attachment = (overrides: Partial<TradeAttachment> = {}): TradeAttachment => ({
  id: 'att-1',
  documentType: 'commercial_invoice',
  fileName: 'invoice.pdf',
  storageBucket: 'trade-documents',
  storagePath: 'user/trade/invoice.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  uploadedAt: '2026-09-10T00:00:00.000Z',
  ...overrides,
});

const profile = {
  companyName: 'Test Export Co.',
  partnerName: 'Test Import Company',
  invoiceNo: 'INV-2026-398930',
  itemName: 'coat',
  hsCode: '6201201000',
  quantity: 15,
  unitPrice: 150,
  totalAmount: 2250,
  currency: 'USD',
  incoterms: 'FOB',
} as unknown as TradeProfile;

const items: ShipperItem[] = [
  { id: '1', itemName: 'coat', hsCode: '6201201000', quantity: 15, unit: 'EA', unitPrice: 150, currency: 'USD' },
];

function extracted(overrides: Partial<ImportExtractedFields> = {}): ImportExtractedFields {
  return {
    shipper: 'Test Export Co.',
    consignee: 'Test Import Company',
    notifyParty: '', importer: '',
    invoiceNo: 'INV-2026-398930',
    productDescription: 'coat',
    quantity: '12',
    grossWeight: '', netWeight: '', originCountry: '', destinationCountry: '',
    currency: 'USD',
    totalAmount: '1,800',
    loadPort: '', dischargePort: '', blNo: '', containerNo: '', sealNo: '',
    vesselName: '', voyageNo: '', exportDeclarationNo: '', loadingMode: '',
    measurement: '', shippingMarks: '',
    exporterDetails: { name: 'Test Export Co.', address: '', country: '', contactName: '', phone: '', email: '' },
    importerDetails: { name: '', address: '', country: '', contactName: '', phone: '', email: '' },
    consigneeDetails: { name: 'Test Import Company', address: '', country: '', contactName: '', phone: '', email: '' },
    notifyPartyDetails: { name: '', address: '', country: '', contactName: '', phone: '', email: '' },
    invoiceDate: '', incoterms: 'FOB', paymentTerms: '', shipmentDate: '', estimatedArrivalDate: '',
    containerNumbers: [], sealNumbers: [],
    items: [],
    cargoTotals: { numberOfPackages: '', grossWeightKg: '', measurementCbm: '' },
    certificateOfOriginAvailable: false,
    totalPackageCount: '', packageUnit: '', grossWeightUnit: '', netWeightUnit: '',
    freight: '', insurance: '', otherAdditions: '',
    ...overrides,
  } as ImportExtractedFields;
}

const deps = (fields: ImportExtractedFields) => ({
  analyze: vi.fn().mockResolvedValue({
    classifications: [],
    analysis: { extracted: fields, validations: [], comparison: [] },
  }),
  loadFile: vi.fn().mockResolvedValue(new File(['x'], 'invoice.pdf')),
}) as never;

describe('matchUploadedExportDocuments', () => {
  it('업로드 서류 값과 입력값이 다르면 불일치로 표시한다', async () => {
    const [result] = await matchUploadedExportDocuments({
      attachments: [attachment()], profile, items, dependencies: deps(extracted()),
    });

    const quantity = result.rows.find((row) => row.label === '수량');
    expect(quantity?.uploadedValue).toBe('12');
    expect(quantity?.formValue).toBe('15');
    expect(quantity?.status).toBe('mismatch');

    const total = result.rows.find((row) => row.label === '총액');
    expect(total?.status).toBe('mismatch');
    expect(result.mismatchCount).toBeGreaterThanOrEqual(2);
  });

  it('값이 같으면 일치로 본다', async () => {
    const [result] = await matchUploadedExportDocuments({
      attachments: [attachment()], profile, items, dependencies: deps(extracted()),
    });
    expect(result.rows.find((row) => row.label === '수출자')?.status).toBe('match');
    expect(result.rows.find((row) => row.label === 'Invoice No.')?.status).toBe('match');
    expect(result.rows.find((row) => row.label === 'Incoterms')?.status).toBe('match');
  });

  it('쉼표·소수점 표기 차이는 불일치로 보지 않는다', async () => {
    const [result] = await matchUploadedExportDocuments({
      attachments: [attachment()],
      profile: { ...profile, totalAmount: 1800 } as TradeProfile,
      items,
      dependencies: deps(extracted({ totalAmount: '1,800.00' })),
    });
    expect(result.rows.find((row) => row.label === '총액')?.status).toBe('match');
  });

  it('한쪽 값이 없으면 확인 불가로 둔다', async () => {
    const [result] = await matchUploadedExportDocuments({
      attachments: [attachment()],
      profile,
      items,
      dependencies: deps(extracted({ invoiceDate: '2026-07-29' })),
    });
    expect(result.rows.find((row) => row.label === 'Invoice 일자')?.status).toBe('unknown');
  });

  it('분석에 실패해도 다른 서류 결과를 막지 않는다', async () => {
    const failing = {
      analyze: vi.fn().mockRejectedValue(new Error('analysis down')),
      loadFile: vi.fn().mockResolvedValue(new File(['x'], 'invoice.pdf')),
    } as never;
    const [result] = await matchUploadedExportDocuments({
      attachments: [attachment()], profile, items, dependencies: failing,
    });
    expect(result.error).toContain('대조하지 못했습니다');
    expect(result.rows).toEqual([]);
  });

  it('대조 대상이 아닌 첨부는 건너뛴다', async () => {
    const results = await matchUploadedExportDocuments({
      attachments: [attachment({ documentType: 'other' })],
      profile, items, dependencies: deps(extracted()),
    });
    expect(results).toEqual([]);
  });
});
