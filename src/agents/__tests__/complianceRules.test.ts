import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runComplianceRules, checkPackingInvoiceConsistency, RULE_POLICY } from '../complianceRules';
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
