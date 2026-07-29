import { describe, it, expect } from 'vitest';
import { mapPackingListToDocxSchema } from './packingListDocxService';
import type { PackingListData } from '../types';

const basePL = (o: Partial<PackingListData> = {}): PackingListData => ({
  seller: { name: 'SEAFOOD EXPORT CO', address: 'BUSAN, KOREA', contact: '051-1111' },
  consignee: { name: 'TOKYO IMPORT LTD', address: 'OSAKA, JAPAN', contact: '' },
  invoiceNo: 'INV-2026-000123',
  date: '2026-07-29',
  shippingMarks: 'N/M',
  packageCount: 0, packageType: '', netWeight: 0, grossWeight: 0, measurement: '',
  signedBy: 'KIM JIMIN',
  items: [
    { no: 1, description: 'FROZEN HAIRTAIL', hsCode: '0303.89', quantity: 5, unit: 'CTN', unitPrice: 0, amount: 0, netWeight: 100, grossWeight: 110, dimensions: '1.2 CBM', packageCount: 5, packageType: 'CTNS', marks: '' },
    { no: 2, description: 'DRIED ANCHOVY', hsCode: '0305.59', quantity: 3, unit: 'CTN', unitPrice: 0, amount: 0, netWeight: 0, grossWeight: 0, dimensions: '', packageCount: 3, packageType: 'CTNS' },
  ],
  ...o,
} as PackingListData);

describe('mapPackingListToDocxSchema — 문서레벨 + 품목 루프', () => {
  it('당사자를 상호/주소/연락처 줄바꿈으로 합친다', () => {
    const s = mapPackingListToDocxSchema(basePL());
    expect(s.seller).toBe('SEAFOOD EXPORT CO\nBUSAN, KOREA\nTEL: 051-1111');
    expect(s.consignee).toBe('TOKYO IMPORT LTD\nOSAKA, JAPAN');
    expect(s.signed_by).toBe('KIM JIMIN');
    expect(s.invoice_no).toBe('INV-2026-000123');
  });

  it('품목을 items 배열로 매핑한다', () => {
    const s = mapPackingListToDocxSchema(basePL());
    expect(s.items.length).toBe(2);
    expect(s.items[0].goods_description).toBe('FROZEN HAIRTAIL');
    expect(s.items[0].quantity_or_net_weight).toBe('100 KG');
    expect(s.items[0].gross_weight).toBe('110 KG');
    expect(s.items[0].packages).toBe('5 CTNS');
    expect(s.items[0].measurement).toBe('1.2 CBM');
  });

  it('물류필드(중량)가 0이면 "0 KG"가 아니라 공란으로 둔다(junk 방지)', () => {
    const s = mapPackingListToDocxSchema(basePL());
    expect(s.items[1].quantity_or_net_weight).toBe('');
    expect(s.items[1].gross_weight).toBe('');
  });

  it('화인: 첫 품목은 문서레벨 상속, 이후 품목은 override 없으면 공란', () => {
    const s = mapPackingListToDocxSchema(basePL());
    expect(s.items[0].shipping_marks).toBe('N/M');   // 문서레벨 상속
    expect(s.items[1].shipping_marks).toBe('');       // override 없음 → 공란
  });

  it('품목 override 화인이 있으면 그것을 쓴다', () => {
    const s = mapPackingListToDocxSchema(basePL({
      items: [{ no: 1, description: 'X', hsCode: '', quantity: 1, unit: '', unitPrice: 0, amount: 0, netWeight: 0, grossWeight: 0, dimensions: '', marks: 'ABC-1' }],
    } as any));
    expect(s.items[0].shipping_marks).toBe('ABC-1');
  });
});
