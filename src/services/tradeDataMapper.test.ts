import { describe, expect, it } from 'vitest';
import type { TradeProfile } from '../types';
import type { ArrivalNoticeMeta, ImportDocumentMeta } from '../types/importTrade';
import {
  arrivalNoticeToAttachment,
  findArrivalNotice,
  hasValidStoragePath,
  importDocumentToAttachment,
  tradeFormDataToProfile,
  tradeProfileToFormData,
} from './tradeDataMapper';
import { getCompletedImportStatus } from './storageService';

const profile: TradeProfile = {
  tradeType: 'export',
  itemName: 'Primary item',
  hsCode: '6109100000',
  loadPort: 'Busan',
  dischargePort: 'Los Angeles',
  incoterms: 'FOB',
  quantity: 5,
  weight: 20,
  departureDate: '2026-08-01',
  arrivalDate: '2026-08-20',
  companyName: 'Exporter Co.',
  companyAddress: '1 Port Road',
  companyCountry: 'KR',
  contact: '010-0000-0000',
  contactName: 'Kim',
  businessRegistrationNo: '123-45-67890',
  partnerName: 'Importer Inc.',
  partnerAddress: '2 Harbor Street',
  partnerCountry: 'US',
  partnerContact: '+1-555-0100',
  buyerName: 'Buyer Inc.',
  buyerAddress: '3 Buyer Avenue',
  buyerCountry: 'US',
  notifyPartyName: 'Notify Inc.',
  notifyPartyAddress: '4 Notify Lane',
  notifyPartyContact: '+1-555-0200',
  currency: 'USD',
  invoiceAmount: 60,
  paymentTerms: 'T/T',
  invoiceNo: 'INV-1',
  invoiceDate: '2026-07-30',
  blNo: 'BL-1',
  containerNo: 'CONT-1',
  sealNo: 'SEAL-1',
  packageCount: 2,
  packageType: 'CTN',
  netWeight: 18,
  grossWeight: 20,
  measurement: '1.5 CBM',
  shippingMarks: 'N/M',
  signedBy: 'Kim',
  shipperItems: [
    { id: 'a', itemName: 'Item A', hsCode: '6109100000', quantity: 2, unit: 'EA', unitPrice: 10, currency: 'USD' },
    { id: 'b', itemName: 'Item B', hsCode: '6203420000', quantity: 4, unit: 'PCS', unitPrice: 10, currency: 'USD' },
  ],
  shipperSupplemental: {
    buyerMatchesConsignee: true,
    consigneeMatchesNotifyParty: true,
    incotermsPlace: 'Busan Port',
    originCriterion: '세번변경기준',
  },
};

describe('TradeFormData v3 mapper', () => {
  it('flat profile을 공통 top-level 계약과 다중 items로 변환한다', () => {
    const formData = tradeProfileToFormData(profile, 'shipper');

    expect(Object.keys(formData)).toEqual([
      'schemaVersion',
      'direction',
      'role',
      'parties',
      'items',
      'terms',
      'shipment',
      'packaging',
      'attachments',
    ]);
    expect(formData.schemaVersion).toBe(3);
    expect(formData.direction).toBe('export');
    expect(formData.role).toBe('shipper');
    expect(formData.items.map((item) => item.description)).toEqual(['Item A', 'Item B']);
    expect(formData).not.toHaveProperty('profile');
    expect(formData).not.toHaveProperty('itemName');
  });

  it('form_data를 현재 화면/Agent TradeProfile로 복원한다', () => {
    const restored = tradeFormDataToProfile(tradeProfileToFormData(profile, 'shipper'));

    expect(restored).toMatchObject({
      tradeType: 'export',
      companyName: 'Exporter Co.',
      partnerName: 'Importer Inc.',
      buyerName: 'Buyer Inc.',
      notifyPartyName: 'Notify Inc.',
      invoiceNo: 'INV-1',
      blNo: 'BL-1',
      packageCount: 2,
      grossWeight: 20,
    });
    expect(restored.shipperItems?.map((item) => item.itemName)).toEqual(['Item A', 'Item B']);
  });
});
describe('첨부파일 persistence 계약', () => {
  const validArrival: ArrivalNoticeMeta = {
    id: 'arrival-1',
    documentType: 'arrival_notice',
    fileName: 'arrival.pdf',
    storageBucket: 'trade-documents',
    storagePath: 'user/trade/arrival.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 123,
    uploadedAt: '2026-07-30T00:00:00.000Z',
  };

  it('도착통지서는 유효한 storagePath가 있을 때만 attachment가 된다', () => {
    expect(arrivalNoticeToAttachment({ ...validArrival, storagePath: '  ' })).toBeNull();
    const attachment = arrivalNoticeToAttachment(validArrival);
    expect(attachment).toMatchObject({
      documentType: 'arrival_notice',
      storagePath: 'user/trade/arrival.pdf',
      sizeBytes: 123,
    });
    const formData = tradeProfileToFormData({ ...profile, tradeType: 'import' }, 'forwarder', [attachment!]);
    expect(findArrivalNotice(formData)).toEqual(validArrival);
  });

  it('일반 수입 문서도 Storage 경로 없는 metadata는 attachments에 넣지 않는다', () => {
    const document: ImportDocumentMeta = {
      id: 'document-1',
      name: 'invoice.pdf',
      size: 200,
      mimeType: 'application/pdf',
      type: 'commercial_invoice',
      status: 'ready',
    };
    expect(importDocumentToAttachment(document)).toBeNull();
    expect(importDocumentToAttachment({
      ...document,
      storageBucket: 'trade-documents',
      storagePath: 'user/trade/invoice.pdf',
      uploadedAt: '2026-07-30T00:00:00.000Z',
    })).toMatchObject({
      documentType: 'commercial_invoice',
      fileName: 'invoice.pdf',
    });
  });

  it('수입 포워더 완료 상태는 arrival_notice의 storagePath로만 결정한다', () => {
    expect(hasValidStoragePath(validArrival)).toBe(true);
    expect(getCompletedImportStatus('forwarder', null)).toBe('in_progress');
    expect(getCompletedImportStatus('forwarder', { ...validArrival, storagePath: '' })).toBe('in_progress');
    expect(getCompletedImportStatus('forwarder', validArrival)).toBe('submitted');
    expect(getCompletedImportStatus('shipper', null)).toBe('submitted');
  });
});
