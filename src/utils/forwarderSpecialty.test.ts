import { describe, expect, it } from 'vitest';
import type { SavedTrade } from '../types';
import { normalizeSpecialties } from './forwarderSpecialty';
import { countTradeReviewIssues, suggestSpecialtiesForTrade } from './forwarderSpecialtySuggestion';

const countryOf = (port: string | undefined) => ({
  'Shanghai Port': 'CN', 'Los Angeles Port': 'US', 'Hamburg Port': 'DE', 'Busan Port': 'KR', 'Ho Chi Minh Port': 'VN',
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

  it('LCL 적재 방식이면 LCL 콘솔을 제안한다', () => {
    expect(keys(suggestSpecialtiesForTrade(trade({ loadingMode: 'LCL' }), countryOf))).toEqual(['cargo_lcl']);
    expect(suggestSpecialtiesForTrade(trade({ loadingMode: 'FCL' }), countryOf)).toEqual([]);
  });

  it('수산물(03류)은 HS만으로, 과일(08류)은 냉동·신선 단서가 있을 때만 콜드체인으로 본다', () => {
    expect(suggestSpecialtiesForTrade(trade({ hsCode: '0303.89-0000', itemName: 'Mackerel' }), countryOf))
      .toEqual([{ key: 'cargo_cold', reason: 'HS 03류 · 온도 관리 품목' }]);
    expect(keys(suggestSpecialtiesForTrade(trade({ hsCode: '0811900000', itemName: 'Frozen Blueberry' }), countryOf))).toEqual(['cargo_cold']);
    expect(suggestSpecialtiesForTrade(trade({ hsCode: '0813400000', itemName: 'Dried Persimmon' }), countryOf)).toEqual([]);
  });

  it('다른 류의 품명에 fresh가 들어 있다고 콜드체인으로 보지 않는다', () => {
    expect(suggestSpecialtiesForTrade(trade({ hsCode: '3307490000', itemName: 'Air Freshener Fresh Scent' }), countryOf)).toEqual([]);
  });

  it('위험물은 품명에 명시적 단서가 있을 때만 제안한다', () => {
    expect(suggestSpecialtiesForTrade(trade({ hsCode: '8507600000', itemName: 'Lithium-ion Battery Pack' }), countryOf))
      .toEqual([{ key: 'cargo_dg', reason: '품명에 "Lithium"' }]);
    expect(suggestSpecialtiesForTrade(trade({ hsCode: '2909110000', itemName: 'Diethyl Ether' }), countryOf)).toEqual([]);
  });

  it('공항이 항구 칸에 있으면 항공 운송을 제안한다', () => {
    expect(keys(suggestSpecialtiesForTrade(trade({ loadPort: 'Incheon Airport' }), countryOf))).toEqual(['cargo_air']);
  });

  it('여러 조건이 함께 잡힌다', () => {
    const result = suggestSpecialtiesForTrade(trade({
      dischargePort: 'Los Angeles Port', loadingMode: 'LCL', hsCode: '0304', itemName: 'Frozen Fish Fillet',
    }), countryOf);
    expect(keys(result)).toEqual(['route_us', 'cargo_lcl', 'cargo_cold']);
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
