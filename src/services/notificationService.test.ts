import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } },
  isSupabaseConfigured: true,
}));

import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationBelongsToRole,
} from './notificationService';

beforeEach(() => {
  vi.clearAllMocks();
});

function mockRequests() {
  const request = { select: vi.fn(), eq: vi.fn().mockResolvedValue({ data: [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }], error: null }) };
  request.select.mockReturnValue(request);
  fromMock.mockReturnValueOnce(request);
  return request;
}

describe('listNotifications', () => {
  it('최신순으로 limit개까지 조회한다', async () => {
    const query = { select: vi.fn(), order: vi.fn(), limit: vi.fn() };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [], error: null });
    fromMock.mockReturnValue(query);

    await listNotifications(5);
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(5);
  });

  it('현재 역할에 필요한 알림 유형만 조회한다', async () => {
    const request = mockRequests();
    const query = { select: vi.fn(), order: vi.fn(), in: vi.fn(), or: vi.fn(), limit: vi.fn() };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.or.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [], error: null });
    fromMock.mockReturnValue(query);

    await listNotifications(20, 'forwarder');
    expect(query.in).toHaveBeenCalledWith('type', ['trade_request_received', 'trade_return_replied', 'trade_message_received']);
    expect(request.eq).toHaveBeenCalledWith('receiver_user_id', 'user-1');
    expect(query.or).toHaveBeenCalledWith('type.neq.trade_message_received,and(trade_request_id.in.(aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa),or(payload->>recipient_role.eq.forwarder,payload->>recipient_role.is.null))');
  });
});

describe('countUnreadNotifications', () => {
  it('현재 역할의 의뢰가 없으면 채팅 알림을 세지 않는다', async () => {
    const request = mockRequests();
    request.eq.mockResolvedValue({ data: [], error: null });
    const query = { select: vi.fn(), is: vi.fn(), in: vi.fn(), or: vi.fn() };
    query.select.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.or.mockResolvedValue({ count: 0, error: null });
    fromMock.mockReturnValue(query);
    expect(await countUnreadNotifications('shipper')).toBe(0);
    expect(query.or).toHaveBeenCalledWith('type.neq.trade_message_received');
  });

  it('의뢰 관계 조회 실패 시 다른 역할 알림을 읽음 처리하지 않는다', async () => {
    const request = mockRequests();
    request.eq.mockResolvedValue({ data: null, error: new Error('관계 조회 실패') });
    await expect(markAllNotificationsRead('forwarder')).rejects.toThrow('관계 조회 실패');
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('trade_requests');
  });
  it('read_at이 null인 행의 개수를 반환한다', async () => {
    const query = { select: vi.fn(), is: vi.fn() };
    query.select.mockReturnValue(query);
    query.is.mockResolvedValue({ count: 3, error: null });
    fromMock.mockReturnValue(query);

    const result = await countUnreadNotifications();
    expect(result).toBe(3);
    expect(query.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(query.is).toHaveBeenCalledWith('read_at', null);
  });

  it('조회 실패 시 0을 반환한다(알림 오류가 화면 전체를 막지 않도록)', async () => {
    const query = { select: vi.fn(), is: vi.fn() };
    query.select.mockReturnValue(query);
    query.is.mockResolvedValue({ count: null, error: new Error('boom') });
    fromMock.mockReturnValue(query);

    const result = await countUnreadNotifications();
    expect(result).toBe(0);
  });
});

describe('markNotificationRead', () => {
  it('아직 읽지 않은 알림만 대상으로 read_at을 갱신한다', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), is: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.is.mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue(query);

    await markNotificationRead('notif-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'notif-1');
    expect(query.is).toHaveBeenCalledWith('read_at', null);
  });
});

describe('role notification policy', () => {
  it('화주와 포워더 알림을 서로 섞지 않는다', () => {
    expect(notificationBelongsToRole('trade_return_requested', 'shipper')).toBe(true);
    expect(notificationBelongsToRole('trade_return_requested', 'forwarder')).toBe(false);
    expect(notificationBelongsToRole('trade_return_replied', 'forwarder')).toBe(true);
    expect(notificationBelongsToRole('trade_message_received', 'shipper', { recipient_role: 'forwarder' })).toBe(false);
    expect(notificationBelongsToRole('trade_message_received', 'forwarder', { recipient_role: 'forwarder' })).toBe(true);
    expect(notificationBelongsToRole('trade_message_received', 'shipper')).toBe(false);
  });

  it('모두 읽음은 현재 역할의 알림만 갱신한다', async () => {
    const request = mockRequests();
    const query = { update: vi.fn(), is: vi.fn(), in: vi.fn(), or: vi.fn() };
    query.update.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.or.mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue(query);

    await markAllNotificationsRead('shipper');
    expect(request.eq).toHaveBeenCalledWith('requester_user_id', 'user-1');
    expect(query.or).toHaveBeenCalledWith('type.neq.trade_message_received,and(trade_request_id.in.(aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa),or(payload->>recipient_role.eq.shipper,payload->>recipient_role.is.null))');
    expect(query.in).toHaveBeenCalledWith('type', [
      'trade_request_accepted',
      'trade_request_rejected',
      'trade_return_requested',
      'trade_forwarder_completed',
      'trade_message_received',
    ]);
  });
});
