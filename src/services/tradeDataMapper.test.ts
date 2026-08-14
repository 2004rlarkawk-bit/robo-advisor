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

  it('FAS와 운송방식 미정 값을 기존 form_data 구조로 손실 없이 왕복한다', () => {
    const formData = tradeProfileToFormData({ ...profile, incoterms: 'FAS', loadingMode: undefined }, 'shipper');
    const restored = tradeFormDataToProfile(formData);

    expect(formData.terms.incoterms).toBe('FAS');
    expect(formData.shipment.loadingMode).toBe('');
    expect(restored.incoterms).toBe('FAS');
    expect(restored.loadingMode).toBeUndefined();
  });

  it('표준 신규 단위와 기타 직접입력 단위를 form_data에서 그대로 복원한다', () => {
    const formData = tradeProfileToFormData({
      ...profile,
      shipperItems: [
        { ...profile.shipperItems![0], unit: 'PAIR' },
        { ...profile.shipperItems![1], unit: 'DOZ' },
      ],
    }, 'shipper');
    const restored = tradeFormDataToProfile(formData);

    expect(formData.items.map((item) => item.unit)).toEqual(['PAIR', 'DOZ']);
    expect(restored.shipperItems?.map((item) => item.unit)).toEqual(['PAIR', 'DOZ']);
  });

  it('레거시 및 기타 포장종류 문자열을 기존 packaging 필드로 그대로 왕복한다', () => {
    for (const packageType of ['CTNS', 'SACK']) {
      const formData = tradeProfileToFormData({ ...profile, packageType }, 'shipper');
      expect(formData.packaging.packageType).toBe(packageType);
      expect(tradeFormDataToProfile(formData).packageType).toBe(packageType);
    }
  });

  it('수출 포워더 다품목 화물명세를 form_data.items로 저장하고 그대로 복원한다', () => {
    const forwarderProfile: TradeProfile = {
      ...profile,
      shipperItems: undefined,
      forwarderCargoItems: [
        { id: 'cargo-a', itemNo: '1', sku: 'TONER-1', descriptionOfGoods: 'Facial Toner', numberOfPackages: 10, kindOfPackages: 'CARTON', grossWeightKg: 100, measurementCbm: '0.5', marksAndNumbers: 'A', sourceDocumentIds: ['ci', 'pl'] },
        { id: 'cargo-b', itemNo: '2', sku: 'CREAM-1', descriptionOfGoods: 'Moisturizing Cream', numberOfPackages: 20, kindOfPackages: 'CARTON', grossWeightKg: 200, measurementCbm: '1.0', marksAndNumbers: 'B', sourceDocumentIds: ['ci', 'pl'] },
      ],
      forwarderCargoTotals: { numberOfPackages: 30, grossWeightKg: 300, measurementCbm: '1.5' },
    };
    const formData = tradeProfileToFormData(forwarderProfile, 'forwarder');
    const restored = tradeFormDataToProfile(formData);

    expect(formData.items.map(({ description, packageCount, grossWeight }) => ({ description, packageCount, grossWeight }))).toEqual([
      { description: 'Facial Toner', packageCount: 10, grossWeight: 100 },
      { description: 'Moisturizing Cream', packageCount: 20, grossWeight: 200 },
    ]);
    expect(formData.packaging).toMatchObject({ packageCount: 30, grossWeight: 300, measurement: '1.5' });
    expect(restored.forwarderCargoItems).toEqual(forwarderProfile.forwarderCargoItems);
    expect(restored.forwarderCargoTotals).toEqual(forwarderProfile.forwarderCargoTotals);
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
