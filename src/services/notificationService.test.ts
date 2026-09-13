import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: fromMock },
  isSupabaseConfigured: true,
}));

import { countUnreadNotifications, listNotifications, markNotificationRead } from './notificationService';

beforeEach(() => {
  vi.clearAllMocks();
});

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
});

describe('countUnreadNotifications', () => {
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
