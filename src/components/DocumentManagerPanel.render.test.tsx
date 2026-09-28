// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import DocumentManagerPanel from './DocumentManagerPanel';
import type { SavedTrade } from '../types';

const { fetchSubmittedTrades } = vi.hoisted(() => ({ fetchSubmittedTrades: vi.fn() }));
vi.mock('../services/storageService', () => ({ fetchSubmittedTrades, deleteSavedTrade: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function makeTrade(overrides: Partial<SavedTrade>): SavedTrade {
  return {
    id: 'trade-own',
    userId: 'shipper-1',
    tradeDirection: 'import',
    tradeRole: 'shipper',
    profile: {
      tradeType: 'import', itemName: '내 거래', hsCode: '', loadPort: '', dischargePort: '',
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

describe('DocumentManagerPanel — 소유권 필터', () => {
  it('roleFilter=shipper일 때 forwarder_user_id로 배정받은 남의 거래는 제외한다', async () => {
    fetchSubmittedTrades.mockResolvedValue([
      makeTrade({ id: 'trade-own', userId: 'shipper-1', profile: { ...makeTrade({}).profile, itemName: '내 거래' } }),
      makeTrade({ id: 'trade-foreign', userId: 'shipper-2', forwarderUserId: 'shipper-1', profile: { ...makeTrade({}).profile, itemName: '남의 거래' } }),
    ]);

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(
      <DocumentManagerPanel
        onLoad={() => {}}
        onCopy={() => {}}
        roleFilter="shipper"
        currentUserId="shipper-1"
      />,
    ));
    // 패널이 접혀 있으므로 펼친다.
    const toggle = container.querySelector('.doc-panel-head') as HTMLButtonElement | null;
    if (toggle) await act(async () => toggle.click());

    const text = container.textContent ?? '';
    expect(text).toContain('내 거래');
    expect(text).not.toContain('남의 거래');

    await act(async () => root.unmount());
    container.remove();
  });
});
