import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, getUserMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  },
}));

import {
  acceptTradeRequest,
  matchForwarderForTrade,
  cancelTradeRequest,
  rejectTradeRequest,
  searchForwarderByEmail,
  sendTradeRequest,
} from './forwarderRequestService';

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'shipper-1' } }, error: null });
});

function insertQuery() {
  const query = { insert: vi.fn(), select: vi.fn(), single: vi.fn() };
  query.insert.mockReturnValue(query);
  query.select.mockReturnValue(query);
  fromMock.mockReturnValue(query);
  return query;
}

function updateQuery() {
  const query = { update: vi.fn(), eq: vi.fn() };
  query.update.mockReturnValue(query);
  query.eq.mockResolvedValue({ data: null, error: null });
  fromMock.mockReturnValue(query);
  return query;
}

describe('sendTradeRequest', () => {
  it('이미 보낸 pending 요청이 있으면 우호적인 에러 메시지를 던진다', async () => {
    const query = insertQuery();
    query.single.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });

    await expect(sendTradeRequest('trade-1', 'forwarder-1', '메시지')).rejects.toThrow(
      '이미 이 포워더에게 요청을 보냈습니다.',
    );
  });

  it('정상 생성 시 insert에 requester/receiver/trade_id를 담는다', async () => {
    const query = insertQuery();
    query.single.mockResolvedValue({
      data: {
        id: 'req-1',
        trade_id: 'trade-1',
        requester_user_id: 'shipper-1',
        receiver_user_id: 'forwarder-1',
        status: 'pending',
        message: '메시지',
        created_at: '2026-09-13T00:00:00.000Z',
        updated_at: '2026-09-13T00:00:00.000Z',
        accepted_at: null,
        rejected_at: null,
        cancelled_at: null,
      },
      error: null,
    });

    const result = await sendTradeRequest('trade-1', 'forwarder-1', '메시지');
    expect(query.insert).toHaveBeenCalledWith({
      trade_id: 'trade-1',
      requester_user_id: 'shipper-1',
      receiver_user_id: 'forwarder-1',
      message: '메시지',
    });
    expect(result.status).toBe('pending');
  });
});

describe('searchForwarderByEmail', () => {
  it('일치하는 포워더가 없으면 null을 반환한다', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const result = await searchForwarderByEmail('nobody@example.com');
    expect(result).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith('find_forwarder_by_email', { p_email: 'nobody@example.com' });
  });

  it('일치하는 포워더가 있으면 최소 필드만 반환한다', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'forwarder-1', company_name: 'ABC Logistics', contact_name: '홍길동', service_role: 'forwarder' }],
      error: null,
    });
    const result = await searchForwarderByEmail('Forwarder@Example.com');
    expect(result).toEqual({ id: 'forwarder-1', companyName: 'ABC Logistics', contactName: '홍길동' });
  });
});

describe('acceptTradeRequest', () => {
  it('accept_trade_request RPC를 요청 id와 함께 호출한다', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'req-1',
        trade_id: 'trade-1',
        requester_user_id: 'shipper-1',
        receiver_user_id: 'forwarder-1',
        status: 'accepted',
        message: null,
        created_at: '2026-09-13T00:00:00.000Z',
        updated_at: '2026-09-13T00:00:00.000Z',
        accepted_at: '2026-09-13T01:00:00.000Z',
        rejected_at: null,
        cancelled_at: null,
      },
      error: null,
    });

    const result = await acceptTradeRequest('req-1');
    expect(rpcMock).toHaveBeenCalledWith('accept_trade_request', { p_request_id: 'req-1' });
    expect(result.status).toBe('accepted');
  });
});

describe('rejectTradeRequest / cancelTradeRequest', () => {
  it('reject는 status/rejected_at 외 필드를 건드리지 않는다', async () => {
    const query = updateQuery();
    await rejectTradeRequest('req-1');
    const payload = query.update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['rejected_at', 'status']);
    expect(payload.status).toBe('rejected');
  });

  it('cancel은 status/cancelled_at 외 필드를 건드리지 않는다', async () => {
    const query = updateQuery();
    await cancelTradeRequest('req-1');
    const payload = query.update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['cancelled_at', 'status']);
    expect(payload.status).toBe('cancelled');
  });
});

describe('matchForwarderForTrade', () => {
  it('조건·난이도 우선 여부를 RPC로 넘기고 후보를 카멜케이스로 매핑한다', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        id: 'fwd-1', company_name: 'PortAI Forwarding', contact_name: 'Kim',
        specialties: ['route_cn', 'cargo_cold'], matched_specialties: ['route_cn'],
        active_count: 2, completed_count: 14,
      }],
      error: null,
    });

    const result = await matchForwarderForTrade('trade-1', ['route_cn'], true);
    expect(rpcMock).toHaveBeenCalledWith('match_forwarder_for_trade', {
      p_trade_id: 'trade-1', p_specialties: ['route_cn'], p_prefer_experienced: true,
    });
    expect(result).toEqual([{
      id: 'fwd-1', companyName: 'PortAI Forwarding', contactName: 'Kim',
      specialties: ['route_cn', 'cargo_cold'], matchedSpecialties: ['route_cn'],
      activeCount: 2, completedCount: 14,
    }]);
  });

  it('후보가 없으면 빈 목록, RPC 오류는 그대로 던진다', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(matchForwarderForTrade('trade-1', [])).resolves.toEqual([]);
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'not owned' } });
    await expect(matchForwarderForTrade('trade-1', [])).rejects.toEqual({ message: 'not owned' });
  });
});
