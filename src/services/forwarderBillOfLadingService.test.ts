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
  };
}

describe('수출 포워더 B/L 초안', () => {
  it('Booking No., ETD, ETA, Marks 없이도 필수값 검증을 통과한다', () => {
    const result = validateForwarderBillOfLading(validState());
    expect(result).toEqual({ valid: true, missingLabels: [] });
  });

  it('generator가 요구하는 최소 필수값만 정확히 보고한다', () => {
    const result = validateForwarderBillOfLading(createEmptyForwarderFormState());
    expect(result.missingLabels).toEqual([
      'Shipper', 'Consignee', 'Description of Goods', 'Carrier',
      'Vessel', 'Voyage No.', 'POL', 'POD',
    ]);
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
