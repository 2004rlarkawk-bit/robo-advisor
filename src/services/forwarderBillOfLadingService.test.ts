import { describe, expect, it } from 'vitest';
import { renderBillOfLadingHTML } from '../agents/templates/billOfLading';
import { createEmptyForwarderFormState } from '../utils/forwarderForm';
import {
  createForwarderBillOfLadingDraft,
  validateForwarderBillOfLading,
} from './forwarderBillOfLadingService';

function validState() {
  return {
    ...createEmptyForwarderFormState(),
    companyName: 'K Exporter',
    companyAddress: 'Seoul, Korea',
    partnerName: 'US Importer',
    partnerAddress: 'Los Angeles, USA',
    carrier: 'Ocean Carrier',
    vesselOrFlight: 'PORTAI STAR',
    voyageNo: 'V001',
    loadPort: 'Busan Port',
    dischargePort: 'Los Angeles Port',
    cargoItems: [
      { id: '1', itemNo: '', sku: '', descriptionOfGoods: 'Serum', numberOfPackages: 10 as const, kindOfPackages: 'CARTON', grossWeightKg: 100 as const, measurementCbm: '0.50', marksAndNumbers: 'SERUM', sourceDocumentIds: [] },
      { id: '2', itemNo: '', sku: '', descriptionOfGoods: 'Cream', numberOfPackages: 20 as const, kindOfPackages: 'CARTON', grossWeightKg: 200 as const, measurementCbm: '1.00', marksAndNumbers: '', sourceDocumentIds: [] },
      { id: '3', itemNo: '', sku: '', descriptionOfGoods: 'Foam', numberOfPackages: 30 as const, kindOfPackages: 'CARTON', grossWeightKg: 300 as const, measurementCbm: '1.50', marksAndNumbers: '', sourceDocumentIds: [] },
    ],
    cargoTotals: { numberOfPackages: 60 as const, grossWeightKg: 600 as const, measurementCbm: '3.00' },
    freightTerms: 'PREPAID' as const,
    placeOfIssue: 'Seoul, Korea',
    dateOfIssue: '2026-08-15',
    issuerName: 'PortAI Logistics Co., Ltd.',
  };
}

describe('수출 포워더 B/L 초안', () => {
  it('Booking No., ETD, ETA, Marks 없이도 필수값 검증을 통과한다', () => {
    const result = validateForwarderBillOfLading(validState());
    expect(result.valid).toBe(true);
    expect(result.missingLabels).toEqual([]);
  });

  it('법정 기재사항 누락을 빠짐없이 보고한다', () => {
    const result = validateForwarderBillOfLading(createEmptyForwarderFormState());
    expect(result.missingLabels).toEqual([
      'Shipper', 'Consignee', 'Description of Goods', 'No. & Kind of Packages',
      'Gross Weight', 'Carrier', 'Vessel', 'Voyage No.', 'POL', 'POD',
      'Freight Terms (운임)', 'Place of Issue (발행지)', 'Date of Issue (발행일자)',
      'Issued by (발행자)',
    ]);
  });

  it('운임·발행지·발행일자·발행자가 없으면 발행할 수 없다', () => {
    const state = { ...validState(), freightTerms: '' as const };
    expect(validateForwarderBillOfLading(state).missingLabels).toContain('Freight Terms (운임)');

    const noIssuer = { ...validState(), issuerName: '' };
    expect(validateForwarderBillOfLading(noIssuer).valid).toBe(false);
  });

  it('본선적재일이 없으면 수취선하증권 경고를 남기되 발행은 막지 않는다', () => {
    const result = validateForwarderBillOfLading(validState());
    expect(result.valid).toBe(true);
    expect(result.warningLabels.some((label) => label.includes('Shipped on Board'))).toBe(true);
  });

  it('FCL인데 컨테이너 번호가 없으면 경고한다', () => {
    const result = validateForwarderBillOfLading({ ...validState(), loadingMode: 'FCL' as const });
    expect(result.warningLabels.some((label) => label.includes('Container No.'))).toBe(true);
  });

  it('인수지·인도지를 비우면 POL·POD를 그대로 사용한다', () => {
    const draft = createForwarderBillOfLadingDraft(validState(), 'trade-1');
    expect(draft.placeOfReceipt).toBe('Busan Port');
    expect(draft.placeOfDelivery).toBe('Los Angeles Port');
  });

  it('House B/L 기본값과 발행 정보를 초안에 반영한다', () => {
    const draft = createForwarderBillOfLadingDraft(validState(), 'trade-1');
    expect(draft.kind).toBe('house');
    expect(draft.numberOfOriginals).toBe(3);
    expect(draft.signerCapacity).toBe('AS_CARRIER');
    expect(draft.issuerName).toBe('PortAI Logistics Co., Ltd.');
    expect(draft.dateOfIssue).toBe('2026-08-15');
  });

  it('3개 품목을 모두 유지하고 TOTAL은 cargoTotals를 그대로 사용한다', () => {
    const draft = createForwarderBillOfLadingDraft(validState(), '12345678-abcd-0000-0000-000000000000', '2026-08-15T01:02:03.000Z');
    expect(draft.items.map((item) => item.descriptionOfGoods)).toEqual(['Serum', 'Cream', 'Foam']);
    expect(draft.cargoTotals).toEqual({ numberOfPackages: 60, grossWeightKg: 600, measurementCbm: '3.00' });

    const html = renderBillOfLadingHTML(draft);
    expect(html).toContain('Serum');
    expect(html).toContain('Cream');
    expect(html).toContain('Foam');
    expect(html).toContain('3.00');
  });

  it('사용자 입력을 HTML에 안전하게 이스케이프한다', () => {
    const state = validState();
    state.cargoItems[0].descriptionOfGoods = '<script>alert(1)</script>';
    const html = renderBillOfLadingHTML(createForwarderBillOfLadingDraft(state, 'trade-1'));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
