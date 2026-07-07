// @vitest-environment happy-dom
/**
 * 서비스 레이어 테스트 — API 파싱·폴백·단위 정규화
 *
 * happy-dom 환경 사용 이유: DOMParser(XML 파싱)와 localStorage(키 관리)가 필요.
 * fetch는 전부 모킹 — 실제 API를 호출하지 않는다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// vitest happy-dom 환경이 localStorage 전역을 제공하지 않음 → 서비스 모듈이
// import 시점에 storage를 캡처하므로, import보다 먼저(hoisted) 폴리필 주입.
vi.hoisted(() => {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

import {
  getCustomsExchangeRate,
  calcDutiableValue,
  verifyBusinessRegistration,
  getItemTradeStats,
  setDataGoKrKey,
  clearDataGoKrKey,
} from './customsApiService';
import {
  getTariffRates,
  pickBasicRate,
  estimateDuty,
  setUnipassKey,
  clearUnipassKey,
  type TariffRate,
} from './unipassService';
import { searchLaw, getRelatedLawForIssue } from './lawService';

const DUMMY_KEY = 'test-key-1234567890';

function xmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/xml' } });
}

afterEach(() => {
  clearDataGoKrKey();
  clearUnipassKey('tariff');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ===== 관세환율 / 과세가격 =====

describe('관세환율 100단위 통화 정규화', () => {
  it('JPY 시뮬레이션 환율은 1엔 기준으로 정규화된다 (100배 버그 방지)', async () => {
    const fx = await getCustomsExchangeRate('JPY');
    // 고시환율 940.2원(100엔당) → 1엔당 9.402원
    expect(fx.rate).toBeCloseTo(9.402, 3);
    expect(fx.source).toBe('simulation');
  });

  it('USD는 1단위 고시라 그대로 사용된다', async () => {
    const fx = await getCustomsExchangeRate('USD');
    expect(fx.rate).toBeCloseTo(1385.5, 1);
  });

  it('JPY 1,000,000엔 인보이스 → 약 940만원 (9.4억이 아님)', async () => {
    const dv = await calcDutiableValue(1_000_000, 'JPY');
    expect(dv.totalKrw).toBe(9_402_000);
  });

  it('API 응답의 JPY 고시환율(100엔당)도 1엔 기준으로 나눠진다', async () => {
    setDataGoKrKey(DUMMY_KEY);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(xmlResponse(
      `<response><header><resultCode>00</resultCode></header><body><items>
         <item><currSgn>JPY</currSgn><fxrt>951.34</fxrt><mtryUtNm>일본 엔(100)</mtryUtNm><aplyBgnDt>20260705</aplyBgnDt></item>
       </items></body></response>`
    )));
    const fx = await getCustomsExchangeRate('JPY');
    expect(fx.source).toBe('api');
    expect(fx.rate).toBeCloseTo(9.5134, 4);
  });
});

// ===== 관세청 GW 오류 감지 =====

describe('관세청 GW resultCode 오류 감지', () => {
  it('resultCode 99 응답은 "데이터 없음"이 아니라 오류로 기록 후 시뮬 폴백된다', async () => {
    setDataGoKrKey(DUMMY_KEY);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(xmlResponse(
      '<response><header><resultCode>99</resultCode><resultMsg>인증키가 유효하지 않습니다</resultMsg></header></response>'
    )));
    const stats = await getItemTradeStats('8517621010', '202601', '202603');
    expect(stats[0].source).toBe('simulation');
    const logged = warn.mock.calls.map((c) => String(c[1] ?? c[0])).join(' ');
    expect(logged).toContain('resultCode 99');
  });
});

// ===== 국세청 사업자번호 =====

describe('사업자등록번호 체크섬 (시뮬레이션 폴백)', () => {
  it('삼성전자 124-81-00998은 유효', async () => {
    const r = await verifyBusinessRegistration('124-81-00998');
    expect(r.valid).toBe(true);
    expect(r.source).toBe('simulation');
  });

  it('체크섬 불일치 번호는 무효', async () => {
    const r = await verifyBusinessRegistration('1234567890');
    expect(r.valid).toBe(false);
  });

  it('10자리 미만은 형식 오류 메시지', async () => {
    const r = await verifyBusinessRegistration('12345');
    expect(r.valid).toBe(false);
    expect(r.statusText).toContain('10자리');
  });
});

// ===== UNI-PASS =====

describe('UNI-PASS 관세율 파싱·오류 감지', () => {
  it('정상 XML → 세율 목록 파싱', async () => {
    setUnipassKey('tariff', DUMMY_KEY);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(xmlResponse(
      `<trrtQryRtnVo><tCnt>2</tCnt>
         <trrtQryRsltVo><trrtTpcd>A</trrtTpcd><trrtTpNm>기본세율</trrtTpNm><trrt>8</trrt><aplyStrtDt>20260101</aplyStrtDt></trrtQryRsltVo>
         <trrtQryRsltVo><trrtTpcd>C</trrtTpcd><trrtTpNm>WTO협정세율</trrtTpNm><trrt>13</trrt><aplyStrtDt>20260101</aplyStrtDt></trrtQryRsltVo>
       </trrtQryRtnVo>`
    )));
    const rates = await getTariffRates('8517621010');
    expect(rates).toHaveLength(2);
    expect(rates[0].source).toBe('api');
    expect(pickBasicRate(rates)?.rate).toBe(8);
  });

  it('ntceInfo만 있는 응답(인증 실패 등)은 오류로 기록 후 시뮬 폴백', async () => {
    setUnipassKey('tariff', DUMMY_KEY);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(xmlResponse(
      '<trrtQryRtnVo><ntceInfo>인증키 오류입니다</ntceInfo><tCnt>0</tCnt></trrtQryRtnVo>'
    )));
    const rates = await getTariffRates('8517621010');
    expect(rates[0].source).toBe('simulation');
    const logged = warn.mock.calls.map((c) => String(c[1] ?? c[0])).join(' ');
    expect(logged).toContain('UNI-PASS 안내');
  });

  it('pickBasicRate: 기본세율(A) 우선, 빈 배열은 null', () => {
    const rates: TariffRate[] = [
      { hsCode: '', typeCode: 'C', typeName: 'WTO', rate: 13, applyStart: '', applyEnd: '', source: 'simulation' },
      { hsCode: '', typeCode: 'A', typeName: '기본', rate: 8, applyStart: '', applyEnd: '', source: 'simulation' },
    ];
    expect(pickBasicRate(rates)?.typeCode).toBe('A');
    expect(pickBasicRate([])).toBeNull();
  });

  it('estimateDuty: 과세가격 × 세율 (키 없음 → 시뮬 8%)', async () => {
    const duty = await estimateDuty('8517621010', 10_000_000);
    expect(duty).not.toBeNull();
    expect(duty!.estimatedDutyKrw).toBe(800_000);
    expect(duty!.source).toBe('simulation');
  });
});

// ===== 법제처 =====

describe('법제처 법령 서비스', () => {
  it('OC 미설정 시 시뮬레이션 검색 결과 반환', async () => {
    const results = await searchLaw('관세법');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].lawName).toContain('관세법');
    expect(results[0].source).toBe('simulation');
  });

  it('검증 이슈 → 근거 법령 매핑', () => {
    expect(getRelatedLawForIssue('dutiable-value-info')?.article).toBe('제30조');
    expect(getRelatedLawForIssue('co-required')?.lawName).toBe('대외무역법');
    expect(getRelatedLawForIssue('없는-이슈')).toBeNull();
  });
});
