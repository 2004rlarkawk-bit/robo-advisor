import { describe, expect, it } from 'vitest';
import { formatClearanceStatus, formatDateTime, mapDispatchToSchema } from './importDispatchDocxService';
import type { ImportDeliveryRequest, ImportDispatchRequest } from '../types/importTrade';
import type { ForwarderImportCase } from '../types/forwarderCase';

const dispatch: ImportDispatchRequest = {
  carrierCompany: '한빛운송', attention: '김배차', doNo: 'DO-2026-771', terminal: '부산신항 PNIT',
  pickupPlace: '부산신항 PNIT', pickupAt: '2026-09-20T09:00', emptyReturnPlace: '부산신항 공컨장치장',
  emptyReturnDue: '2026-09-23', vehicleType: '트랙터', settlement: '착불',
  remarks: '야간 상차 불가', vehicleNo: '', driverName: '', driverTel: '',
  issuedAt: '2026-09-18T10:00:00.000Z',
};

const delivery: ImportDeliveryRequest = {
  deliveryAddress: '경기도 화성시 동탄산단로 123',
  deliveryAt: '2026-09-21T14:00',
  contactName: '박수령', contactTel: '010-1111-2222',
  remarks: '지게차 없음', updatedAt: '2026-09-15T00:00:00.000Z',
};

function caseItem(overrides: Partial<ForwarderImportCase> = {}): ForwarderImportCase {
  return {
    tradeId: '12345678-abcd-0000-0000-000000000000',
    blNo: 'HBL-2026-99', vesselName: 'HMM ALGECIRAS', eta: '2026-09-19',
    arrivalNotice: null,
    snapshot: {
      analysis: {
        extracted: {
          blNo: 'HBL-2026-99', vesselName: 'HMM ALGECIRAS', estimatedArrivalDate: '2026-09-19',
          dischargePort: 'BUSAN, KOREA', containerNo: 'TEMU1234567', sealNo: 'SL998877',
          productDescription: 'CASHMERE COATS', quantity: '50 CARTON',
          grossWeight: '400', netWeight: '380', measurement: '12.5',
          items: [{ description: 'CASHMERE COATS' }],
        },
      },
      deliveryRequest: delivery,
    },
    ...overrides,
  } as unknown as ForwarderImportCase;
}

describe('formatDateTime', () => {
  it('datetime-local 값을 읽기 쉬운 형식으로 바꾼다', () => {
    expect(formatDateTime('2026-09-20T09:00')).toBe('2026-09-20 09:00');
  });
  it('빈 값은 빈 문자열', () => {
    expect(formatDateTime('')).toBe('');
  });
});

describe('formatClearanceStatus', () => {
  it('해당 단계에만 표시를 남긴다', () => {
    const result = formatClearanceStatus('D/O 발급');
    expect(result).toContain('[V] D/O 발급');
    expect(result).toContain('[ ] 미통관');
  });
});

describe('mapDispatchToSchema', () => {
  const schema = mapDispatchToSchema(caseItem(), dispatch, delivery, '포트에이아이 포워딩', '02-000-0000');

  it('포워더가 정한 값을 운송 요청 칸에 넣는다', () => {
    expect(schema.to).toBe('한빛운송');
    expect(schema.do_no).toBe('DO-2026-771');
    expect(schema.pickup_place).toBe('부산신항 PNIT');
    expect(schema.pickup_at).toBe('2026-09-20 09:00');
    expect(schema.empty_return_place).toBe('부산신항 공컨장치장');
    expect(schema.vehicle_type).toBe('트랙터');
    expect(schema.freight_settlement).toBe('착불');
  });

  it('화주 배송 요청을 배송 칸으로 그대로 옮긴다', () => {
    expect(schema.delivery_address).toBe('경기도 화성시 동탄산단로 123');
    expect(schema.delivery_at).toBe('2026-09-21 14:00');
    expect(schema.consignee_contact_name).toBe('박수령');
    expect(schema.consignee_contact_tel).toBe('010-1111-2222');
  });

  it('서류에서 뽑은 선적·화물 정보를 자동으로 채운다', () => {
    expect(schema.mbl_no).toBe('HBL-2026-99');
    expect(schema.vessel_voyage).toBe('HMM ALGECIRAS');
    expect(schema.eta).toBe('2026-09-19');
    expect(schema.pod).toBe('BUSAN, KOREA');
    expect(schema.container_no).toBe('TEMU1234567');
    expect(schema.seal_no).toBe('SL998877');
    expect(schema.gross_weight).toBe('400');
  });

  it('포워더 특이사항과 화주 요청사항을 함께 싣는다', () => {
    expect(schema.remarks).toContain('야간 상차 불가');
    expect(schema.remarks).toContain('[화주 요청] 지게차 없음');
  });

  it('화주 배송 요청이 없으면 배송 칸을 비워 둔다', () => {
    const none = mapDispatchToSchema(caseItem(), dispatch, undefined, '포트에이아이 포워딩');
    expect(none.delivery_address).toBe('');
    expect(none.consignee_contact_name).toBe('');
    expect(none.remarks).toBe('야간 상차 불가');
  });
});
