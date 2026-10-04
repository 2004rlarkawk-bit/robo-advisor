// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedTrade } from '../../types';

const { deleteMock, fetchMock } = vi.hoisted(() => ({ deleteMock: vi.fn(), fetchMock: vi.fn() }));

vi.mock('../../services/storageService', () => ({
  fetchSubmittedTrades: fetchMock,
  deleteSavedTrade: deleteMock,
}));
vi.mock('../../services/tradeListPolicy', () => ({ filterDocumentManagerTrades: (trades: SavedTrade[]) => trades }));
vi.mock('../../services/forwarderRequestService', () => ({ listOutgoingTradeRequests: async () => [] }));
vi.mock('../../services/externalForwarderEmailService', () => ({ listExternalForwarderRequests: async () => [] }));
vi.mock('../../services/tradeMessageService', () => ({ listUnreadTradeMessageCounts: async () => ({}) }));
vi.mock('./ForwarderRequestModal', () => ({ default: () => null }));
vi.mock('./TradeMessageThread', () => ({ default: () => null }));

import ShipperForwarderRequestsPanel from './ShipperForwarderRequestsPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const trade = {
  id: 'trade-1',
  userId: 'me',
  tradeRole: 'shipper',
  tradeDirection: 'export',
  profile: { tradeType: 'export', itemName: 'desk', blNo: 'BL-1' },
  documents: [],
  issues: [],
  createdAt: '2026-10-03T00:00:00Z',
  submittedAt: '2026-10-03T00:00:00Z',
} as unknown as SavedTrade;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  deleteMock.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset().mockResolvedValue([trade]);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

async function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<ShipperForwarderRequestsPanel currentUserId="me" onOpenTrade={vi.fn()} />);
  });
  return container.querySelector<HTMLElement>('.shipper-request-row')!;
}

function swipe(row: HTMLElement, dx: number) {
  const opts = (x: number) => ({ bubbles: true, button: 0, pointerId: 1, clientX: x, clientY: 100 });
  row.setPointerCapture = () => {};
  act(() => {
    row.dispatchEvent(new PointerEvent('pointerdown', opts(400)));
    row.dispatchEvent(new PointerEvent('pointermove', opts(400 + dx / 2)));
    row.dispatchEvent(new PointerEvent('pointermove', opts(400 + dx)));
  });
  return () => act(async () => { row.dispatchEvent(new PointerEvent('pointerup', opts(400 + dx))); });
}

describe('포워더 의뢰 — 왼쪽으로 밀어 목록에서 삭제', () => {
  beforeEach(() => window.localStorage.clear());

  it('충분히 밀면 DB는 지우지 않고 목록에서만 숨기며, 새로 열어도 숨긴 채로 둔다', async () => {
    const row = await render();
    const release = swipe(row, -200);
    expect(container!.textContent).toContain('놓으면 삭제');
    await release();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(container!.querySelector('.shipper-request-row')).toBeNull();

    act(() => root?.unmount());
    container?.remove();
    await render();
    expect(container!.querySelector('.shipper-request-row')).toBeNull();
  });

  it('조금만 밀면 그대로 둔다', async () => {
    const row = await render();
    await swipe(row, -60)();
    expect(container!.querySelector('.shipper-request-row')).not.toBeNull();
  });

  it('[되돌리기]로 숨긴 거래를 다시 보인다', async () => {
    const row = await render();
    await swipe(row, -200)();
    const undo = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('되돌리기'));
    act(() => undo?.click());
    expect(container!.querySelector('.shipper-request-row')).not.toBeNull();
  });
});
