import { describe, it, expect } from 'vitest';
import {
  mapPackingListToSchema,
  renderPackingListPreviewHtml,
  exportPackingList,
  MAX_PACKING_ITEMS,
  type PackingListSchema,
} from './packingListXlsxService';
import type { PackingListData } from '../types';

const basePL = (o: Partial<PackingListData> = {}): PackingListData => ({
  seller: { name: 'SEAFOOD EXPORT CO', address: 'BUSAN, KOREA', contact: '051-1111' },
  consignee: { name: 'TOKYO IMPORT LTD', address: 'OSAKA, JAPAN', contact: '' },
  invoiceNo: 'INV-2026-000123',
  date: '2026-07-28',
  shippingMarks: 'N/M',
  packageCount: 8,
  packageType: 'CARTON',
  netWeight: 360,
  grossWeight: 400,
  measurement: '12.5 CBM',
  signedBy: 'KIM JIMIN',
  items: [{ no: 1, description: 'FROZEN HAIRTAIL, WHOLE ROUND', hsCode: '0303.89', quantity: 50, unit: 'KG', unitPrice: 0, amount: 0, netWeight: 360, grossWeight: 400, dimensions: '' }],
  ...o,
} as PackingListData);

describe('mapPackingListToSchema — 상업송장과 공유하는 거래 데이터에서 파생', () => {
  it('당사자·항구·인보이스번호를 재입력 없이 채운다', () => {
    const s = mapPackingListToSchema(basePL({ loadPort: 'BUSAN, KOREA', dischargePort: 'OSAKA, JAPAN' } as any));
    expect(s.shipper[0]).toBe('SEAFOOD EXPORT CO');
    expect(s.consignee[0]).toBe('TOKYO IMPORT LTD');
    expect(s.invoiceNo).toBe('INV-2026-000123');
    expect(s.portOfLoading).toBe('BUSAN, KOREA');
    expect(s.finalDestination).toBe('OSAKA, JAPAN');
  });

  it('Notify 미입력이면 선택값 정책에 따라 공란', () => {
    expect(mapPackingListToSchema(basePL()).notify).toBe('');
  });

  it('remarks는 결제조건+인코텀즈로 조립하고, 도착지 지칭이면 도착항을 붙인다', () => {
    const s = mapPackingListToSchema(basePL({ paymentTerms: 'T/T', incoterms: 'CIF', dischargePort: 'OSAKA, JAPAN' } as any));
    expect(s.remarks).toContain('PAYMENT: T/T');
    expect(s.remarks).toContain('CIF OSAKA, JAPAN');
  });

  it('박스수는 품목에 없으면 packageCount로 폴백, CBM은 measurement에서 숫자만 뽑는다', () => {
    const s = mapPackingListToSchema(basePL());
    expect(s.items[0].boxes).toBe(8);       // packageCount 폴백
    expect(s.items[0].netWeight).toBe(360);
    expect(s.totalCbm).toBe(12.5);          // "12.5 CBM" → 12.5
  });

  it('빈 값은 0/"N/A"가 아니라 공란("")으로 남긴다', () => {
    const s = mapPackingListToSchema(basePL({ items: [{ no: 1, description: '', hsCode: '', quantity: 0, unit: '', unitPrice: 0, amount: 0, netWeight: 0, grossWeight: 0, dimensions: '' }], measurement: '' } as any));
    expect(s.items[0].netWeight).toBe('');
    expect(s.items[0].eaPerBox).toBe('');
    expect(s.totalCbm).toBe('');
  });
});

describe('renderPackingListPreviewHtml — 다운로드 xlsx와 같은 스키마', () => {
  const schema: PackingListSchema = {
    shipper: ['A'], consignee: ['B'], notify: 'SAME AS ABOVE',
    portOfLoading: 'BUSAN, KOREA', finalDestination: 'OSAKA, JAPAN',
    carrier: '', sailingDate: '', invoiceNo: 'INV-1', invoiceDate: '',
    lcNo: '', lcDate: '', lcBank: '', remarks: '',
    items: [
      { marks: 'N/M', description: 'FROZEN HAIRTAIL', eaPerBox: 10, boxes: 5, netWeight: 100, grossWeight: 110 },
      { marks: '', description: 'DRIED ANCHOVY', eaPerBox: 6, boxes: 4, netWeight: 60, grossWeight: 70 },
    ],
    totalCbm: 12.5, signedBy: 'KIM',
  };

  it('합계를 템플릿 수식과 같은 규칙으로 계산해 표시한다(Total EA·박스·중량)', () => {
    const html = renderPackingListPreviewHtml(schema);
    // Total EA = 10*5 + 6*4 = 74, 박스 = 9, net = 160, gross = 180
    expect(html).toContain('>74<');
    expect(html).toContain('>9<');
    expect(html).toContain('>160<');
    expect(html).toContain('>180<');
  });

  it('사용자 입력을 이스케이프한다(XSS 방어)', () => {
    const html = renderPackingListPreviewHtml({ ...schema, signedBy: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('exportPackingList — 템플릿 용량 가드', () => {
  it('품목 24건 초과면 행 추가 대신 에러로 막는다(서식 보존)', async () => {
    const many = Array.from({ length: MAX_PACKING_ITEMS + 1 }, () => ({
      marks: '', description: 'X', eaPerBox: 1 as const, boxes: 1 as const, netWeight: 1 as const, grossWeight: 1 as const,
    }));
    const data = { ...({} as PackingListSchema), items: many } as PackingListSchema;
    await expect(exportPackingList(data)).rejects.toThrow(/최대 24/);
  });
});
