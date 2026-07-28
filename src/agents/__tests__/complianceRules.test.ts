import { describe, it, expect } from 'vitest';
import { runComplianceRules, RULE_POLICY } from '../complianceRules';
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
