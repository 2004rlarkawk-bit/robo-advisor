// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationRecord } from '../types/forwarderRequest';

const service = vi.hoisted(() => ({
  countUnreadNotifications: vi.fn(),
  listNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  notificationBelongsToRole: vi.fn(() => true),
  subscribeToNotifications: vi.fn(),
}));

vi.mock('../services/notificationService', () => service);

import NotificationBell from './NotificationBell';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const received: NotificationRecord = {
  id: 'notification-1',
  recipientUserId: 'forwarder-1',
  type: 'trade_request_received',
  tradeRequestId: 'request-1',
  tradeId: 'trade-1',
  payload: { requester_company: '인천테크', item_name: '무선 이어폰' },
  readAt: null,
  createdAt: '2026-09-15T06:20:00.000Z',
};

describe('NotificationBell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    service.listNotifications.mockResolvedValue([received]);
    service.countUnreadNotifications.mockResolvedValue(1);
    service.markNotificationRead.mockResolvedValue(undefined);
    service.markAllNotificationsRead.mockResolvedValue(undefined);
    service.subscribeToNotifications.mockReturnValue(vi.fn());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('읽지 않은 개수를 빨간 배지와 목록에 표시하고 알림 대상 화면으로 이동한다', async () => {
    const onNavigate = vi.fn();
    await act(async () => {
      root.render(<NotificationBell userId="forwarder-1" role="forwarder" onNavigate={onNavigate} />);
      await Promise.resolve();
    });
    expect(container.querySelector('.notif-badge')?.textContent).toBe('1');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.notif-bell-button')?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('새 포워딩 의뢰가 도착했습니다');
    expect(container.textContent).toContain('인천테크 · 무선 이어폰');
    expect(container.querySelector('.notif-unread-dot')).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('.notif-item')?.click());
    expect(service.markNotificationRead).toHaveBeenCalledWith('notification-1');
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });

  it('실시간으로 들어온 새 업무는 토스트와 배지로 즉시 알린다', async () => {
    service.listNotifications.mockResolvedValue([]);
    service.countUnreadNotifications.mockResolvedValue(0);
    let onInsert: ((notification: NotificationRecord) => void) | undefined;
    service.subscribeToNotifications.mockImplementation((_userId, callback) => {
      onInsert = callback;
      return vi.fn();
    });

    await act(async () => {
      root.render(<NotificationBell userId="forwarder-1" role="forwarder" onNavigate={vi.fn()} />);
      await Promise.resolve();
    });
    act(() => onInsert?.(received));

    expect(container.querySelector('.notif-toast')).not.toBeNull();
    expect(container.querySelector('.notif-badge')?.textContent).toBe('1');
    expect(container.textContent).toContain('새 포워딩 의뢰가 도착했습니다');
  });

  it('화주의 수락·완료 알림은 새 포워더 의뢰 메뉴로 이동한다', async () => {
    const onNavigate = vi.fn();
    service.listNotifications.mockResolvedValue([{ ...received, type: 'trade_request_accepted' }]);
    await act(async () => {
      root.render(<NotificationBell userId="shipper-1" role="shipper" onNavigate={onNavigate} />);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.notif-bell-button')?.click();
      await Promise.resolve();
    });
    act(() => container.querySelector<HTMLButtonElement>('.notif-item')?.click());
    expect(onNavigate).toHaveBeenCalledWith('requests');
  });

  it('모두 읽음은 현재 역할 알림만 처리한다', async () => {
    await act(async () => {
      root.render(<NotificationBell userId="forwarder-1" role="forwarder" onNavigate={vi.fn()} />);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.notif-bell-button')?.click();
      await Promise.resolve();
    });
    act(() => container.querySelector<HTMLButtonElement>('.notif-read-all')?.click());
    expect(service.markAllNotificationsRead).toHaveBeenCalledWith('forwarder');
    expect(container.querySelector('.notif-badge')).toBeNull();
  });

  it('알 수 없는 이전 알림 형식도 빈 카드 대신 기본 안내를 표시한다', async () => {
    service.listNotifications.mockResolvedValue([{ ...received, type: 'legacy_event' }]);
    await act(async () => {
      root.render(<NotificationBell userId="forwarder-1" role="forwarder" onNavigate={vi.fn()} />);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.notif-bell-button')?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('새 업무 알림이 도착했습니다');
    expect(container.textContent).toContain('인천테크 · 무선 이어폰');
  });
});
