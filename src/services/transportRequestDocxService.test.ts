import { describe, expect, it } from 'vitest';
import { mapTransportRequestToSchema } from './transportRequestDocxService';
import type { TransportRequestData } from '../types';

function request(overrides: Partial<TransportRequestData> = {}): TransportRequestData {
  return {
    requestNo: 'TR-2026-0913-001',
    requestDate: '2026-09-13',
    exporter: { name: '22 OFFICE CO., LTD', address: '125 Gangnam-ro, Seoul, Republic of Korea', contact: '02-000-0000' },
    requesterName: 'KIM JIMIN',
    businessRegistrationNo: '123-45-67890',
    consignee: { name: 'Global Import LLC', address: '250 Market St, Los Angeles, CA, United States', contact: '' },
    notifyParty: { name: 'Same as Consignee', address: '', contact: '' },
    items: [
      { description: "Women's Cashmere Coats", hsCode: '6202110000', quantity: 200, unit: 'PCS', packageCount: 20, packageType: 'CARTON', netWeight: 400, grossWeight: 450, measurement: '2.10', marksAndNumbers: 'ABC / BUSAN' },
      { description: 'Wool Scarves', hsCode: '6214200000', quantity: 80, unit: 'PCS', packageCount: 8, packageType: 'CARTON', netWeight: 80, grossWeight: 96, measurement: '0.60', marksAndNumbers: '' },
    ],
    incoterms: 'FOB',
    incotermsPlace: 'Busan Port',
    paymentTerms: 'T/T 30 days',
    invoiceNo: 'INV-2026-776343',
    loadPort: 'BUSAN, KOREA',
    dischargePort: 'LOS ANGELES, USA',
    placeOfReceipt: 'Ulsan CFS',
    placeOfDelivery: 'Chicago, IL, United States',
    freightTerms: 'COLLECT',
    shippingMarks: 'ABC / BUSAN',
    requestedDepartureDate: '2026-09-20',
    loadingMode: 'LCL',
    methodOfDispatch: 'SEA',
    containerSize: '',
    containerQuantity: '',
    dangerousGoods: false,
    dangerousGoodsDetail: '',
    temperatureControl: '',
    services: { insurance: false, customsClearance: false, inlandHaulage: false },
    ...overrides,
  };
}

describe('mapTransportRequestToSchema', () => {
  const schema = mapTransportRequestToSchema(request());

  it('참고 양식 칸에 화주 입력값을 매핑한다', () => {
    expect(schema.exporter).toContain('22 OFFICE CO., LTD');
    expect(schema.exporter).toContain('Business No.: 123-45-67890');
    expect(schema.consignee).toContain('Global Import LLC');
    expect(schema.reference).toBe('TR-2026-0913-001');
    expect(schema.buyer_reference).toBe('INV-2026-776343');
    expect(schema.port_of_loading).toBe('BUSAN, KOREA');
    expect(schema.port_of_discharge).toBe('LOS ANGELES, USA');
    expect(schema.place_of_receipt).toBe('Ulsan CFS');
    expect(schema.final_destination).toBe('Chicago, IL, United States');
    expect(schema.incoterms).toBe('FOB Busan Port');
    expect(schema.freight_charges).toBe('COLLECT');
    expect(schema.type_of_shipment).toBe('LCL');
    expect(schema.method_of_dispatch).toBe('SEA');
  });

  it('주소 끝을 국가로 읽어 원산지·최종목적국을 채운다', () => {
    expect(schema.country_of_origin).toBe('Republic of Korea');
    expect(schema.country_of_final_destination).toBe('United States');
  });

  it('품목을 줄바꿈으로 나열하고 합계를 계산한다', () => {
    expect(schema.packages).toBe('20 CARTON\n8 CARTON');
    expect(schema.description_of_goods).toContain("Women's Cashmere Coats (HS 6202110000 / 200 PCS)");
    expect(schema.gross_weight).toBe('546');
    expect(schema.measurement).toBe('2.7');
    expect(schema.total_this_page).toBe('28 PKGS / 546 KGS / 2.7 M3');
    expect(schema.consignment_total).toBe(schema.total_this_page);
  });

  it('부킹 이후에 정해지는 칸은 비워 둔다 — 화주가 채울 수 없는 값', () => {
    expect(schema.carrier).toBe('');
    expect(schema.vessel).toBe('');
    expect(schema.voyage_no).toBe('');
    expect(schema.export_declaration_no).toBe('');
  });

  it('결제조건이 L/C면 신용장 여부를 YES로 표기한다', () => {
    expect(schema.letter_of_credit).toBe('NO');
    expect(mapTransportRequestToSchema(request({ paymentTerms: 'L/C at sight' })).letter_of_credit).toBe('YES');
  });

  it('FCL이면 적재 방식 칸에 컨테이너 규격·수량을 함께 적는다', () => {
    const fcl = mapTransportRequestToSchema(request({ loadingMode: 'FCL', containerSize: '40HC', containerQuantity: 2 }));
    expect(fcl.type_of_shipment).toBe('FCL / 2 x 40HC');
    // LCL은 콘솔 박스를 포워더가 정하므로 컨테이너 표기를 붙이지 않는다
    expect(schema.type_of_shipment).toBe('LCL');
  });

  it('항공 의뢰는 운송 방식을 AIR로 적는다', () => {
    expect(schema.method_of_dispatch).toBe('SEA');
    expect(mapTransportRequestToSchema(request({ methodOfDispatch: 'AIR' })).method_of_dispatch).toBe('AIR');
  });

  it('위험물·온도관리·요청 업무는 Special Instructions에 적고, 없으면 줄을 만들지 않는다', () => {
    const special = mapTransportRequestToSchema(request({
      dangerousGoods: true,
      dangerousGoodsDetail: 'IMO Class 9 / UN3481',
      temperatureControl: '-18°C',
      services: { insurance: true, customsClearance: false, inlandHaulage: true },
    }));
    expect(special.hazardous).toBe('YES');
    expect(special.special_instructions).toContain('Dangerous goods: YES (IMO Class 9 / UN3481)');
    expect(special.special_instructions).toContain('Temperature control: -18°C');
    expect(special.special_instructions).toContain('Please arrange: cargo insurance, inland haulage.');
    // 해당 없는 항목은 "없음"을 적지 않는다
    expect(schema.hazardous).toBe('NO');
    expect(schema.special_instructions).not.toContain('Dangerous goods');
    expect(schema.special_instructions).not.toContain('Please arrange');
    expect(schema.special_instructions).toContain('Payment terms: T/T 30 days');
  });

  it('서명란은 수출자·담당자로 채운다', () => {
    expect(schema.signatory_company).toBe('22 OFFICE CO., LTD');
    expect(schema.authorized_signatory).toBe('KIM JIMIN');
    expect(schema.place_and_date_of_issue).toBe('2026-09-13');
  });
});
