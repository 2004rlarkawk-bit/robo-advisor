// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import ShipperForwarderRequestsPanel from './ShipperForwarderRequestsPanel';
import type { SavedTrade } from '../../types';

const { fetchSubmittedTrades, listOutgoingTradeRequests, listExternalForwarderRequests, listUnreadTradeMessageCounts } = vi.hoisted(() => ({
  fetchSubmittedTrades: vi.fn(),
  listOutgoingTradeRequests: vi.fn(),
  listExternalForwarderRequests: vi.fn(),
  listUnreadTradeMessageCounts: vi.fn(),
}));

vi.mock('../../services/storageService', () => ({ fetchSubmittedTrades }));
vi.mock('../../services/forwarderRequestService', () => ({ listOutgoingTradeRequests }));
vi.mock('../../services/externalForwarderEmailService', () => ({ listExternalForwarderRequests }));
vi.mock('../../services/tradeMessageService', () => ({ listUnreadTradeMessageCounts }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function makeTrade(overrides: Partial<SavedTrade>): SavedTrade {
  return {
    id: 'trade-own',
    userId: 'shipper-1',
    tradeDirection: 'import',
    tradeRole: 'shipper',
    profile: {
      tradeType: 'import', itemName: '무선 이어폰', hsCode: '', loadPort: '', dischargePort: '',
      incoterms: '', quantity: '', weight: '', departureDate: '', arrivalDate: '',
      companyName: '인천테크', contact: '',
    },
    documents: [],
    issues: [],
    status: 'submitted',
    submittedAt: '2026-09-15T08:00:00.000Z',
    createdAt: '2026-09-15T08:00:00.000Z',
    ...overrides,
  } as SavedTrade;
}

describe('ShipperForwarderRequestsPanel — 소유권 필터', () => {
  it('forwarder_user_id로 나에게 배정된 남의 거래는 "내 의뢰" 목록에 섞이지 않는다', async () => {
    // 내가 화주로서 보낸 내 거래 1건 + 내가 포워더로 배정받은 남(shipper-2)의 거래 1건.
    // 남의 거래도 authoring 당시 화주 화면에서 작성됐으므로 tradeRole은 둘 다 'shipper'다 —
    // RLS(trades_select_assigned_forwarder)가 두 건 모두 돌려주므로, userId 비교 없이는 구분이 안 된다.
    fetchSubmittedTrades.mockResolvedValue([
      makeTrade({ id: 'trade-own', userId: 'shipper-1', profile: { ...makeTrade({}).profile, itemName: '내 거래' } }),
      makeTrade({ id: 'trade-foreign', userId: 'shipper-2', forwarderUserId: 'shipper-1', profile: { ...makeTrade({}).profile, itemName: '남의 거래' } }),
    ]);
    listOutgoingTradeRequests.mockResolvedValue([]);
    listExternalForwarderRequests.mockResolvedValue([]);
    listUnreadTradeMessageCounts.mockResolvedValue({});

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(
      <ShipperForwarderRequestsPanel currentUserId="shipper-1" onOpenTrade={() => {}} />,
    ));

    const text = container.textContent ?? '';
    expect(text).toContain('내 거래');
    expect(text).not.toContain('남의 거래');

    await act(async () => root.unmount());
    container.remove();
  });
});
