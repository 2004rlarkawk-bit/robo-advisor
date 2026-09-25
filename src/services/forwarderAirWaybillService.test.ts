import { describe, expect, it } from 'vitest';
import { createEmptyForwarderFormState, type ForwarderFormState } from '../utils/forwarderForm';
import {
  createForwarderAirWaybillDraft,
  transportDocumentLabel,
  validateForwarderAirWaybill,
} from './forwarderAirWaybillService';

function airState(overrides: Partial<ForwarderFormState> = {}): ForwarderFormState {
  return {
    ...createEmptyForwarderFormState(),
    methodOfDispatch: 'AIR',
    companyName: 'Exporter Co.',
    companyAddress: '1 Port Road, Seoul',
    partnerName: 'Importer Inc.',
    partnerAddress: '2 Harbor Street, Los Angeles',
    carrier: 'Korean Air',
    vesselOrFlight: 'KE017',
    flightDate: '2026-10-02',
    loadPort: 'ICN',
    dischargePort: 'LAX',
    freightTerms: 'PREPAID',
    placeOfIssue: 'Seoul, Korea',
    dateOfIssue: '2026-10-01',
    issuerName: 'PortAI Logistics',
    cargoItems: [{
      id: 'cargo-1',
      itemNo: '1',
      sku: '',
      descriptionOfGoods: "WOMEN'S CASHMERE COATS",
      numberOfPackages: 10,
      kindOfPackages: 'CARTON',
      grossWeightKg: 120,
      measurementCbm: '0.500',
      marksAndNumbers: 'N/M',
      sourceDocumentIds: [],
    }],
    ...overrides,
  };
}

describe('항공화물운송장(AWB) 발행 검증', () => {
  it('항공 기재사항이 모두 있으면 발행할 수 있다', () => {
    const result = validateForwarderAirWaybill(airState());
    expect(result.valid).toBe(true);
    expect(result.missingLabels).toEqual([]);
  });

  it('항공편·공항·항공사가 비면 발행을 막는다', () => {
    const result = validateForwarderAirWaybill(airState({
      carrier: '', vesselOrFlight: '', loadPort: '', dischargePort: '',
    }));
    expect(result.valid).toBe(false);
    expect(result.missingLabels).toEqual([
      'Issuing Carrier (항공사)',
      'Flight No. (항공편명)',
      'Airport of Departure (출발 공항)',
      'Airport of Destination (도착 공항)',
    ]);
  });

  it('선하증권 전용 항목(본선적재일·컨테이너)은 발행 조건으로 보지 않는다', () => {
    const result = validateForwarderAirWaybill(airState({
      shippedOnBoardDate: '', containerNo: '', loadingMode: 'FCL',
    }));
    expect(result.valid).toBe(true);
    expect(result.warningLabels.join(' ')).not.toContain('Container');
    expect(result.warningLabels.join(' ')).not.toContain('Shipped on Board');
  });

  it('운송장 번호 형식이 어긋나면 경고한다', () => {
    expect(validateForwarderAirWaybill(airState({ awbNo: '180-12345675' })).warningLabels.join(' '))
      .not.toContain('AWB No.');
    expect(validateForwarderAirWaybill(airState({ awbNo: '12345' })).warningLabels.join(' '))
      .toContain('AWB No.');
  });

  it('신고가격과 항공편 출발일이 비면 경고만 남기고 발행은 허용한다', () => {
    const result = validateForwarderAirWaybill(airState({ flightDate: '' }));
    expect(result.valid).toBe(true);
    expect(result.warningLabels.join(' ')).toContain('Flight Date');
    expect(result.warningLabels.join(' ')).toContain('NVD');
  });
});

describe('항공화물운송장 초안 생성', () => {
  it('항공 전용 값을 담고 해상 전용 값은 비운다', () => {
    const draft = createForwarderAirWaybillDraft(
      airState({ awbNo: '180-12345675', handlingInformation: 'KEEP DRY' }),
      '34f7f52e-8a83-4194-b334-2a2d72f61a98',
      '2026-10-01T00:00:00.000Z',
    );
    expect(draft.transportMode).toBe('AIR');
    expect(draft.draftNo).toBe('AWB-DRAFT-34F7F52E');
    expect(draft.awbNo).toBe('180-12345675');
    expect(draft.vessel).toBe('KE017');
    expect(draft.flightDate).toBe('2026-10-02');
    expect(draft.loadPort).toBe('ICN');
    expect(draft.dischargePort).toBe('LAX');
    expect(draft.handlingInformation).toBe('KEEP DRY');
    // 유통증권이 아니라 원본 통수·본선적재일·컨테이너는 쓰지 않는다.
    expect(draft.numberOfOriginals).toBe(0);
    expect(draft.shippedOnBoardDate).toBe('');
    expect(draft.voyageNo).toBe('');
    expect(draft.containerNo).toBe('');
    expect(draft.loadingMode).toBe('');
  });

  it('화물 명세와 발행 정보는 선하증권과 같은 구조로 담는다', () => {
    const draft = createForwarderAirWaybillDraft(airState(), 'trade-1', '2026-10-01T00:00:00.000Z');
    expect(draft.items).toEqual([{
      descriptionOfGoods: "WOMEN'S CASHMERE COATS",
      numberOfPackages: 10,
      kindOfPackages: 'CARTON',
      grossWeightKg: 120,
      measurementCbm: '0.500',
      marksAndNumbers: 'N/M',
    }]);
    expect(draft.issuerName).toBe('PortAI Logistics');
    expect(draft.dateOfIssue).toBe('2026-10-01');
    expect(draft.freightTerms).toBe('PREPAID');
  });

  it('발행일자를 비우면 생성 시각의 날짜를 쓴다', () => {
    const draft = createForwarderAirWaybillDraft(airState({ dateOfIssue: '' }), 'trade-1', '2026-10-05T09:00:00.000Z');
    expect(draft.dateOfIssue).toBe('2026-10-05');
  });
});

describe('운송 방식별 문서 이름', () => {
  it('항공은 AWB, 해상과 미지정은 B/L로 부른다', () => {
    expect(transportDocumentLabel('AIR')).toBe('항공화물운송장(AWB)');
    expect(transportDocumentLabel('SEA')).toBe('선하증권(B/L)');
    expect(transportDocumentLabel(undefined)).toBe('선하증권(B/L)');
  });
});

describe('항공화물운송장 서식 매핑', () => {
  it('서식 칸에 항공 값·관행 표기(NVD·NCV·FREIGHT PREPAID)를 채운다', async () => {
    const { mapAirWaybillToSchema } = await import('./airWaybillDocxService');
    const draft = createForwarderAirWaybillDraft(
      airState({
        awbNo: '180-12345675',
        handlingInformation: 'KEEP DRY',
        revenueTons: '520.0 KG',
        freightRate: 'USD 4.80',
        freightPer: 'KG',
        totalPrepaid: 'USD 2,496.00',
        incoterms: 'CIF',
        cargoTotals: { numberOfPackages: 10, grossWeightKg: 500, measurementCbm: '' },
      }),
      'trade-1',
      '2026-10-01T00:00:00.000Z',
      '180-12345675',
    );
    const schema = mapAirWaybillToSchema(draft);
    expect(schema.awb_no).toBe('180-12345675');
    expect(schema.mawb_reference).toBe('180-12345675');
    expect(schema.airport_of_departure).toBe('ICN');
    expect(schema.requested_routing).toBe('ICN - LAX');
    expect(schema.flight_and_date).toBe('KE017 / 2026-10-02');
    expect(schema.accounting_information).toBe('FREIGHT PREPAID');
    expect(schema.declared_value_carriage).toBe('NVD');
    expect(schema.declared_value_customs).toBe('NCV');
    expect(schema.amount_of_insurance).toBe('NIL');
    expect(schema.no_of_pieces).toBe('10 CARTON');
    expect(schema.gross_weight).toBe('500 KG');
    expect(schema.chargeable_weight).toBe('520.0 KG');
    expect(schema.rate_charge).toBe('USD 4.80 / KG');
    expect(schema.handling_information).toBe('KEEP DRY');
    expect(schema.incoterms).toBe('CIF');
    expect(schema.collect).toBe('');
    expect(schema.signer_capacity).toBe('as Carrier');
  });

  it('초안 번호뿐이면 (DRAFT)를 붙여 실제 운송장과 구분한다', async () => {
    const { mapAirWaybillToSchema } = await import('./airWaybillDocxService');
    const draft = createForwarderAirWaybillDraft(airState(), 'trade-1', '2026-10-01T00:00:00.000Z');
    expect(mapAirWaybillToSchema(draft).awb_no).toBe('AWB-DRAFT-TRADE1 (DRAFT)');
  });
});
