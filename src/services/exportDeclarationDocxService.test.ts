import { describe, it, expect } from 'vitest';
import { exportDeclarationFobNotice, mapExportDeclarationToDocxSchema, paymentMethodCode, transportTypeCode } from './exportDeclarationDocxService';
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

  it('(B) 화주가 고른 값이 없으면 코드란은 전부 공란 — AI 추정 금지', () => {
    const s = mapExportDeclarationToDocxSchema(base());
    for (const k of ['decl_kind', 'declarant', 'trade_kind', 'decl_category', 'payment_method',
      'exporter_type', 'goods_status', 'refund_applicant', 'simple_refund', 'declarant_note', 'staff'] as const) {
      expect(s[k]).toBe('');
    }
  });

  it('결제조건 → 결제방법 부호: L/C는 일람출급·기한부를 알 때만', () => {
    expect(paymentMethodCode('T/T')).toBe('TT');
    expect(paymentMethodCode('D/A')).toBe('DA');
    expect(paymentMethodCode('D/P')).toBe('DP');
    expect(paymentMethodCode('L/C')).toBe('');
    expect(paymentMethodCode('L/C', 'SIGHT')).toBe('LS');
    expect(paymentMethodCode('L/C', 'USANCE')).toBe('LU');
    expect(paymentMethodCode('Open Account')).toBe('');
    expect(paymentMethodCode('')).toBe('');
  });

  it('운송방식 → 운송형태 부호', () => {
    expect(transportTypeCode('FCL')).toBe('10FC');
    expect(transportTypeCode('LCL')).toBe('10LC');
    expect(transportTypeCode('')).toBe('');
  });

  it('화주가 고른 거래 형태·물품상태·제조자 구분이 부호로 들어간다', () => {
    const s = mapExportDeclarationToDocxSchema(base({
      paymentTerms: 'T/T', transportType: 'FCL',
      exportDeclaration: {
        tradeKind: 'GENERAL', goodsCondition: 'N', exporterType: 'A',
        ownerCeoName: '홍길동', customsCode: 'SEAFOOD1234567', postalCode: '48943',
        buyerCustomsCode: 'JPTOKYO1234', freightKrw: 150000, insuranceKrw: 20000, industrialComplexCode: '999',
      },
    }));
    expect(s.payment_method).toBe('TT');
    expect(s.transport_type).toBe('10FC');
    expect(s.trade_kind).toBe('11');
    expect(s.decl_category).toBe('A');
    expect(s.goods_status).toBe('N');
    expect(s.exporter_type).toBe('A');
    expect(s.owner_ceo).toBe('홍길동');
    expect(s.owner_code).toBe('SEAFOOD1234567');
    expect(s.agent_code).toBe('SEAFOOD1234567');
    expect(s.owner_location).toBe('48943');
    expect(s.buyer_code).toBe('JPTOKYO1234');
    expect(s.freight).toBe('150,000');
    expect(s.insurance).toBe('20,000');
    // 직접 제조(A) → 제조자 = 수출화주
    expect(s.maker_name).toBe('SEAFOOD EXPORT CO');
    expect(s.maker_code).toBe('SEAFOOD1234567');
    expect(s.maker_place).toBe('48943');
    expect(s.industrial_code).toBe('999');
    // 신고인이 정하는 칸은 여전히 공란
    expect(s.decl_kind).toBe('');
    expect(s.refund_applicant).toBe('');
  });

  it('완제품 공급(C)이면 입력한 제조자 정보를 쓴다', () => {
    const s = mapExportDeclarationToDocxSchema(base({
      exportDeclaration: { exporterType: 'C', makerName: 'MAKER CO', makerCustomsCode: 'MAKER123', makerPostalCode: '13457' },
    }));
    expect(s.exporter_type).toBe('C');
    expect(s.maker_name).toBe('MAKER CO');
    expect(s.maker_code).toBe('MAKER123');
    expect(s.maker_place).toBe('13457');
  });

  it('품목 상표명·성분이 있으면 채운다', () => {
    const s = mapExportDeclarationToDocxSchema(base({ items: [item({ brand: 'NO BRAND', composition: 'COTTON 100%' })] }));
    expect(s.firstItem.brand).toBe('NO BRAND');
    expect(s.firstItem.composition).toBe('COTTON 100%');
  });

  it('FOB: KRW면 금액 그대로, 외화+환율이면 환산, 외화+환율없으면 공란', () => {
    const krw = mapExportDeclarationToDocxSchema(base({ currency: 'KRW', items: [item({ quantity: 1, unitPrice: 1000 })] }));
    expect(krw.firstItem.fob_price).toBe('₩1,000');

    const usd = mapExportDeclarationToDocxSchema(base({ currency: 'USD', fobRate: 1000, items: [item({ quantity: 1, unitPrice: 25 })] }));
    expect(usd.firstItem.fob_price).toBe('₩25,000'); // 25 × 1000

    const noRate = mapExportDeclarationToDocxSchema(base({ currency: 'USD', fobRate: null, items: [item({ quantity: 1, unitPrice: 25 })] }));
    expect(noRate.firstItem.fob_price).toBe(''); // 외화인데 환율 없음 → 공란
  });

  it('신고가격(FOB): USD FOB는 송장금액 × 환율, KRW FOB는 금액 그대로', () => {
    const usd = mapExportDeclarationToDocxSchema(base({ incoterms: 'FOB', currency: 'USD', invoiceAmount: 10000, fobRate: 1300, items: [item({ quantity: 100, unitPrice: 100 })] }));
    expect(usd.firstItem.fob_price).toBe('₩13,000,000');
    expect(usd.total_fob_krw).toBe('₩ 13,000,000');
    expect(usd.total_fob_usd).toBe('$ 10,000');

    const krw = mapExportDeclarationToDocxSchema(base({ incoterms: 'FOB', currency: 'KRW', invoiceAmount: 13000000, fobRate: null, items: [item({ quantity: 1, unitPrice: 13000000 })] }));
    expect(krw.firstItem.fob_price).toBe('₩13,000,000');
    expect(krw.total_fob_krw).toBe('₩ 13,000,000');
  });

  it('신고가격(FOB): CFR·CIF·FCA·FAS는 숫자를 넣지 않고 빈칸, 안내 문구는 별도', () => {
    for (const incoterms of ['CFR', 'CIF', 'FCA', 'FAS']) {
      const s = mapExportDeclarationToDocxSchema(base({ incoterms, currency: 'USD', invoiceAmount: 10000, fobRate: 1300 }));
      expect(s.firstItem.fob_price).toBe('');
      expect(s.total_fob_krw).toBe('');
      expect(s.total_fob_usd).toBe('');
      // 안내는 숫자 칸이 아니라 화면 주석으로만 — 결제금액 등 다른 값은 그대로
      expect(s.payment_amount).toBe('USD 10,000');
    }
    expect(exportDeclarationFobNotice('CFR')).toBe('거래조건에 따른 FOB 환산 확인 필요');
    expect(exportDeclarationFobNotice('cif')).toBe('거래조건에 따른 FOB 환산 확인 필요');
    expect(exportDeclarationFobNotice('FCA')).toBe('FOB 기준 가격 별도 확인 필요');
    expect(exportDeclarationFobNotice('FAS')).toBe('FOB 기준 가격 별도 확인 필요');
    expect(exportDeclarationFobNotice('FOB')).toBeNull();
  });

  it('신고가격(FOB): 환율 누락·잘못된 송장금액이면 빈칸 (0원·NaN 금지)', () => {
    const noRate = mapExportDeclarationToDocxSchema(base({ incoterms: 'FOB', currency: 'USD', invoiceAmount: 10000, fobRate: null }));
    expect(noRate.total_fob_krw).toBe('');
    expect(noRate.firstItem.fob_price).toBe('');

    const badRate = mapExportDeclarationToDocxSchema(base({ incoterms: 'FOB', currency: 'USD', invoiceAmount: 10000, fobRate: Number.NaN }));
    expect(badRate.total_fob_krw).toBe('');

    for (const invoiceAmount of [0, -5, Number.NaN, '' as unknown as number]) {
      const s = mapExportDeclarationToDocxSchema(base({ incoterms: 'FOB', currency: 'USD', invoiceAmount, fobRate: 1300, items: [item({ quantity: '' as unknown as number, unitPrice: '' as unknown as number })] }));
      expect(s.total_fob_krw).toBe('');
      expect(s.total_fob_usd).toBe('');
      expect(s.firstItem.fob_price).toBe('');
      expect(JSON.stringify(s)).not.toMatch(/₩ ?0\b|NaN/);
    }
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
