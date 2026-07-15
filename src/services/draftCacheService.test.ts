import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TradeProfile } from '../types';
import {
  getTradeDraftCacheKey,
  loadDraftFromLocal,
  removeDraftFromLocal,
  saveDraftToLocal,
  selectNewestDraft,
} from './draftCacheService';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const profile: TradeProfile = {
  tradeType: 'export', itemName: '테스트 품목', hsCode: '', loadPort: '부산항',
  dischargePort: '상하이항', incoterms: 'FOB', quantity: 1, weight: 10,
  departureDate: '', arrivalDate: '', companyName: '테스트 회사', contact: '010-0000-0000',
};

beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

beforeEach(() => localStorage.clear());

describe('사용자별 거래 초안 localStorage', () => {
  it('user.id별 키로 저장하고 같은 사용자만 복원한다', () => {
    saveDraftToLocal('user-a', profile);
    expect(loadDraftFromLocal('user-a')?.profile.itemName).toBe('테스트 품목');
    expect(loadDraftFromLocal('user-b')).toBeNull();
    expect(getTradeDraftCacheKey('user-a')).toContain('user-a');
  });

  it('현재 사용자의 초안만 삭제한다', () => {
    saveDraftToLocal('user-a', profile);
    saveDraftToLocal('user-b', { ...profile, itemName: '다른 사용자' });
    removeDraftFromLocal('user-a');
    expect(loadDraftFromLocal('user-a')).toBeNull();
    expect(loadDraftFromLocal('user-b')?.profile.itemName).toBe('다른 사용자');
  });

  it('기존 v1 savedAt 캐시를 updatedAt 형식으로 복원한다', () => {
    localStorage.setItem(getTradeDraftCacheKey('legacy'), JSON.stringify({ version: 1, savedAt: '2026-07-01T00:00:00.000Z', profile }));
    expect(loadDraftFromLocal('legacy')?.updatedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('손상된 JSON은 화면을 깨뜨리지 않고 null을 반환한다', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem(getTradeDraftCacheKey('broken'), '{bad json');
    expect(loadDraftFromLocal('broken')).toBeNull();
    warning.mockRestore();
  });
});

describe('로컬과 DB 초안 최신본 선택', () => {
  it('updatedAt이 더 최신인 로컬 초안을 선택한다', () => {
    const local = { version: 2, profile, updatedAt: '2026-07-14T10:01:00.000Z' };
    const database = { user_id: 'user-a', profile: { ...profile, itemName: 'DB' }, updated_at: '2026-07-14T10:00:00.000Z' };
    expect(selectNewestDraft(local, database)?.source).toBe('local');
  });

  it('updated_at이 더 최신인 DB 초안을 선택한다', () => {
    const local = { version: 2, profile, updatedAt: '2026-07-14T10:00:00.000Z' };
    const database = { user_id: 'user-a', profile: { ...profile, itemName: 'DB' }, updated_at: '2026-07-14T10:01:00.000Z' };
    expect(selectNewestDraft(local, database)?.profile.itemName).toBe('DB');
  });
});
