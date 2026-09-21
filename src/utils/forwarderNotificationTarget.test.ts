import { describe, expect, it } from 'vitest';
import type { NotificationRecord, NotificationType } from '../types/forwarderRequest';
import { resolveForwarderNotificationTarget } from './forwarderNotificationTarget';

const notification = (type: NotificationType, overrides: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id: 'n-1', recipientUserId: 'fwd-1', type, tradeRequestId: 'req-1', tradeId: 'trade-1',
  payload: {}, readAt: null, createdAt: '2026-09-21T00:00:00.000Z', ...overrides,
});

describe('resolveForwarderNotificationTarget', () => {
  it('새 의뢰는 서류 검토 탭으로, payload의 방향을 그대로 쓴다', () => {
    expect(resolveForwarderNotificationTarget(notification('trade_request_received', { payload: { direction: 'import' } })))
      .toEqual({ tradeId: 'trade-1', tab: 'review', direction: 'import' });
    expect(resolveForwarderNotificationTarget(notification('trade_request_received', { payload: { direction: 'export' } })))
      .toEqual({ tradeId: 'trade-1', tab: 'review', direction: 'export' });
  });

  it('payload가 비어 있는 예전 알림은 방향을 null로 두어 조회하게 한다', () => {
    expect(resolveForwarderNotificationTarget(notification('trade_request_received'))?.direction).toBeNull();
    expect(resolveForwarderNotificationTarget(notification('trade_request_received', { payload: { direction: 'sideways' } }))?.direction).toBeNull();
  });

  it('새 메시지는 요청·회신 탭으로 — 메시지 알림 payload에는 방향이 없다', () => {
    expect(resolveForwarderNotificationTarget(notification('trade_message_received', { payload: { preview: '안녕하세요' } })))
      .toEqual({ tradeId: 'trade-1', tab: 'messages', direction: null });
  });

  it('보완 회신은 항상 수입 · 요청·회신 탭', () => {
    expect(resolveForwarderNotificationTarget(notification('trade_return_replied')))
      .toEqual({ tradeId: 'trade-1', tab: 'messages', direction: 'import' });
  });

  it('거래 id가 없거나 화주용 알림이면 열 대상이 없다', () => {
    expect(resolveForwarderNotificationTarget(notification('trade_request_received', { tradeId: null }))).toBeNull();
    expect(resolveForwarderNotificationTarget(notification('trade_request_accepted'))).toBeNull();
  });
});
