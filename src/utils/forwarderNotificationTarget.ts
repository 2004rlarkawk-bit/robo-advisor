/**
 * 포워더가 알림을 눌렀을 때 어디를 열지 정한다. 메뉴 이동(업무함)만으로는 어떤 건인지 알 수 없어,
 * 알림 종류별로 "열 거래 + 열 탭"을 정한다.
 *
 * 수입은 업무 상세를 바로 연다. 수출은 포워더가 의뢰를 자기 폼으로 가져와 작업하는 구조라
 * 건별 상세 화면이 없다 — 수출 작업실(의뢰 수신함이 있는 화면)로만 보낸다.
 *
 * 새 의뢰(trade_request_received)는 대상에 넣지 않는다 — 아직 수락 전이라 trades.forwarder_user_id가
 * 비어 있고, 업무 큐(listForwarderCases)는 배정된 건만 보여주므로 절대 찾을 수 없다. 받은 의뢰
 * 목록(IncomingTradeRequestsPanel)이 같은 알림을 자체 구독해 이미 스스로 새로고침한다.
 */
import type { NotificationRecord } from '../types/forwarderRequest';

export type ForwarderNotificationTab = 'review' | 'messages';

export interface ForwarderNotificationTarget {
  tradeId: string;
  tab: ForwarderNotificationTab;
  /** 알림만으로 알 수 있는 방향. null이면 거래에서 조회해야 한다. */
  direction: 'import' | 'export' | null;
}

export function resolveForwarderNotificationTarget(notification: NotificationRecord): ForwarderNotificationTarget | null {
  if (!notification.tradeId) return null;
  const payloadDirection = notification.payload.direction;
  const direction = payloadDirection === 'import' || payloadDirection === 'export' ? payloadDirection : null;

  switch (notification.type) {
    case 'trade_message_received':
      return { tradeId: notification.tradeId, tab: 'messages', direction };
    // 보완 요청·회신은 수입 검토 흐름에만 있다.
    case 'trade_return_replied':
      return { tradeId: notification.tradeId, tab: 'messages', direction: 'import' };
    default:
      return null;
  }
}
