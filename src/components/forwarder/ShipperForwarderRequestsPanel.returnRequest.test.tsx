// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedTrade } from '../../types';
import type { ForwarderReturnRequest } from '../../types/forwarderCase';

const { fetchMock, outgoingMock } = vi.hoisted(() => ({ fetchMock: vi.fn(), outgoingMock: vi.fn() }));

vi.mock('../../services/storageService', () => ({ fetchSubmittedTrades: fetchMock }));
vi.mock('../../services/tradeListPolicy', () => ({ filterDocumentManagerTrades: (trades: SavedTrade[]) => trades }));
vi.mock('../../services/forwarderRequestService', () => ({ listOutgoingTradeRequests: outgoingMock }));
vi.mock('../../services/externalForwarderEmailService', () => ({ listExternalForwarderRequests: async () => [] }));
vi.mock('../../services/tradeMessageService', () => ({ listUnreadTradeMessageCounts: async () => ({}) }));
vi.mock('./ForwarderRequestModal', () => ({ default: () => null }));
// 대화 창은 위에 고정할 내용(pinned)만 그대로 그려 확인한다.
vi.mock('./TradeMessageThread', () => ({
  default: ({ pinned }: { pinned?: ReactNode }) => <div className="thread-mock">{pinned}<p>대화 내용</p></div>,
}));

import ShipperForwarderRequestsPanel from './ShipperForwarderRequestsPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const pendingRequest: ForwarderReturnRequest = {
  reason: '[반드시 수정]\n• 상업송장(C/I) · 서류 누락 — 첨부된 파일이 없습니다. 서류를 올려 주세요.',
  issueTitles: ['상업송장(C/I) · 서류 누락', '선하증권(B/L) · 원본·재발행 필요'],
  documentTypes: ['bill_of_lading', 'commercial_invoice'],
  requestedAt: '2026-10-06T01:00:00Z',
};

function importTrade(returnRequest: ForwarderReturnRequest | null): SavedTrade {
  return {
    id: 'trade-1',
    userId: 'me',
    tradeRole: 'shipper',
    tradeDirection: 'import',
    forwarderUserId: 'fwd-1',
    forwarderCase: { stage: 'review', returnRequest, updatedAt: 'now' },
    profile: { tradeType: 'import', itemName: '캐시미어 코트', blNo: 'BL-77' },
    documents: [],
    issues: [],
    createdAt: '2026-10-05T00:00:00Z',
    submittedAt: '2026-10-05T00:00:00Z',
  } as unknown as SavedTrade;
}

const acceptedRequest = { id: 'req-1', tradeId: 'trade-1', status: 'accepted', createdAt: '2026-10-05T01:00:00Z' };

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue([importTrade(pendingRequest)]);
  outgoingMock.mockReset().mockResolvedValue([acceptedRequest]);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

async function render(props: Partial<Parameters<typeof ShipperForwarderRequestsPanel>[0]> = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<ShipperForwarderRequestsPanel currentUserId="me" onOpenTrade={vi.fn()} {...props} />);
  });
  return container;
}

const buttonByText = (text: string) =>
  [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => b.textContent?.trim() === text);

describe('보완 요청 알림으로 들어온 화주', () => {
  it('목록을 불러오면 그 거래의 요청 카드와 대화를 바로 연다 — 어떤 서류인지 먼저 보인다', async () => {
    const onFocusHandled = vi.fn();
    const view = await render({ focusTradeId: 'trade-1', onFocusHandled, onRevise: vi.fn() });

    const card = view.querySelector('.thread-mock .rr-card');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('수정 필요');
    expect([...view.querySelectorAll('.rr-card-docs li')].map((li) => li.textContent)).toEqual(['상업송장(C/I)', '선하증권(B/L)']);
    expect(card?.textContent).toContain('서류 누락');
    expect(view.querySelector('.thread-mock')?.textContent).toContain('대화 내용');
    expect(view.querySelector('.tm-modal')?.textContent).toContain('BL-77');
    expect(onFocusHandled).toHaveBeenCalledTimes(1);
  });

  it('[문서 수정하러 가기]는 창을 닫고 그 거래를 수정 화면으로 연다', async () => {
    const onRevise = vi.fn();
    await render({ focusTradeId: 'trade-1', onRevise });
    await act(async () => buttonByText('문서 수정하러 가기')?.click());
    expect(onRevise).toHaveBeenCalledWith(expect.objectContaining({ id: 'trade-1' }));
    expect(container?.querySelector('.tm-modal')).toBeNull();
  });

  it('목록에 없는 거래면 열지 않고 상위에 알린다', async () => {
    const onFocusMissing = vi.fn();
    const onFocusHandled = vi.fn();
    const view = await render({ focusTradeId: 'gone', onFocusMissing, onFocusHandled });
    expect(onFocusMissing).toHaveBeenCalledWith('gone');
    expect(onFocusHandled).toHaveBeenCalledTimes(1);
    expect(view.querySelector('.tm-modal')).toBeNull();
  });

  it('이미 재제출로 처리된 요청은 처리 완료로 보여주고 수정 버튼을 두지 않는다', async () => {
    fetchMock.mockResolvedValue([importTrade({ ...pendingRequest, resolvedAt: '2026-10-06T03:00:00Z', shipperReply: '원본으로 다시 올렸습니다.' })]);
    const view = await render({ focusTradeId: 'trade-1', onRevise: vi.fn() });
    const card = view.querySelector('.rr-card');
    expect(card?.classList.contains('is-resolved')).toBe(true);
    expect(card?.textContent).toContain('처리 완료');
    expect(card?.textContent).toContain('원본으로 다시 올렸습니다.');
    expect(buttonByText('문서 수정하러 가기')).toBeUndefined();
  });

  it('대화 의뢰가 없는 거래도 보완 요청이 있으면 [요청 보기]로 카드를 연다', async () => {
    outgoingMock.mockResolvedValue([]);
    const view = await render({ onRevise: vi.fn() });
    await act(async () => buttonByText('요청 보기')?.click());
    expect(view.querySelector('.tm-modal .rr-card')).not.toBeNull();
    expect(view.querySelector('.thread-mock')).toBeNull();
  });
});
