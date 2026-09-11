import { describe, it, expect, vi } from 'vitest';
import { applyMatchPatchToProfile, matchUploadedExportDocuments } from './exportDocumentMatchService';
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

  it('날짜·문서번호는 앞자리 숫자가 같아도 다르면 불일치로 본다', async () => {
    const [result] = await matchUploadedExportDocuments({
      attachments: [attachment()],
      profile: { ...profile, invoiceNo: 'INV-2026-001', invoiceDate: '2026-09-01' } as TradeProfile,
      items,
      dependencies: deps(extracted({ invoiceNo: 'INV-2026-002', invoiceDate: '2026-09-15' })),
    });
    expect(result.rows.find((row) => row.label === 'Invoice No.')?.status).toBe('mismatch');
    expect(result.rows.find((row) => row.label === 'Invoice 일자')?.status).toBe('mismatch');
  });

  it('용적 단위 표기(M3)는 숫자에 섞이지 않는다', async () => {
    const [result] = await matchUploadedExportDocuments({
      attachments: [attachment({ documentType: 'packing_list' })],
      profile: { ...profile, measurement: '1.25' } as TradeProfile,
      items,
      dependencies: deps(extracted({ measurement: '1.25 M3' })),
    });
    expect(result.rows.find((row) => row.label === '용적(CBM)')?.status).toBe('match');
  });

  it('서류의 N/A·대시·미기재 표기는 불일치가 아니라 확인 불가로 둔다', async () => {
    const [result] = await matchUploadedExportDocuments({
      attachments: [attachment()],
      profile, items,
      dependencies: deps(extracted({ currency: 'N/A', incoterms: '-' })),
    });
    expect(result.rows.find((row) => row.label === '통화')?.status).toBe('unknown');
    expect(result.rows.find((row) => row.label === 'Incoterms')?.status).toBe('unknown');
  });

  it('HS부호는 구두점을 무시하고, 6단위와 10단위가 겹치면 일치로 본다', async () => {
    const hs = (documentHSCode: string) => deps(extracted({
      items: [{ description: 'coat', documentHSCode, quantity: '15' }] as unknown as ImportExtractedFields['items'],
    }));
    const status = async (code: string) => {
      const [result] = await matchUploadedExportDocuments({ attachments: [attachment()], profile, items, dependencies: hs(code) });
      return result.rows.find((row) => row.label === 'HS Code')?.status;
    };
    expect(await status('6201.20-1000')).toBe('match');
    expect(await status('6201.20')).toBe('match');
    expect(await status('6202201000')).toBe('mismatch');
  });

  it('Incoterms·포장 종류·항구는 표기가 달라도 의미가 같으면 일치로 본다', async () => {
    const [invoice] = await matchUploadedExportDocuments({
      attachments: [attachment()], profile, items,
      dependencies: deps(extracted({ incoterms: 'FOB BUSAN' })),
    });
    expect(invoice.rows.find((row) => row.label === 'Incoterms')?.status).toBe('match');

    const [packing] = await matchUploadedExportDocuments({
      attachments: [attachment({ documentType: 'packing_list' })],
      profile: { ...profile, packageType: 'CARTON' } as TradeProfile, items,
      dependencies: deps(extracted({ packageUnit: 'CTNS' })),
    });
    expect(packing.rows.find((row) => row.label === '포장 종류')?.status).toBe('match');

    const [transport] = await matchUploadedExportDocuments({
      attachments: [attachment({ documentType: 'transport_request' })],
      profile: { ...profile, loadPort: 'Busan Port' } as TradeProfile, items,
      dependencies: deps(extracted({ loadPort: 'BUSAN' })),
    });
    expect(transport.rows.find((row) => row.label === '선적항')?.status).toBe('match');
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

  it('품목 필드는 shipperItems 첫 품목에도 반영한다', () => {
    const base = {
      ...profile,
      shipperItems: [
        { id: '1', itemName: 'coat', hsCode: '6201201000', quantity: 15, unit: 'EA', unitPrice: 150, currency: 'USD' },
        { id: '2', itemName: 'hat', hsCode: '6505009000', quantity: 3, unit: 'EA', unitPrice: 20, currency: 'USD' },
      ],
    } as unknown as TradeProfile;

    const next = applyMatchPatchToProfile(base, {
      itemName: 'Frozen Hairtail',
      quantity: '5,000',
      totalAmount: '21250.00',
    });

    expect(next.shipperItems?.[0].itemName).toBe('Frozen Hairtail');
    expect(next.shipperItems?.[0].quantity).toBe(5000);
    // 둘째 품목은 건드리지 않는다.
    expect(next.shipperItems?.[1].itemName).toBe('hat');
    // 숫자 필드는 숫자로 저장한다.
    expect(next.totalAmount).toBe(21250);
  });

  it('품목 외 필드는 프로필에만 반영한다', () => {
    const next = applyMatchPatchToProfile(profile, { invoiceNo: 'INV-2026-123456' });
    expect(next.invoiceNo).toBe('INV-2026-123456');
    expect(next.itemName).toBe(profile.itemName);
  });
});
