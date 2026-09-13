// @vitest-environment happy-dom
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TradeProfile } from '../types';

const {
  loadDraftFromLocalMock,
  loadTradeDraftMock,
  saveDraftToLocalMock,
  isSubmittedTradeDraftMock,
  removeDraftFromLocalMock,
  deleteTradeDraftMock,
} = vi.hoisted(() => ({
  loadDraftFromLocalMock: vi.fn(),
  loadTradeDraftMock: vi.fn(),
  saveDraftToLocalMock: vi.fn(),
  isSubmittedTradeDraftMock: vi.fn().mockResolvedValue(false),
  removeDraftFromLocalMock: vi.fn(),
  deleteTradeDraftMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/draftCacheService', () => ({
  deleteTradeDraft: deleteTradeDraftMock,
  loadDraftFromLocal: loadDraftFromLocalMock,
  loadTradeDraft: loadTradeDraftMock,
  isSubmittedTradeDraft: isSubmittedTradeDraftMock,
  removeDraftFromLocal: removeDraftFromLocalMock,
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

function Harness({
  enabled,
  tradeId = null,
  activeTradeProfile,
}: {
  enabled: boolean;
  tradeId?: string | null;
  activeTradeProfile?: TradeProfile;
}) {
  const [profile, setProfile] = useState(emptyProfile);
  useEffect(() => {
    if (tradeId && activeTradeProfile) setProfile(activeTradeProfile);
  }, [activeTradeProfile, tradeId]);
  useTradeDraft({
    userId: 'user-1',
    enabled,
    tradeDirection: 'export',
    tradeRole: 'shipper',
    profile,
    defaultProfile: profileDefaults,
    setProfile,
    tradeId,
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
  isSubmittedTradeDraftMock.mockResolvedValue(false);
});

describe('useTradeDraft 프로필 비동기 초기화', () => {
  it('local draft가 submitted 거래를 가리키면 복원하지 않고 local/DB draft를 폐기한다', async () => {
    loadDraftFromLocalMock.mockReturnValue({
      profile: { ...profileDefaults, companyName: 'Submitted Company' },
      tradeId: 'submitted-trade',
      currentStep: 2,
      updatedAt: '2026-08-15T00:00:00.000Z',
      source: 'local',
    });
    loadTradeDraftMock.mockResolvedValue(null);
    isSubmittedTradeDraftMock.mockResolvedValue(true);

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness enabled />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toBe('ABC Trading Co., Ltd.|Jimin Kim');
    expect(removeDraftFromLocalMock).toHaveBeenCalledWith('user-1', 'export', 'shipper');
    expect(deleteTradeDraftMock).toHaveBeenCalledWith('user-1', 'export', 'shipper');
  });

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
      { attachments: [], currentStep: 1, tradeId: null },
    );
  });

  it('거래 이어쓰기가 시작된 뒤 도착한 draft 응답은 현재 거래 form을 덮어쓰지 않는다', async () => {
    let resolveDatabase!: (value: {
      user_id: string;
      profile: TradeProfile;
      updated_at: string;
    }) => void;
    loadDraftFromLocalMock.mockReturnValue(null);
    loadTradeDraftMock.mockReturnValue(new Promise((resolve) => {
      resolveDatabase = resolve;
    }));
    const activeTradeProfile = {
      ...profileDefaults,
      companyName: 'Current Trade Company',
      signedBy: 'Current Trade Signer',
    };

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Harness enabled />));
    act(() => root?.render(
      <Harness
        enabled
        tradeId="trade-1"
        activeTradeProfile={activeTradeProfile}
      />,
    ));

    await act(async () => {
      resolveDatabase({
        user_id: 'user-1',
        profile: {
          ...profileDefaults,
          companyName: 'Stale Draft Company',
          signedBy: 'Stale Draft Signer',
        },
        updated_at: '2026-07-29T00:00:00.000Z',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toBe('Current Trade Company|Current Trade Signer');
  });
});
