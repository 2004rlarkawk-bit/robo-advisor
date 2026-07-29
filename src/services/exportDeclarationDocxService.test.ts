import { describe, it, expect } from 'vitest';
import { mapExportDeclarationToDocxSchema } from './exportDeclarationDocxService';
import type { CustomsDeclarationData, TradeItem } from '../types';

const item = (o: Partial<TradeItem> = {}): TradeItem => ({
  description: 'FROZEN HAIRTAIL', hsCode: '0303.89', quantity: 100, unit: 'CTN', unitPrice: 10,
  netWeight: 500, grossWeight: 550, measurement: '1.2 CBM', packageCount: 100, packageUnit: 'CTNS',
  ...o,
});

const base = (o: Partial<CustomsDeclarationData> = {}): CustomsDeclarationData => ({
  declarationNo: 'CD-2026-000123',
  declarationDate: '2026-07-29',
  tradeType: 'export',
  exporter: { name: 'SEAFOOD EXPORT CO', address: 'BUSAN, KOREA', contact: '051-1111' },
  importer: { name: 'TOKYO IMPORT LTD', address: 'OSAKA, JAPAN', contact: '' },
  itemName: 'FROZEN HAIRTAIL', hsCode: '0303.89', quantity: 100, unit: 'CTN', weight: 550,
  currency: 'USD', invoiceAmount: 1000, incoterms: 'FOB', loadPort: 'BUSAN', dischargePort: 'TOKYO',
  countryOfOrigin: 'Republic of Korea',
  items: [item()],
  fobRate: 1478.44,
  ownerBizNo: '123-45-67890',
  destCountry: 'JAPAN', carrier: 'HMM', vessel: 'HMM ROTTERDAM', departureDate: '2026-07-26',
  invoiceNo: 'INV-2026-000123',
  totalWeight: 550, totalPackages: 100, containerNo: 'ABCU1234567',
  ...o,
});

describe('mapExportDeclarationToDocxSchema — 갑지/을지 + A/B/C 그룹', () => {
  it('품목 1개: firstItem=item0, 을지(extraItems) 비고 hasExtraItems=false', () => {
    const s = mapExportDeclarationToDocxSchema(base({ items: [item({ description: 'A' })] }));
    expect(s.firstItem.goods_name).toBe('A');
    expect(s.extraItems).toHaveLength(0);
    expect(s.hasExtraItems).toBe(false);
  });

  it('품목 3개: 갑지=item0, 을지=나머지 2개, hasExtraItems=true', () => {
    const s = mapExportDeclarationToDocxSchema(base({
      items: [item({ description: 'A' }), item({ description: 'B' }), item({ description: 'C' })],
    }));
    expect(s.firstItem.goods_name).toBe('A');
    expect(s.extraItems.map((e) => e.goods_name)).toEqual(['B', 'C']);
    expect(s.hasExtraItems).toBe(true);
    expect(s.firstItem.item_total).toBe('3');
  });

  it('(C) 화주 데이터가 매핑된다', () => {
    const s = mapExportDeclarationToDocxSchema(base());
    expect(s.owner_name).toBe('SEAFOOD EXPORT CO');
    expect(s.owner_bizno).toBe('123-45-67890');
    expect(s.dest_country).toBe('JAPAN');
    expect(s.vessel).toBe('HMM ROTTERDAM');
    expect(s.load_port).toBe('BUSAN');
    expect(s.container_no).toBe('ABCU1234567');
    expect(s.firstItem.hs_code).toBe('0303.89');
    expect(s.firstItem.qty_unit).toBe('100 CTN');
  });

  it('(B) 관세사 기재는 전부 공란 — AI 추정 금지', () => {
    const s = mapExportDeclarationToDocxSchema(base());
    for (const k of ['decl_kind', 'declarant', 'trade_kind', 'decl_category', 'payment_method',
      'exporter_type', 'refund_applicant', 'simple_refund', 'declarant_note', 'staff'] as const) {
      expect(s[k]).toBe('');
    }
  });

  it('FOB: KRW면 금액 그대로, 외화+환율이면 환산, 외화+환율없으면 공란', () => {
    const krw = mapExportDeclarationToDocxSchema(base({ currency: 'KRW', items: [item({ quantity: 1, unitPrice: 1000 })] }));
    expect(krw.firstItem.fob_price).toBe('₩1,000');

    const usd = mapExportDeclarationToDocxSchema(base({ currency: 'USD', fobRate: 1000, items: [item({ quantity: 1, unitPrice: 25 })] }));
    expect(usd.firstItem.fob_price).toBe('₩25,000'); // 25 × 1000

    const noRate = mapExportDeclarationToDocxSchema(base({ currency: 'USD', fobRate: null, items: [item({ quantity: 1, unitPrice: 25 })] }));
    expect(noRate.firstItem.fob_price).toBe(''); // 외화인데 환율 없음 → 공란
  });

  it('순중량 0이면 "0 KG" 아니라 공란(junk 방지)', () => {
    const s = mapExportDeclarationToDocxSchema(base({ items: [item({ netWeight: 0 })] }));
    expect(s.firstItem.net_weight).toBe('');
  });

  it('소스 없는 품목 필드(상표명·모델규격·성분)는 공란', () => {
    const s = mapExportDeclarationToDocxSchema(base());
    expect(s.firstItem.brand).toBe('');
    expect(s.firstItem.model_spec).toBe('');
    expect(s.firstItem.composition).toBe('');
  });
});
