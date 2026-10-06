import { describe, expect, it } from 'vitest';
import type { SavedTrade } from '../types';
import { FORWARDER_SPECIALTIES, normalizeCustomSpecialties, normalizeSpecialties } from './forwarderSpecialty';
import { countTradeReviewIssues, suggestSpecialtiesForTrade } from './forwarderSpecialtySuggestion';

const countryOf = (port: string | undefined) => ({
  'Shanghai Port': 'CN', 'Los Angeles Port': 'US', 'Hamburg Port': 'DE', 'Busan Port': 'KR', 'Ho Chi Minh Port': 'VN',
  'Laem Chabang Port': 'TH', 'Kaohsiung Port': 'TW', 'Nhava Sheva Port': 'IN', 'Jebel Ali Port': 'AE',
  'Vladivostok Port': 'RU', 'Santos Port': 'BR',
} as Record<string, string>)[port ?? ''] ?? null;

function trade(profile: Record<string, unknown>, tradeDirection: 'export' | 'import' = 'export') {
  return { profile: { tradeType: tradeDirection, itemName: '', hsCode: '', loadPort: '', dischargePort: '', ...profile }, tradeDirection } as unknown as SavedTrade;
}

const keys = (list: Array<{ key: string }>) => list.map((item) => item.key);

describe('suggestSpecialtiesForTrade', () => {
  it('수출은 도착항, 수입은 선적항의 국가로 항로를 고르고 근거를 남긴다', () => {
    const exported = suggestSpecialtiesForTrade(trade({ loadPort: 'Busan Port', dischargePort: 'Shanghai Port' }), countryOf);
    expect(exported).toEqual([{ key: 'route_cn', reason: '도착항 Shanghai Port' }]);

    const imported = suggestSpecialtiesForTrade(trade({ loadPort: 'Ho Chi Minh Port', dischargePort: 'Busan Port' }, 'import'), countryOf);
    expect(imported).toEqual([{ key: 'route_vn', reason: '선적항 Ho Chi Minh Port' }]);
  });

  it('EU 회원국 항구는 유럽 항로로 묶고, 목록에 없는 국가는 제안하지 않는다', () => {
    expect(keys(suggestSpecialtiesForTrade(trade({ dischargePort: 'Hamburg Port' }), countryOf))).toEqual(['route_eu']);
    expect(suggestSpecialtiesForTrade(trade({ dischargePort: 'Busan Port' }), countryOf)).toEqual([]);
    expect(suggestSpecialtiesForTrade(trade({ dischargePort: 'Unknown Port' }), countryOf)).toEqual([]);
  });

  it('적재 방식은 LCL·FCL 각각 그에 맞는 조건을 제안한다', () => {
    expect(keys(suggestSpecialtiesForTrade(trade({ loadingMode: 'LCL' }), countryOf))).toEqual(['cargo_lcl']);
    expect(keys(suggestSpecialtiesForTrade(trade({ loadingMode: 'FCL' }), countryOf))).toEqual(['cargo_fcl']);
    expect(suggestSpecialtiesForTrade(trade({ loadingMode: '' }), countryOf)).toEqual([]);
  });

  it('수산물(03류)은 HS만으로, 과일(08류)은 냉동·신선 단서가 있을 때만 콜드체인으로 본다', () => {
    expect(suggestSpecialtiesForTrade(trade({ hsCode: '0303.89-0000', itemName: 'Mackerel' }), countryOf))
      .toEqual([
        { key: 'cargo_cold', reason: 'HS 03류 · 온도 관리 품목' },
        { key: 'goods_food', reason: 'HS 03류 · 식품·농수산물' },
      ]);
    expect(keys(suggestSpecialtiesForTrade(trade({ hsCode: '0811900000', itemName: 'Frozen Blueberry' }), countryOf))).toEqual(['cargo_cold', 'goods_food']);
    // 건조 과일은 식품이지만 상온 화물이다.
    expect(keys(suggestSpecialtiesForTrade(trade({ hsCode: '0813400000', itemName: 'Dried Persimmon' }), countryOf))).toEqual(['goods_food']);
  });

  it('다른 류의 품명에 fresh가 들어 있다고 콜드체인으로 보지 않는다', () => {
    expect(keys(suggestSpecialtiesForTrade(trade({ hsCode: '3307490000', itemName: 'Air Freshener Fresh Scent' }), countryOf))).toEqual(['goods_chemical']);
  });

  it('위험물은 품명에 명시적 단서가 있을 때만 제안한다', () => {
    expect(suggestSpecialtiesForTrade(trade({ hsCode: '8507600000', itemName: 'Lithium-ion Battery Pack' }), countryOf))
      .toEqual([
        { key: 'cargo_dg', reason: '품명에 "Lithium"' },
        { key: 'goods_electronics', reason: 'HS 85류 · 전기·전자기기' },
      ]);
    expect(keys(suggestSpecialtiesForTrade(trade({ hsCode: '2909110000', itemName: 'Diethyl Ether' }), countryOf))).toEqual(['goods_chemical']);
  });

  it('공항이 항구 칸에 있으면 항공 운송을 제안한다', () => {
    expect(keys(suggestSpecialtiesForTrade(trade({ loadPort: 'Incheon Airport' }), countryOf))).toEqual(['cargo_air']);
  });

  it('여러 조건이 함께 잡힌다', () => {
    const result = suggestSpecialtiesForTrade(trade({
      dischargePort: 'Los Angeles Port', loadingMode: 'LCL', hsCode: '0304', itemName: 'Frozen Fish Fillet',
    }), countryOf);
    expect(keys(result)).toEqual(['route_us', 'cargo_lcl', 'cargo_cold', 'goods_food']);
  });

  it('HS 류로 품목 조건을 고르고, 무엇 때문인지 근거를 남긴다', () => {
    const goods = (hsCode: string, itemName = 'item') =>
      suggestSpecialtiesForTrade(trade({ hsCode, itemName }), countryOf);
    // 사무용 책상처럼 특별한 취급이 필요 없는 화물도 품목 조건이 잡힌다.
    expect(goods('9403301000', 'Wooden Office Desk')).toEqual([{ key: 'goods_consumer', reason: 'HS 94류 · 가구·조명' }]);
    expect(keys(goods('9102110000', 'Watch'))).toEqual(['goods_consumer']);
    expect(keys(goods('6109100000', 'Cotton T-Shirts'))).toEqual(['goods_apparel']);
    // 가죽 의류(4203)는 42류(가죽제품)지만 의류로 본다. 가방(4202)은 소비재다.
    expect(goods('4203100000', 'Leather Coat')).toEqual([{ key: 'goods_apparel', reason: 'HS 4203 · 가죽 의류' }]);
    expect(keys(goods('4202210000', 'Handbag'))).toEqual(['goods_consumer']);
    // 철강처럼 어느 묶음에도 딱 맞지 않는 원료·중간재는 넣지 않는다.
    expect(goods('7208100000', 'Hot-rolled Steel')).toEqual([]);
    expect(goods('', 'desk')).toEqual([]);
  });
});

describe('normalizeSpecialties', () => {
  it('모르는 값·중복을 버리고 정의 순서로 정렬한다', () => {
    expect(normalizeSpecialties(['cargo_dg', 'route_cn', 'hacker', 'route_cn', 42])).toEqual(['route_cn', 'cargo_dg']);
    expect(normalizeSpecialties(null)).toEqual([]);
  });
});

describe('countTradeReviewIssues', () => {
  it('오류·경고만 세고 참고(info)는 뺀다', () => {
    const issues = [{ severity: 'error' }, { severity: 'warning' }, { severity: 'info' }] as SavedTrade['issues'];
    expect(countTradeReviewIssues({ issues })).toBe(2);
  });
});

describe('normalizeCustomSpecialties', () => {
  it('앞뒤 공백을 다듬고 연속 공백은 한 칸으로', () => {
    expect(normalizeCustomSpecialties(['  삼국간  무역 '])).toEqual(['삼국간 무역']);
  });

  it('빈 값과 문자열이 아닌 값은 버린다', () => {
    expect(normalizeCustomSpecialties(['', '   ', null, 3, '반송'])).toEqual(['반송']);
  });

  it('대소문자만 다른 중복은 하나로', () => {
    expect(normalizeCustomSpecialties(['Ro-Ro', 'ro-ro', 'RO-RO'])).toEqual(['Ro-Ro']);
  });

  it('20자를 넘는 값은 버린다', () => {
    expect(normalizeCustomSpecialties(['가'.repeat(20), '나'.repeat(21)])).toEqual(['가'.repeat(20)]);
  });

  it('5개까지만 남긴다', () => {
    expect(normalizeCustomSpecialties(['1', '2', '3', '4', '5', '6'])).toHaveLength(5);
  });

  it('배열이 아니면 빈 배열', () => {
    expect(normalizeCustomSpecialties(undefined)).toEqual([]);
    expect(normalizeCustomSpecialties('반송')).toEqual([]);
  });
});

describe('넓힌 특화 분야 목록', () => {
  it('키가 중복되지 않는다', () => {
    const keys = FORWARDER_SPECIALTIES.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('기존에 저장된 키는 그대로 유효하다', () => {
    const legacy = ['route_cn', 'route_us', 'route_jp', 'route_vn', 'route_eu', 'cargo_lcl', 'cargo_cold', 'cargo_dg', 'cargo_air'];
    expect(normalizeSpecialties(legacy)).toEqual(legacy);
  });

  it('새로 더한 키도 통과한다', () => {
    expect(normalizeSpecialties(['route_sea', 'cargo_fcl'])).toEqual(['route_sea', 'cargo_fcl']);
  });
});

describe('넓힌 노선 제안', () => {
  const routeOf = (dischargePort: string) =>
    suggestSpecialtiesForTrade(trade({ dischargePort }), countryOf).map((item) => item.key);

  it('동남아·대만홍콩·인도·중동·CIS·중남미를 각각 알아본다', () => {
    expect(routeOf('Laem Chabang Port')).toContain('route_sea');
    expect(routeOf('Kaohsiung Port')).toContain('route_twhk');
    expect(routeOf('Nhava Sheva Port')).toContain('route_in');
    expect(routeOf('Jebel Ali Port')).toContain('route_me');
    expect(routeOf('Vladivostok Port')).toContain('route_cis');
    expect(routeOf('Santos Port')).toContain('route_latam');
  });

  it('베트남은 동남아로 묶지 않고 따로 본다', () => {
    expect(routeOf('Ho Chi Minh Port')).toContain('route_vn');
    expect(routeOf('Ho Chi Minh Port')).not.toContain('route_sea');
  });

  it('FCL도 적재 방식 조건으로 제안한다', () => {
    const keys = suggestSpecialtiesForTrade(trade({ loadingMode: 'FCL' }), countryOf).map((item) => item.key);
    expect(keys).toContain('cargo_fcl');
    expect(keys).not.toContain('cargo_lcl');
  });
});
