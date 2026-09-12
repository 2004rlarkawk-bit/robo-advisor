import { describe, expect, it } from 'vitest';
import { mapBillOfLadingToSchema, packagesInWords } from './billOfLadingDocxService';
import { createForwarderBillOfLadingDraft } from './forwarderBillOfLadingService';
import { createEmptyForwarderFormState } from '../utils/forwarderForm';

function state() {
  return {
    ...createEmptyForwarderFormState(),
    companyName: 'ABCDEF CO., LTD.',
    companyAddress: '123 Teheran-ro, Seoul, Korea',
    partnerName: 'Global Import LLC',
    partnerAddress: '250 Market St, Los Angeles, USA',
    notifyPartyName: 'Same as Consignee',
    carrier: 'HMM',
    blNo: 'HBLBUSLAX20260913',
    vesselOrFlight: 'HMM ALGECIRAS',
    voyageNo: '0142E',
    loadPort: 'BUSAN, KOREA',
    dischargePort: 'LOS ANGELES, USA',
    containerNo: 'TEMU1234567',
    sealNo: 'SL998877',
    loadingMode: 'FCL' as const,
    freightTerms: 'COLLECT' as const,
    freightPayableAt: 'LOS ANGELES, USA',
    freightPrepaidAt: 'SEOUL',
    totalPrepaid: 'USD 1,000',
    collectAmount: 'USD 1,062.50',
    numberOfOriginals: 3,
    placeOfIssue: 'Seoul, Korea',
    dateOfIssue: '2026-09-30',
    shippedOnBoardDate: '2026-09-24',
    issuerName: 'ABC Forwarding Co., Ltd.',
    cargoItems: [
      { id: '1', itemNo: '1', sku: '', descriptionOfGoods: "WOMEN'S CASHMERE COATS", numberOfPackages: 50 as const, kindOfPackages: 'CARTON', grossWeightKg: 400 as const, measurementCbm: '12.5', marksAndNumbers: 'N/M', sourceDocumentIds: [] },
    ],
    cargoTotals: { numberOfPackages: 50 as const, grossWeightKg: 400 as const, measurementCbm: '12.5' },
  };
}

describe('packagesInWords', () => {
  it('숫자를 영문 문자 표기로 바꾸고 단위를 복수형으로 만든다', () => {
    expect(packagesInWords(50, 'CARTON')).toBe('FIFTY (50) CARTONS ONLY');
    expect(packagesInWords(1, 'PALLET')).toBe('ONE (1) PALLETS ONLY');
    expect(packagesInWords(28, 'CARTONS')).toBe('TWENTY EIGHT (28) CARTONS ONLY');
    expect(packagesInWords(115, 'BOX')).toBe('ONE HUNDRED FIFTEEN (115) BOXES ONLY'.replace('BOXES', 'BOXS'));
    expect(packagesInWords(2400, 'CTN')).toBe('TWO THOUSAND FOUR HUNDRED (2,400) CTNS ONLY');
  });

  it('값이 없거나 0 이하이면 빈 문자열', () => {
    expect(packagesInWords('', 'CARTON')).toBe('');
    expect(packagesInWords(0, 'CARTON')).toBe('');
  });
});

describe('mapBillOfLadingToSchema', () => {
  const schema = mapBillOfLadingToSchema(createForwarderBillOfLadingDraft(state(), 'trade-1'));

  it('무역협회 서식 항목에 값을 매핑한다', () => {
    expect(schema.shipper_name).toBe('ABCDEF CO., LTD.');
    expect(schema.consignee).toContain('Global Import LLC');
    expect(schema.ocean_vessel).toBe('HMM ALGECIRAS');
    expect(schema.voyage_no).toBe('0142E');
    expect(schema.bl_no).toBe('HBLBUSLAX20260913');
    expect(schema.gross_weight).toBe('400 KGS');
    expect(schema.measurement).toBe('12.5 CBM');
    expect(schema.packages).toBe('50 CARTON');
    expect(schema.place_and_date_of_issue).toBe('Seoul, Korea, 2026-09-30');
    expect(schema.laden_on_board_date).toBe('2026-09-24');
    expect(schema.no_of_original_bl).toBe('THREE (3)');
  });

  it('컨테이너·Seal·화인을 ⑬⑭ 한 칸에 묶어 넣는다', () => {
    expect(schema.container_seal_marks).toBe('CNTR TEMU1234567\nSEAL SL998877\nN/M');
  });

  it('COLLECT면 후불 칸만 채우고 선불 칸은 비운다', () => {
    expect(schema.collect).toBe('USD 1,062.50');
    expect(schema.freight_payable_at).toBe('LOS ANGELES, USA');
    expect(schema.prepaid).toBe('');
    expect(schema.freight_prepaid_at).toBe('');
    expect(schema.total_prepaid_in).toBe('');
  });

  it('PREPAID면 반대로 선불 칸만 채운다', () => {
    const prepaid = mapBillOfLadingToSchema(
      createForwarderBillOfLadingDraft({ ...state(), freightTerms: 'PREPAID' as const }, 'trade-1'),
    );
    expect(prepaid.prepaid).toBe('USD 1,000');
    expect(prepaid.freight_prepaid_at).toBe('SEOUL');
    expect(prepaid.collect).toBe('');
    expect(prepaid.freight_payable_at).toBe('');
  });

  it('B/L 번호가 없으면 초안 번호에 DRAFT를 붙여 원본과 구분한다', () => {
    const draft = mapBillOfLadingToSchema(
      createForwarderBillOfLadingDraft({ ...state(), blNo: '' }, '12345678-abcd-0000-0000-000000000000'),
    );
    expect(draft.bl_no).toContain('(DRAFT)');
  });

  it('발행 자격을 서식 문구로 변환한다', () => {
    expect(schema.signer_capacity).toBe('as Carrier');
    const agent = mapBillOfLadingToSchema(
      createForwarderBillOfLadingDraft({ ...state(), signerCapacity: 'AS_AGENT_FOR_CARRIER' as const }, 'trade-1'),
    );
    expect(agent.signer_capacity).toBe('as agent for a carrier');
  });
});
