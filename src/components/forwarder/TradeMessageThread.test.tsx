// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TradeMessage } from '../../types/forwarderRequest';

const service = vi.hoisted(() => ({
  listTradeMessages: vi.fn(),
  markTradeMessagesRead: vi.fn(),
  sendTradeMessage: vi.fn(),
  subscribeToTradeMessages: vi.fn(),
  TRADE_MESSAGE_MAX_LENGTH: 4000,
}));

vi.mock('../../services/tradeMessageService', () => service);

import TradeMessageThread from './TradeMessageThread';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const theirs: TradeMessage = {
  id: 'msg-1', tradeRequestId: 'req-1', tradeId: 'trade-1', senderUserId: 'forwarder-1',
  kind: 'return_request', body: '순중량이 총중량보다 큽니다. 확인 부탁드립니다.', createdAt: '2026-09-21T01:00:00.000Z', readAt: null,
};
const mine: TradeMessage = {
  id: 'msg-2', tradeRequestId: 'req-1', tradeId: 'trade-1', senderUserId: 'shipper-1',
  kind: 'message', body: '수정해서 다시 올렸습니다.', createdAt: '2026-09-21T01:10:00.000Z', readAt: '2026-09-21T01:12:00.000Z',
};

describe('TradeMessageThread', () => {
  let container: HTMLDivElement;
  let root: Root;
  let pushRealtime: ((message: TradeMessage) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    pushRealtime = null;
    service.listTradeMessages.mockResolvedValue([theirs, mine]);
    service.markTradeMessagesRead.mockResolvedValue(undefined);
    service.subscribeToTradeMessages.mockImplementation((_id: string, onInsert: (m: TradeMessage) => void) => {
      pushRealtime = onInsert;
      return vi.fn();
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  async function render() {
    await act(async () => {
      root.render(<TradeMessageThread tradeRequestId="req-1" currentUserId="shipper-1" counterpartLabel="지정 포워더" />);
    });
  }

  it('메시지를 오래된 순으로 보여주고, 상대 메시지를 읽음 처리한다', async () => {
    await render();
    const bubbles = container.querySelectorAll('.tm-bubble');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].textContent).toContain('지정 포워더');
    expect(bubbles[0].textContent).toContain('보완 요청');
    expect(bubbles[1].classList.contains('is-mine')).toBe(true);
    expect(bubbles[1].textContent).toContain('읽음');
    expect(service.markTradeMessagesRead).toHaveBeenCalledWith('req-1');
  });

  it('보내기를 누르면 서비스로 전송하고 목록에 붙인다', async () => {
    const sent: TradeMessage = { ...mine, id: 'msg-3', body: '내일 오전 선적 예정입니다.', readAt: null };
    service.sendTradeMessage.mockResolvedValue(sent);
    await render();

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, '내일 오전 선적 예정입니다.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const send = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('보내기')) as HTMLButtonElement;
    await act(async () => { send.click(); });

    expect(service.sendTradeMessage).toHaveBeenCalledWith('req-1', '내일 오전 선적 예정입니다.');
    expect(container.querySelectorAll('.tm-bubble')).toHaveLength(3);
    expect(textarea.value).toBe('');
  });

  it('실시간으로 들어온 상대 메시지를 붙이고 읽음 처리한다', async () => {
    await render();
    service.markTradeMessagesRead.mockClear();
    await act(async () => {
      pushRealtime?.({ ...theirs, id: 'msg-9', kind: 'message', body: '확인했습니다.' });
    });
    expect(container.querySelectorAll('.tm-bubble')).toHaveLength(3);
    expect(service.markTradeMessagesRead).toHaveBeenCalledWith('req-1');
  });

  it('같은 메시지가 전송 응답과 실시간으로 두 번 와도 한 번만 보여준다', async () => {
    await render();
    await act(async () => { pushRealtime?.(mine); });
    expect(container.querySelectorAll('.tm-bubble')).toHaveLength(2);
  });

  it('종료된 의뢰는 입력창 대신 안내만 보여준다', async () => {
    await act(async () => {
      root.render(<TradeMessageThread tradeRequestId="req-1" currentUserId="shipper-1" counterpartLabel="지정 포워더" readOnly />);
    });
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).toContain('종료된 의뢰입니다');
  });
});
