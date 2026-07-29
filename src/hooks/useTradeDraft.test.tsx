// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TradeProfile } from '../types';

const {
  loadDraftFromLocalMock,
  loadTradeDraftMock,
  saveDraftToLocalMock,
} = vi.hoisted(() => ({
  loadDraftFromLocalMock: vi.fn(),
  loadTradeDraftMock: vi.fn(),
  saveDraftToLocalMock: vi.fn(),
}));

vi.mock('../services/draftCacheService', () => ({
  deleteTradeDraft: vi.fn(),
  loadDraftFromLocal: loadDraftFromLocalMock,
  loadTradeDraft: loadTradeDraftMock,
  removeDraftFromLocal: vi.fn(),
  saveDraftToLocal: saveDraftToLocalMock,
  saveTradeDraft: vi.fn(),
  selectNewestDraft: (
    local: unknown,
    database: { profile: TradeProfile; updated_at: string } | null,
  ) => database
    ? { profile: database.profile, updatedAt: database.updated_at, source: 'database' }
    : local,
}));

import { useTradeDraft } from './useTradeDraft';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const emptyProfile: TradeProfile = {
  tradeType: 'export',
  itemName: '',
  hsCode: '',
  loadPort: '',
  dischargePort: '',
  incoterms: '',
  quantity: '',
  weight: '',
  departureDate: '',
  arrivalDate: '',
  companyName: '',
  contact: '',
};

const profileDefaults: TradeProfile = {
  ...emptyProfile,
  companyName: 'ABC Trading Co., Ltd.',
  contactName: 'Jimin Kim',
  signedBy: 'Jimin Kim',
};

function Harness({ enabled }: { enabled: boolean }) {
  const [profile, setProfile] = useState(emptyProfile);
  useTradeDraft({
    userId: 'user-1',
    enabled,
    tradeDirection: 'export',
    tradeRole: 'shipper',
    profile,
    defaultProfile: profileDefaults,
    setProfile,
  });
  return <span>{profile.companyName}|{profile.signedBy}</span>;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe('useTradeDraft 프로필 비동기 초기화', () => {
  it('프로필 활성화 직후 DB 복원이 끝나기 전에 빈 profile을 저장하지 않는다', async () => {
    let resolveDatabase!: (value: {
      user_id: string;
      profile: TradeProfile;
      updated_at: string;
    }) => void;
    loadDraftFromLocalMock.mockReturnValue(null);
    loadTradeDraftMock.mockReturnValue(new Promise((resolve) => {
      resolveDatabase = resolve;
    }));

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Harness enabled={false} />));
    act(() => root?.render(<Harness enabled />));

    expect(saveDraftToLocalMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveDatabase({
        user_id: 'user-1',
        profile: { ...profileDefaults, companyName: 'Saved Draft Company', signedBy: 'Saved Signer' },
        updated_at: '2026-07-29T00:00:00.000Z',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toBe('Saved Draft Company|Saved Signer');
    expect(saveDraftToLocalMock).toHaveBeenLastCalledWith(
      'user-1',
      expect.objectContaining({ companyName: 'Saved Draft Company', signedBy: 'Saved Signer' }),
      'shipper',
    );
  });
});
