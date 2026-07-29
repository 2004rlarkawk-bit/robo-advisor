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

  it('화주 신규 필드와 단일 영문 품명을 새로고침 후 복원한다', () => {
    const extended: TradeProfile = {
      ...profile,
      itemName: 'Custom Cotton T-shirts',
      signedBy: 'KIM JIMIN',
      otherReferences: 'PO-77',
      shippingMarks: 'N/M',
      vesselOrFlight: 'OCEAN STAR',
      shipperItems: [{
        id: 'primary-item',
        itemName: 'Custom Cotton T-shirts',
        hsCode: '6109100000',
        quantity: 5,
        unit: 'EA',
        unitPrice: 12,
        currency: 'USD',
      }],
      shipperSupplemental: {
        buyerMatchesConsignee: false,
        consigneeMatchesNotifyParty: false,
        incotermsPlace: 'Busan Port',
        originCriterion: '',
        isSignerSameAsCompany: false,
        hasNoShippingMarks: true,
        shippingMarksBeforeNoMarks: 'SEOUL / C/NO. 1',
      },
    };
    saveDraftToLocal('extended', extended);
    expect(loadDraftFromLocal('extended')?.profile).toMatchObject(extended);
  });

  it('기존 영문 품명을 itemName으로 우선 복원하고 신규 저장에서는 레거시 키를 제거한다', () => {
    const legacyProfile = {
      ...profile,
      itemName: '코튼티셔츠',
      shipperItems: [{
        id: 'primary-item',
        itemName: '코튼티셔츠',
        englishDescription: 'Custom Cotton T-shirts',
        englishDescriptionManuallyEdited: true,
        hsCode: '6109100000',
        quantity: 5,
        unit: 'EA',
        unitPrice: 12,
        currency: 'USD',
      }],
    };
    localStorage.setItem(getTradeDraftCacheKey('legacy-description'), JSON.stringify({
      version: 2,
      updatedAt: '2026-07-01T00:00:00.000Z',
      profile: legacyProfile,
    }));

    const restored = loadDraftFromLocal('legacy-description')!.profile;
    expect(restored.itemName).toBe('Custom Cotton T-shirts');
    expect(restored.shipperItems?.[0].itemName).toBe('Custom Cotton T-shirts');
    expect(restored.shipperItems?.[0]).not.toHaveProperty('englishDescription');
    expect(restored.shipperItems?.[0]).not.toHaveProperty('englishDescriptionManuallyEdited');

    saveDraftToLocal('legacy-description', restored);
    const saved = JSON.parse(
      localStorage.getItem(getTradeDraftCacheKey('legacy-description')) || '{}'
    );
    expect(saved.profile.shipperItems[0]).toEqual(expect.objectContaining({
      itemName: 'Custom Cotton T-shirts',
    }));
    expect(saved.profile.shipperItems[0]).not.toHaveProperty('englishDescription');
  });

  it('기존 영문 품명이 없으면 기존 itemName을 잃지 않고 복원한다', () => {
    const legacyProfile = {
      ...profile,
      shipperItems: [{
        id: 'primary-item',
        itemName: '기존 한국어 품명',
        hsCode: '',
        quantity: 1,
        unit: 'EA',
        unitPrice: 1,
        currency: 'USD',
      }],
    };
    localStorage.setItem(getTradeDraftCacheKey('legacy-name-only'), JSON.stringify({
      version: 2,
      updatedAt: '2026-07-01T00:00:00.000Z',
      profile: legacyProfile,
    }));

    expect(loadDraftFromLocal('legacy-name-only')?.profile.shipperItems?.[0].itemName)
      .toBe('기존 한국어 품명');
  });

  it('기존 v1 savedAt 캐시를 updatedAt 형식으로 복원한다', () => {
    localStorage.setItem(getTradeDraftCacheKey('legacy'), JSON.stringify({ version: 1, savedAt: '2026-07-01T00:00:00.000Z', profile }));
    expect(loadDraftFromLocal('legacy')?.updatedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('기존 초안의 삭제된 업무설정 키는 복원 및 신규 저장에서 제외한다', () => {
    const legacyProfile = {
      ...profile,
      industry: 'manufacturing',
      tradePurpose: 'export',
      trade_purpose: 'export',
    } as TradeProfile;

    saveDraftToLocal('legacy-fields', legacyProfile);
    const raw = JSON.parse(localStorage.getItem(getTradeDraftCacheKey('legacy-fields')) || '{}');
    const restored = loadDraftFromLocal('legacy-fields')?.profile as TradeProfile & Record<string, unknown>;

    expect(raw.profile).not.toHaveProperty('industry');
    expect(raw.profile).not.toHaveProperty('tradePurpose');
    expect(raw.profile).not.toHaveProperty('trade_purpose');
    expect(restored).not.toHaveProperty('industry');
    expect(restored.itemName).toBe(profile.itemName);
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
