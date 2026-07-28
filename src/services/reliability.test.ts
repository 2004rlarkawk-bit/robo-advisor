import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { extractJson } from './claudeService';
import { getIncotermsRule } from '../agents/incotermsRules';

// node 환경에는 localStorage가 없음 — storageService/claudeService가 쓰는 전역을 폴리필
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.clear();
});

describe('extractJson — LLM 응답 코드펜스 처리', () => {
  it('```json 펜스로 감싼 응답에서 본문을 추출한다', () => {
    const wrapped = '```json\n[{"code": "8471.30"}]\n```';
    expect(JSON.parse(extractJson(wrapped))).toEqual([{ code: '8471.30' }]);
  });

  it('언어 라벨 없는 펜스도 처리한다', () => {
    expect(extractJson('```\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it('펜스가 없으면 트림만 한다', () => {
    expect(extractJson('  {"a": 1}  ')).toBe('{"a": 1}');
  });
});

describe('getSettings — 레거시 API 키 필드 제외', () => {
  it('기존 설정 JSON의 키 필드를 읽거나 반환하지 않는다', async () => {
    const legacyKeyName = ['claude', 'Api', 'Key'].join('');
    localStorage.setItem('portai_settings', JSON.stringify({
      userName: '테스트',
      [legacyKeyName]: 'legacy-key',
      useLLM: true,
    }));

    const { getSettings } = await import('./storageService');
    const settings = getSettings();

    expect(settings.userName).toBe('테스트');
    expect(settings).not.toHaveProperty(legacyKeyName);
  });
});

describe('getSavedTrades — 손상된 이력 방어', () => {
  it('형태가 깨진 항목을 걸러내고 정상 항목만 반환한다', async () => {
    const { getSavedTrades } = await import('./storageService');
    const valid = {
      id: 'trade_1', createdAt: '2026-07-01T00:00:00.000Z',
      profile: { tradeType: 'export' }, documents: [], issues: []
    };
    const broken1 = { id: 'trade_2', profile: {}, documents: '배열 아님', issues: [] };
    const broken2 = 'not-an-object';
    localStorage.setItem('portai_saved_trades', JSON.stringify([valid, broken1, broken2, null]));

    const trades = getSavedTrades();
    expect(trades).toHaveLength(1);
    expect(trades[0].id).toBe('trade_1');
  });

  it('배열이 아닌 JSON이면 빈 목록을 반환한다', async () => {
    const { getSavedTrades } = await import('./storageService');
    localStorage.setItem('portai_saved_trades', JSON.stringify({ hacked: true }));
    expect(getSavedTrades()).toEqual([]);
  });
});

describe('getIncotermsRule — DAP/FCA 규칙', () => {
  it('DAP 규칙이 정의되어 있다 (보험은 매수인, 전 운송수단)', () => {
    const rule = getIncotermsRule('DAP');
    expect(rule).not.toBeNull();
    expect(rule!.insuranceRequirement).toBe('buyer');
    expect(rule!.transportMode).toBe('all');
    expect(rule!.requiredDocuments).toContain('bl');
  });

  it('FCA 규칙이 정의되어 있다', () => {
    const rule = getIncotermsRule('FCA');
    expect(rule).not.toBeNull();
    expect(rule!.requiredDocuments).toEqual(['invoice', 'packing_list']);
  });

  it('소문자 입력도 정규화한다', () => {
    expect(getIncotermsRule('dap')).not.toBeNull();
  });

  it('미정의 코드는 null', () => {
    expect(getIncotermsRule('CPT')).toBeNull();
  });
});
