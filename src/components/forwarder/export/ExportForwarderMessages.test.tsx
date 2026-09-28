// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import ExportForwarderMessages from './ExportForwarderMessages';
import type { SavedTrade } from '../../../types';

const { listRequests } = vi.hoisted(() => ({ listRequests: vi.fn() }));
vi.mock('../../../services/forwarderRequestService', () => ({ listIncomingTradeRequests: listRequests }));
vi.mock('../TradeMessageThread', () => ({
  default: ({ tradeRequestId, currentRole }: { tradeRequestId: string; currentRole?: string }) => (
    <div data-testid="message-thread" data-current-role={currentRole}>{tradeRequestId}</div>
  ),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('수출 포워더 업무 메시지', () => {
  it('별도 생성된 포워더 거래가 아닌 원 화주 의뢰의 대화로 연결한다', async () => {
    listRequests.mockResolvedValue([{ id: 'request-1', tradeId: 'shipper-trade-1', status: 'accepted' }]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const trade = {
      id: 'forwarder-trade-1', sourceTradeId: 'shipper-trade-1',
      profile: { companyName: 'ABC KOREA' },
    } as SavedTrade;

    await act(async () => root.render(<ExportForwarderMessages trade={trade} userId="forwarder-1" />));
    expect(container.querySelector('[data-testid="message-thread"]')?.textContent).toBe('request-1');

    await act(async () => root.unmount());
    container.remove();
  });

  it('통합 계정이 화주 역할로 보낸 메시지를 내 메시지로 오인하지 않도록 포워더 역할을 명시해서 전달한다', async () => {
    listRequests.mockResolvedValue([{ id: 'request-1', tradeId: 'shipper-trade-1', status: 'accepted' }]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const trade = {
      id: 'forwarder-trade-1', sourceTradeId: 'shipper-trade-1',
      profile: { companyName: 'ABC KOREA' },
    } as SavedTrade;

    await act(async () => root.render(<ExportForwarderMessages trade={trade} userId="forwarder-1" />));
    expect(container.querySelector('[data-testid="message-thread"]')?.getAttribute('data-current-role')).toBe('forwarder');

    await act(async () => root.unmount());
    container.remove();
  });
});
