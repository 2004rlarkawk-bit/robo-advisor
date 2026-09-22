import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: vi.fn() }, storage: { from: vi.fn() } },
}));

import { fetchTradeDirection } from './storageService';

beforeEach(() => { vi.clearAllMocks(); });

function query(result: { data: unknown; error: unknown }) {
  const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue(result);
  fromMock.mockReturnValue(q);
  return q;
}

describe('fetchTradeDirection', () => {
  it('소유자 조건 없이(RLS에 맡기고) direction만 조회한다', async () => {
    const q = query({ data: { direction: 'export' }, error: null });
    await expect(fetchTradeDirection('trade-1')).resolves.toBe('export');
    expect(fromMock).toHaveBeenCalledWith('trades');
    expect(q.select).toHaveBeenCalledWith('direction');
    expect(q.eq).toHaveBeenCalledWith('id', 'trade-1');
    expect(q.eq).toHaveBeenCalledTimes(1);
  });

  it('행이 없거나(RLS 차단 포함) 값이 이상하면 null', async () => {
    query({ data: null, error: null });
    await expect(fetchTradeDirection('trade-1')).resolves.toBeNull();
    query({ data: { direction: 'sideways' }, error: null });
    await expect(fetchTradeDirection('trade-1')).resolves.toBeNull();
  });

  it('오류는 그대로 던진다', async () => {
    query({ data: null, error: { message: 'boom' } });
    await expect(fetchTradeDirection('trade-1')).rejects.toEqual({ message: 'boom' });
  });
});
