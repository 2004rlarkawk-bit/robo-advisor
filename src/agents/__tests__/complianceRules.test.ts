import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runComplianceRules, checkPackingInvoiceConsistency, checkHsChapterMismatch, RULE_POLICY } from '../complianceRules';
import { TradeProfile } from '../../types';

const base: TradeProfile = {
  tradeType: 'export',
  itemName: 'FROZEN HAIRTAIL, WHOLE ROUND',
  hsCode: '0303892000',
  loadPort: 'BUSAN, KOREA',
  dischargePort: 'OSAKA, JAPAN',
  incoterms: 'CIF',
  quantity: 500,
  weight: 5400,
  departureDate: '2026-07-20',
  arrivalDate: '2026-07-25',
  companyName: 'DAEHAN',
  contact: '02-1',
  countryOfOrigin: 'REPUBLIC OF KOREA',
  unit: 'KG',
  unitPrice: 42.5,
  totalAmount: 21250,
  currency: 'USD',
};
const run = (o: Partial<TradeProfile> = {}) => runComplianceRules({ ...base, ...o });
const ids = (o: Partial<TradeProfile> = {}) => run(o).map(i => i.id);
const find = (o: Partial<TradeProfile>, id: string) => run(o).find(i => i.id === id);

describe('정책 타입 — RULE_POLICY', () => {
  it('error 이슈는 overridable 플래그를 갖고, warning은 undefined', () => {
    const err = find({ countryOfOrigin: '' }, 'r1-origin-missing')!;
    expect(err.severity).toBe('error');
    expect(err.overridable).toBe(true);
    const warn = find({ departureDate: '' }, 'r2-departure-missing')!;
    expect(warn.severity).toBe('warning');
    expect(warn.overridable).toBeUndefined();
  });
  it('R8(금액)은 error이며 override 불가', () => {
    expect(RULE_POLICY['r8-amount-arithmetic']).toEqual({ severity: 'error', overridable: false });
  });
});

describe('R1 필수값', () => {
  it('원산지 비면 error', () => expect(ids({ countryOfOrigin: '' })).toContain('r1-origin-missing'));
  it('수산물 품명 "갈치" 단독 → 차단(error)', () => {
    expect(ids({ itemName: '갈치' })).toContain('r1-itemname-insufficient');
  });
  it('"FROZEN HAIRTAIL, WHOLE ROUND" → 통과', () => {
    expect(ids({ itemName: 'FROZEN HAIRTAIL, WHOLE ROUND' })).not.toContain('r1-itemname-insufficient');
  });
  it('상태만/형태만 있으면 미달', () => {
    expect(ids({ itemName: 'FROZEN HAIRTAIL' })).toContain('r1-itemname-insufficient');
  });
});

describe('R2 선적일', () => {
  it('선적일 비면 warning(차단 아님)', () => {
    const i = find({ departureDate: '' }, 'r2-departure-missing')!;
    expect(i.severity).toBe('warning');
  });
});

describe('R3 Incoterms ↔ 항구', () => {
  it('CIF(도착지)인데 도착항 없음 → error', () => {
    expect(ids({ incoterms: 'CIF', dischargePort: '' })).toContain('r3-incoterm-port');
  });
  it('CIF + 도착항 있음 → r3 error 없음 (FOB BUSAN 오탐 방지 대칭)', () => {
    expect(ids({ incoterms: 'CIF', dischargePort: 'OSAKA, JAPAN' })).not.toContain('r3-incoterm-port');
  });
  it('FOB(선적지)인데 선적항 없음 → error', () => {
    expect(ids({ incoterms: 'FOB', loadPort: '' })).toContain('r3-incoterm-port');
  });
  it('FOB + 선적항 있음(BUSAN) → error 없음', () => {
    expect(ids({ incoterms: 'FOB', loadPort: 'BUSAN, KOREA' })).not.toContain('r3-incoterm-port');
  });
  it('EXW 인도장소 누락 → warning까지만(내륙 가능)', () => {
    const list = ids({ incoterms: 'EXW', loadPort: '' });
    expect(list).toContain('r3-incoterm-port-flex');
    expect(list).not.toContain('r3-incoterm-port');
  });
});

describe('R4 운송수단', () => {
  it('CIF(해상)인데 항공편 → warning', () => {
    expect(ids({ incoterms: 'CIF', vesselOrFlight: 'KE123' } as any)).toContain('r4-transport-mode');
  });
  it('CIF + 선박명 → 경고 없음', () => {
    expect(ids({ vesselOrFlight: 'HANJIN BUSAN V-27' } as any)).not.toContain('r4-transport-mode');
  });
});

describe('R5 동일국가 항구', () => {
  it('부산→인천(둘 다 KR) → error, override 가능', () => {
    const i = find({ loadPort: 'BUSAN', dischargePort: 'INCHEON' }, 'r5-same-country-ports')!;
    expect(i.severity).toBe('error');
    expect(i.overridable).toBe(true);
  });
  it('광양→오사카(KR→JP) → 경고 없음', () => {
    expect(ids({ loadPort: '광양', dischargePort: '오사카' })).not.toContain('r5-same-country-ports');
  });
});

describe('R6 HS 단위', () => {
  it('HS 0303 + 단위 CTN → warning(차단 아님)', () => {
    const i = find({ hsCode: '0303892000', unit: 'CTN' }, 'r6-hs-unit')!;
    expect(i.severity).toBe('warning');
  });
  it('HS 0303 + KG → 경고 없음', () => {
    expect(ids({ hsCode: '0303892000', unit: 'KG' })).not.toContain('r6-hs-unit');
  });
});

describe('R7 영문 필드 한글', () => {
  it('from/to 한글 → 걸림(warning)', () => {
    const list = run({ loadPort: '광양항', dischargePort: '오사카항' });
    const ports = list.filter(i => i.id === 'r7-nonlatin' && (i.field === 'loadPort' || i.field === 'dischargePort'));
    expect(ports.length).toBe(2);
    expect(ports.every(i => i.severity === 'warning')).toBe(true);
  });
  it('L/C 결제조건에 한글 → error', () => {
    const i = find({ paymentTerms: 'L/C 일람불 신용장' }, 'r7-nonlatin-lc')!;
    expect(i.severity).toBe('error');
  });
  it('T/T 결제조건에 한글 → warning', () => {
    expect(find({ paymentTerms: 'T/T 선불' }, 'r7-nonlatin')!.severity).toBe('warning');
  });
  it('품명 영문 병기("냉동 갈치 (Frozen Hairtail)") → warning', () => {
    const i = run({ itemName: '냉동 갈치 (Frozen Hairtail)' }).find(x => x.id === 'r7-nonlatin' && x.field === 'itemName')!;
    expect(i.severity).toBe('warning');
  });
});

describe('R8 금액 산술', () => {
  it('수량×단가 ≠ 총액 → error', () => {
    expect(ids({ quantity: 500, unitPrice: 42.5, totalAmount: 99999 })).toContain('r8-amount-arithmetic');
  });
  it('수량×단가 = 총액 → 통과', () => {
    expect(ids({ quantity: 500, unitPrice: 42.5, totalAmount: 21250 })).not.toContain('r8-amount-arithmetic');
  });
  it('KRW는 0자리 반올림으로 비교', () => {
    expect(ids({ currency: 'KRW', quantity: 3, unitPrice: 10, totalAmount: 30 })).not.toContain('r8-amount-arithmetic');
  });
});

describe('재현 케이스 — INV-2026-123456', () => {
  it('CIF + 한글 항구(광양항/오사카항) + 품명 "갈치" → 실제 오류들이 잡힌다', () => {
    const list = ids({
      incoterms: 'CIF', loadPort: '광양항', dischargePort: '오사카항',
      itemName: '갈치', hsCode: '0303892000',
    });
    // From/To 한글(R7 warning) + 품명 미달(R1 error)
    expect(list).toContain('r7-nonlatin');
    expect(list).toContain('r1-itemname-insufficient');
  });
});

describe('R10 — 패킹리스트 ↔ 상업송장 교차 대조', () => {
  const inv = (items: any[]): any => ({ items });
  const pl = (items: any[]): any => ({ items });

  it('박스 내역이 인보이스 수량과 다르면 수량 불일치 warning', () => {
    const invoice = inv([{ description: 'FROZEN HAIRTAIL', quantity: 100 }]);
    const packing = pl([{ description: 'FROZEN HAIRTAIL', boxes: 5, eaPerBox: 10 }]); // 50 ≠ 100
    const issues = checkPackingInvoiceConsistency(invoice, packing);
    const qty = issues.find(i => i.id === 'r10-packing-qty-mismatch')!;
    expect(qty).toBeTruthy();
    expect(qty.severity).toBe('warning');
    expect(qty.overridable).toBeUndefined();
  });

  it('박스 내역 합계가 인보이스 수량과 같으면 통과', () => {
    const invoice = inv([{ description: 'FROZEN HAIRTAIL', quantity: 50 }]);
    const packing = pl([{ description: 'FROZEN HAIRTAIL', boxes: 5, eaPerBox: 10 }]); // 50 == 50
    expect(checkPackingInvoiceConsistency(invoice, packing).map(i => i.id))
      .not.toContain('r10-packing-qty-mismatch');
  });

  it('박스 내역이 없으면 억지 판정 대신 조용히 통과(오탐 방지)', () => {
    const invoice = inv([{ description: 'FROZEN HAIRTAIL', quantity: 100 }]);
    const packing = pl([{ description: 'FROZEN HAIRTAIL' }]); // boxes/eaPerBox 없음
    expect(checkPackingInvoiceConsistency(invoice, packing)).toHaveLength(0);
  });

  it('같은 순번 품명이 다르면 품명 불일치 warning', () => {
    const invoice = inv([{ description: 'FROZEN HAIRTAIL', quantity: 50 }]);
    const packing = pl([{ description: 'FROZEN MACKEREL', boxes: 5, eaPerBox: 10 }]);
    expect(checkPackingInvoiceConsistency(invoice, packing).map(i => i.id))
      .toContain('r10-packing-desc-mismatch');
  });

  it('품명이 대소문자·공백만 다르면 일치로 본다', () => {
    const invoice = inv([{ description: 'Frozen  Hairtail', quantity: 50 }]);
    const packing = pl([{ description: 'FROZEN HAIRTAIL', boxes: 5, eaPerBox: 10 }]);
    expect(checkPackingInvoiceConsistency(invoice, packing).map(i => i.id))
      .not.toContain('r10-packing-desc-mismatch');
  });
});

describe('R11 — 결제조건 ↔ L/C 필드 정합성', () => {
  it('T/T 결제인데 L/C 번호가 있으면 모순 error(차단, override 가능) — 픽스처 T/T+LC-88-2026', () => {
    const issue = find({ paymentTerms: 'T/T', lcNo: 'LC-88-2026' }, 'r11-payment-lc-conflict')!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('error');
    expect(issue.overridable).toBe(true);
  });

  it('L/C 은행/일자만 있어도(번호 없이) T/T와 함께면 모순으로 잡는다', () => {
    expect(ids({ paymentTerms: 'T/T 30 DAYS', lcBank: 'KEB HANA BANK' }))
      .toContain('r11-payment-lc-conflict');
  });

  it('L/C 결제인데 L/C 번호가 공란이면 warning', () => {
    const issue = find({ paymentTerms: 'L/C AT SIGHT', lcNo: '' }, 'r11-lc-missing')!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('warning');
  });

  it('L/C 결제 + L/C 번호 있으면 통과(모순·누락 아님)', () => {
    const list = ids({ paymentTerms: 'L/C AT SIGHT', lcNo: 'LC-2026-0001' });
    expect(list).not.toContain('r11-payment-lc-conflict');
    expect(list).not.toContain('r11-lc-missing');
  });

  it('T/T 결제 + L/C 필드 전부 공란이면 R11 미발생', () => {
    const list = ids({ paymentTerms: 'T/T', lcNo: '', lcBank: '', lcDate: '' });
    expect(list).not.toContain('r11-payment-lc-conflict');
    expect(list).not.toContain('r11-lc-missing');
  });
});

describe('R2 출항희망일 비현실적 범위(연도 오타 방지)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15)); // 2026-08-15로 고정
  });
  afterEach(() => { vi.useRealTimers(); });

  it('오늘 기준 1년 전 ~ 2년 후 범위 안이면 통과', () => {
    expect(ids({ departureDate: '2026-09-01' })).not.toContain('r2-departure-out-of-range');
    expect(ids({ departureDate: '2025-09-01' })).not.toContain('r2-departure-out-of-range');
    expect(ids({ departureDate: '2028-06-01' })).not.toContain('r2-departure-out-of-range');
  });

  it('연도를 잘못 찍어 범위를 벗어나면(예: 2016) warning', () => {
    const issue = find({ departureDate: '2016-07-20' }, 'r2-departure-out-of-range')!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('warning');
  });

  it('너무 먼 미래(예: 2062)도 warning', () => {
    expect(ids({ departureDate: '2062-01-01' })).toContain('r2-departure-out-of-range');
  });

  it('공란이면 발생하지 않음(R2 필수 체크와 중복 발행 안 함)', () => {
    expect(ids({ departureDate: '' })).not.toContain('r2-departure-out-of-range');
  });
});

describe('R13 선적항·도착항 완전 동일', () => {
  it('정규화 후 동일하면 error(override 가능)', () => {
    const issue = find({ loadPort: 'BUSAN, KOREA', dischargePort: 'busan  korea' }, 'r13-identical-ports')!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('error');
    expect(issue.overridable).toBe(true);
  });
  it('다른 항구면 미발행', () => {
    expect(ids({ loadPort: 'BUSAN, KOREA', dischargePort: 'OSAKA, JAPAN' })).not.toContain('r13-identical-ports');
  });
  it('한쪽이 비어 있으면 미발행(누락은 R3 담당)', () => {
    expect(ids({ loadPort: 'BUSAN, KOREA', dischargePort: '' })).not.toContain('r13-identical-ports');
  });
});

describe('R14 신용장 개설일 > 선적일', () => {
  it('L/C 결제 + 개설일이 선적일보다 늦으면 error', () => {
    const issue = find(
      { paymentTerms: 'L/C AT SIGHT', lcNo: 'LC-2026-0001', lcDate: '2026-08-01', departureDate: '2026-07-20' },
      'r14-lc-after-shipment',
    )!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('error');
  });
  it('개설일이 선적일 이전이면 미발행', () => {
    expect(ids({ paymentTerms: 'L/C AT SIGHT', lcNo: 'LC-1', lcDate: '2026-07-01', departureDate: '2026-07-20' }))
      .not.toContain('r14-lc-after-shipment');
  });
  it('T/T 결제면 L/C 날짜가 있어도 미발행(모순은 R11 담당)', () => {
    expect(ids({ paymentTerms: 'T/T', lcDate: '2026-08-01', departureDate: '2026-07-20' }))
      .not.toContain('r14-lc-after-shipment');
  });
});

describe('R15 수출인데 원산지 한국 아님', () => {
  it('수출 + 외국 원산지 → error(중계무역 사유 우회 가능)', () => {
    const issue = find({ countryOfOrigin: 'Japan' }, 'r15-origin-not-korea')!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('error');
    expect(issue.overridable).toBe(true);
  });
  it('원산지가 한국(영문·국문 표기 모두)이면 미발행', () => {
    expect(ids({ countryOfOrigin: 'REPUBLIC OF KOREA' })).not.toContain('r15-origin-not-korea');
    expect(ids({ countryOfOrigin: '대한민국' })).not.toContain('r15-origin-not-korea');
    expect(ids({ countryOfOrigin: 'South Korea' })).not.toContain('r15-origin-not-korea');
  });
  it('원산지 공란이면 미발행(누락은 R1 담당)', () => {
    expect(ids({ countryOfOrigin: '' })).not.toContain('r15-origin-not-korea');
  });
});

describe('R16 포괄 품명', () => {
  it('"GOODS" 같은 포괄 품명은 error', () => {
    const issue = find({ itemName: 'Goods', hsCode: '' }, 'r16-generic-item-name')!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('error');
  });
  it('국문 포괄 품명("상품")도 잡는다', () => {
    expect(ids({ itemName: '상품', hsCode: '' })).toContain('r16-generic-item-name');
  });
  it('구체적 품명은 미발행', () => {
    expect(ids({ itemName: 'STAINLESS STEEL KITCHEN KNIFE', hsCode: '' })).not.toContain('r16-generic-item-name');
  });
  it('포괄 단어가 포함되기만 한 품명("AUTO PARTS FOR HYUNDAI ENGINE")은 오탐하지 않는다', () => {
    expect(ids({ itemName: 'AUTO PARTS FOR HYUNDAI ENGINE', hsCode: '' })).not.toContain('r16-generic-item-name');
  });
  it('다품목 중 하나가 포괄 품명이면 잡는다', () => {
    const items = [
      { id: '1', itemName: 'FROZEN HAIRTAIL, WHOLE ROUND', hsCode: '0303892000', quantity: 10 as const, unit: 'EA' as const, unitPrice: 5 as const, currency: 'USD' as const },
      { id: '2', itemName: 'SAMPLE', hsCode: '', quantity: 1 as const, unit: 'EA' as const, unitPrice: 1 as const, currency: 'USD' as const },
    ];
    expect(ids({ shipperItems: items })).toContain('r16-generic-item-name');
  });
});

describe('R17 HS코드 ↔ 품명 분류 불일치', () => {
  const coatCandidates = [
    { code: '6202.11', description: '여성용 코트(모직물)', confidence: '높음', reasoning: '' },
    { code: '6202.19', description: '여성용 코트(기타)', confidence: '중간', reasoning: '' },
  ];
  const mkProfile = (hsCode: string) => ({ ...base, itemName: "Women's Cashmere Coats", hsCode });

  it('추천 후보(62류)와 입력 코드(96류)의 류가 전혀 다르면 error(override 가능)', () => {
    const issues = checkHsChapterMismatch(mkProfile('9608100000'), { status: 'valid', candidates: coatCandidates });
    const issue = issues.find(i => i.id === 'r17-hs-chapter-mismatch')!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('error');
    expect(issue.overridable).toBe(true);
    expect(issue.message).toContain('96류');
    expect(issue.message).toContain('62류');
  });

  it('후보 중 하나라도 같은 류면 미발행', () => {
    expect(checkHsChapterMismatch(mkProfile('6202192000'), { status: 'valid', candidates: coatCandidates }))
      .toHaveLength(0);
  });

  it('추천 후보가 없으면 판정 보류(오탐 방지)', () => {
    expect(checkHsChapterMismatch(mkProfile('9608100000'), { status: 'valid', candidates: [] }))
      .toHaveLength(0);
  });

  it('형식이 틀린 코드는 hscode-invalid 담당이므로 미발행', () => {
    expect(checkHsChapterMismatch(mkProfile('12345'), { status: 'invalid', candidates: coatCandidates }))
      .toHaveLength(0);
  });

  it('6자리 국제코드 입력도 대조한다', () => {
    const issues = checkHsChapterMismatch(mkProfile('960810'), { status: 'valid', candidates: coatCandidates });
    expect(issues.map(i => i.id)).toContain('r17-hs-chapter-mismatch');
  });
});

describe('R18 도착항 ↔ 거래처 국가 불일치', () => {
  it('도착항 일본 + 거래처 국가 미국 → error(override 가능)', () => {
    const issue = find(
      { dischargePort: 'OSAKA, JAPAN', partnerCountry: 'United States' },
      'r18-port-consignee-country',
    )!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('error');
    expect(issue.overridable).toBe(true);
  });
  it('도착항과 거래처 국가가 같으면 미발행', () => {
    expect(ids({ dischargePort: 'OSAKA, JAPAN', partnerCountry: 'Japan' }))
      .not.toContain('r18-port-consignee-country');
  });
  it('국가 추정이 안 되는 항구(함부르크 등)는 판정 보류(오탐 방지)', () => {
    expect(ids({ dischargePort: 'HAMBURG, GERMANY', partnerCountry: 'United States' }))
      .not.toContain('r18-port-consignee-country');
  });
  it('거래처 국가 미입력이면 미발행', () => {
    expect(ids({ dischargePort: 'OSAKA, JAPAN', partnerCountry: '' }))
      .not.toContain('r18-port-consignee-country');
  });
});

describe('R19 거래처 주소 ↔ 국가 선택 불일치', () => {
  it('주소는 일본인데 국가 선택이 미국이면 error(복붙 실수)', () => {
    const issue = find(
      { partnerAddress: '1-2-3 Umeda, Kita-ku, Osaka, Japan', partnerCountry: 'United States' },
      'r19-consignee-country-address',
    )!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('error');
    expect(issue.overridable).toBe(true);
  });
  it('주소와 국가 선택이 일치하면 미발행', () => {
    expect(ids({ partnerAddress: '100 Test Street, Los Angeles, CA, United States', partnerCountry: 'United States' }))
      .not.toContain('r19-consignee-country-address');
  });
  it('주소에서 국가를 추정할 수 없으면 판정 보류', () => {
    expect(ids({ partnerAddress: '100 Test Street, Los Angeles, CA', partnerCountry: 'United States' }))
      .not.toContain('r19-consignee-country-address');
  });
});

describe('R12 Buyer 정보 일관성', () => {
  it('Buyer 회사명만 있고 주소 없으면 warning', () => {
    const issue = find({ buyerName: 'Global Import LLC', buyerAddress: '' }, 'r12-buyer-address-missing')!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('warning');
  });

  it('Buyer 주소만 있고 회사명 없으면 warning', () => {
    const issue = find({ buyerName: '', buyerAddress: '250 Market Street, LA' }, 'r12-buyer-name-missing')!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe('warning');
  });

  it('둘 다 있으면 통과', () => {
    const list = ids({ buyerName: 'Global Import LLC', buyerAddress: '250 Market Street, LA' });
    expect(list).not.toContain('r12-buyer-address-missing');
    expect(list).not.toContain('r12-buyer-name-missing');
  });

  it('둘 다 비어 있으면 미발행(Buyer는 선택 항목)', () => {
    const list = ids({ buyerName: '', buyerAddress: '' });
    expect(list).not.toContain('r12-buyer-address-missing');
    expect(list).not.toContain('r12-buyer-name-missing');
  });
});
