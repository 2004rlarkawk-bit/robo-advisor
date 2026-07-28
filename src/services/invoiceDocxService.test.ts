import { describe, it, expect } from 'vitest';
import { mapInvoiceToSchema } from './invoiceDocxService';
import type { InvoiceData } from '../types';

function makeInvoice(over: Partial<InvoiceData> = {}): InvoiceData {
  return {
    seller: { name: '대한물산', address: '서울 강남구', contact: '02-123-4567' },
    consignee: { name: 'OSAKA INC.', address: 'Osaka, JP', contact: '' },
    invoiceNo: 'INV-2026-123456',
    invoiceDate: '2026-07-27',
    currency: 'USD',
    incoterms: 'CIF',
    loadPort: '광양항',
    dischargePort: '오사카항',
    departureDate: '2026-07-20',
    arrivalDate: '2026-07-25',
    totalAmount: 21250,
    items: [{
      no: 1, description: '냉동 갈치', hsCode: '0303.89-2000',
      quantity: 500, unit: 'CTN', unitPrice: 42.5, amount: 21250,
      netWeight: 5000, grossWeight: 5400, dimensions: '',
      countryOfOrigin: 'REPUBLIC OF KOREA',
    }],
    ...over,
  } as InvoiceData;
}

describe('invoiceDocxService — mapInvoiceToSchema', () => {
  it('기본 매핑: 당사자·품목·거래조건이 스키마로 옮겨진다', () => {
    const s = mapInvoiceToSchema(makeInvoice());
    expect(s.shipper_name).toBe('대한물산');
    expect(s.shipper_address2).toBe('TEL: 02-123-4567');
    expect(s.consignee_name).toBe('OSAKA INC.');
    expect(s.invoice_no).toBe('INV-2026-123456');
    // 도착지 조건(CIF)은 인도조건 뒤에 도착항을 명기한다 (과거 버그: 선적항 '광양항' 사용)
    expect(s.terms_of_delivery).toBe('CIF 오사카항');
    expect(s.from_port).toBe('광양항');
    expect(s.to_port).toBe('오사카항');
    expect(s.country_of_origin).toBe('REPUBLIC OF KOREA');
    expect(s.goods_description).toBe('냉동 갈치');
    expect(s.goods_spec).toBe('HS CODE: 0303.89-2000');
    expect(s.quantity).toBe('500 CTN');
    expect(s.net_weight).toBe('5,000 KG');
  });

  it('USD는 소수 2자리, KRW는 0자리로 금액 포맷', () => {
    expect(mapInvoiceToSchema(makeInvoice()).unit_price).toBe('USD 42.50');
    const krw = mapInvoiceToSchema(makeInvoice({ currency: 'KRW', items: [{
      no: 1, description: 'x', hsCode: '', quantity: 3, unit: 'EA', unitPrice: 10, amount: 30,
      netWeight: 0, grossWeight: 0, dimensions: '',
    }] as any }));
    expect(krw.unit_price).toBe('KRW 10');
    expect(krw.amount).toBe('KRW 30');
  });

  it('빈 값은 "N/A"가 아니라 빈 문자열로 둔다', () => {
    const s = mapInvoiceToSchema(makeInvoice({
      seller: { name: '', address: '', contact: '' },
      consignee: { name: '', address: '', contact: '' },
      departureDate: '', loadPort: '', dischargePort: '', incoterms: '' as any,
      items: [{ no: 1, description: '', hsCode: '', quantity: 0, unit: '', unitPrice: 0, amount: 0, netWeight: 0, grossWeight: 0, dimensions: '' }] as any,
    }));
    for (const v of Object.values(s)) {
      expect(v).not.toContain('N/A');
    }
    expect(s.shipper_name).toBe('');
    expect(s.shipper_address2).toBe(''); // 연락처 없으면 TEL 라인도 빈칸
    expect(s.departure_date).toBe('');
    expect(s.goods_spec).toBe('');
    expect(s.quantity).toBe('');
    expect(s.net_weight).toBe('');
    expect(s.unit_price).toBe('');
    expect(s.terms_of_delivery).toBe('');
  });

  it('선적지 조건(FOB)은 인도조건 뒤에 선적항을 명기한다', () => {
    const s = mapInvoiceToSchema(makeInvoice({ incoterms: 'FOB' }));
    expect(s.terms_of_delivery).toBe('FOB 광양항');
  });

  it('화인(shippingMarks)은 최대 5줄로 분해된다', () => {
    const s = mapInvoiceToSchema(makeInvoice({ shippingMarks: 'DHS\nC/NO.1-500\nMADE IN KOREA' } as any));
    expect(s.marks_line1).toBe('DHS');
    expect(s.marks_line2).toBe('C/NO.1-500');
    expect(s.marks_line3).toBe('MADE IN KOREA');
    expect(s.marks_line4).toBe('');
    expect(s.marks_line5).toBe('');
  });
});
