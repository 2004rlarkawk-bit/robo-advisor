import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TradeProfile } from '../types';
import { tradeProfileToFormData } from './tradeDataMapper';
import {
  getTradeDraftCacheKey,
  loadDraftFromLocal,
  removeDraftFromLocal,
  saveDraftToLocal,
  saveTradeFormDraft,
  saveTradeDraft,
  selectNewestDraft,
} from './draftCacheService';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}));

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

beforeEach(() => {
  localStorage.clear();
  fromMock.mockReset();
});

function mockDraftUpsert(updatedAt?: string) {
  const single = vi.fn().mockResolvedValue({
    data: updatedAt === undefined ? {} : { updated_at: updatedAt },
    error: null,
  });
  const select = vi.fn().mockReturnValue({ single });
  const upsert = vi.fn().mockReturnValue({ select });
  fromMock.mockReturnValue({ upsert });
  return { upsert, select, single };
}

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
    const local = {
      version: 3,
      profile,
      formData: tradeProfileToFormData(profile, 'shipper'),
      currentStep: 1,
      tradeId: null,
      updatedAt: '2026-07-14T10:01:00.000Z',
    };
    const database = { user_id: 'user-a', profile: { ...profile, itemName: 'DB' }, updated_at: '2026-07-14T10:00:00.000Z' };
    expect(selectNewestDraft(local, database)?.source).toBe('local');
  });

  it('updated_at이 더 최신인 DB 초안을 선택한다', () => {
    const local = {
      version: 3,
      profile,
      formData: tradeProfileToFormData(profile, 'shipper'),
      currentStep: 1,
      tradeId: null,
      updatedAt: '2026-07-14T10:00:00.000Z',
    };
    const database = { user_id: 'user-a', profile: { ...profile, itemName: 'DB' }, updated_at: '2026-07-14T10:01:00.000Z' };
    expect(selectNewestDraft(local, database)?.profile.itemName).toBe('DB');
  });
});

describe('Supabase v3 초안 저장 timestamp', () => {
  it('서버 기본값을 사용하도록 updated_at 없이 v3 payload와 신규 conflict key를 전송한다', async () => {
    const serverTimestamp = '2026-07-30T01:00:00.000Z';
    const { upsert, select } = mockDraftUpsert(serverTimestamp);

    const result = await saveTradeDraft('insert-user', profile, 'shipper');

    expect(fromMock).toHaveBeenCalledWith('trade_drafts');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: 'user_id,direction,role' });
    expect(payload).toMatchObject({
      user_id: 'insert-user',
      direction: 'export',
      role: 'shipper',
      schema_version: 3,
      current_step: 1,
      form_data: {
        schemaVersion: 3,
        direction: 'export',
        role: 'shipper',
      },
    });
    expect(payload).not.toHaveProperty('updated_at');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('profile');
    expect(payload).not.toHaveProperty('trade_direction');
    expect(payload).not.toHaveProperty('trade_role');
    expect(select).toHaveBeenCalledWith('updated_at');
    expect(result).toEqual({ saved: true, updatedAt: serverTimestamp });
  });

  it('conflict UPDATE 뒤 DB가 반환한 새 updated_at을 최신 캐시 시각으로 사용한다', async () => {
    const firstTimestamp = '2026-07-30T01:00:00.000Z';
    const secondTimestamp = '2026-07-30T01:05:00.000Z';
    const { single } = mockDraftUpsert(firstTimestamp);

    const first = await saveTradeDraft('update-user', profile, 'forwarder');
    single.mockResolvedValueOnce({ data: { updated_at: secondTimestamp }, error: null });
    const second = await saveTradeDraft(
      'update-user',
      { ...profile, itemName: '수정된 품목' },
      'forwarder',
    );
    const unchanged = await saveTradeDraft(
      'update-user',
      { ...profile, itemName: '수정된 품목' },
      'forwarder',
    );

    expect(first.updatedAt).toBe(firstTimestamp);
    expect(second).toEqual({ saved: true, updatedAt: secondTimestamp });
    expect(unchanged).toEqual({ saved: false, updatedAt: secondTimestamp });
  });

  it('DB 응답에 updated_at이 없으면 저장 성공으로 처리하지 않는다', async () => {
    mockDraftUpsert();

    await expect(saveTradeDraft('missing-timestamp-user', profile, 'shipper'))
      .rejects.toThrow('초안 저장 후 서버 수정 시각을 확인하지 못했습니다.');
  });

  it.each([
    ['export', 'shipper'],
    ['export', 'forwarder'],
    ['import', 'shipper'],
    ['import', 'forwarder'],
  ] as const)('%s/%s 조합을 독립 conflict key와 v3 form_data로 저장한다', async (direction, role) => {
    const { upsert } = mockDraftUpsert(`2026-07-30T02:0${fromMock.mock.calls.length}:00.000Z`);
    const formData = tradeProfileToFormData({ ...profile, tradeType: direction }, role);

    await saveTradeFormDraft({
      userId: `four-combinations-${direction}-${role}`,
      direction,
      role,
      formData,
      currentStep: 3,
      tradeId: `${direction}-${role}-trade`,
    });

    const [payload, options] = upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: 'user_id,direction,role' });
    expect(payload).toMatchObject({
      direction,
      role,
      trade_id: `${direction}-${role}-trade`,
      schema_version: 3,
      current_step: 3,
      form_data: { schemaVersion: 3, direction, role },
    });
    expect(payload).not.toHaveProperty('profile');
    expect(payload).not.toHaveProperty('status');
  });

  it('첨부 metadata와 storagePath만 local/DB 초안에 저장한다', async () => {
    const attachment = {
      id: 'attachment-1',
      documentType: 'commercial_invoice' as const,
      fileName: 'invoice.pdf',
      storageBucket: 'trade-documents',
      storagePath: 'user/draft-export-forwarder/commercial_invoice/attachment-1-invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      uploadedAt: '2026-07-30T02:00:00.000Z',
    };
    const local = saveDraftToLocal('attachment-user', profile, 'forwarder', {
      attachments: [attachment],
      currentStep: 2,
      tradeId: 'trade-1',
    });
    expect(local.formData.attachments).toEqual([attachment]);
    expect(JSON.stringify(local)).not.toContain('[object File]');

    const { upsert } = mockDraftUpsert('2026-07-30T02:10:00.000Z');
    await saveTradeDraft('attachment-db-user', profile, 'forwarder', {
      attachments: [attachment],
      currentStep: 2,
      tradeId: 'trade-1',
    });
    const payload = upsert.mock.calls[0][0];
    expect(payload.form_data.attachments).toEqual([attachment]);
    expect(payload.current_step).toBe(2);
    expect(payload.trade_id).toBe('trade-1');
  });
});
