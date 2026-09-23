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
  getOwnForwarderAccount,
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
  it('본인 의뢰도 같은 trade_requests에 저장한다', async () => {
    const query = insertQuery();
    query.single.mockResolvedValue({ data: {
      id: 'self-request', trade_id: 'trade-1', requester_user_id: 'shipper-1',
      receiver_user_id: 'shipper-1', status: 'pending',
    }, error: null });
    const result = await sendTradeRequest('trade-1', 'shipper-1', '의뢰합니다.');
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      requester_user_id: 'shipper-1', receiver_user_id: 'shipper-1', trade_id: 'trade-1',
    }));
    expect(result.receiverUserId).toBe(result.requesterUserId);
  });

  it('과거 DB의 본인 의뢰 금지는 성공으로 숨기지 않고 설정 필요를 안내한다', async () => {
    const query = insertQuery();
    query.single.mockResolvedValue({ data: null, error: { code: '23514', message: 'trade_requests_requester_receiver_diff' } });
    await expect(sendTradeRequest('trade-1', 'shipper-1', '')).rejects.toThrow('본인 의뢰 허용 설정');
  });
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
  it.each(['integrated', null])('이메일 없이 본인 계정을 선택한다: %s', async role => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: { service_role: role, company_name: 'ABC' }, error: null });
    fromMock.mockReturnValue(query);
    await expect(getOwnForwarderAccount()).resolves.toEqual({ id: 'shipper-1', companyName: 'ABC', contactName: null });
    expect(query.eq).toHaveBeenCalledWith('id', 'shipper-1');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('화주 전용 계정의 본인 선택은 역할 설정을 안내한다', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: { service_role: 'shipper' }, error: null });
    fromMock.mockReturnValue(query);
    await expect(getOwnForwarderAccount()).rejects.toThrow('서비스 역할');
  });
  it('통합 계정의 본인 로그인 이메일은 검색 RPC 없이 본인 프로필로 찾는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'shipper-1', email: 'Owner@Example.com' } }, error: null });
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: { id: 'shipper-1', service_role: 'integrated', company_name: 'ABC', contact_name: 'Kim' }, error: null });
    fromMock.mockReturnValue(query);
    await expect(searchForwarderByEmail(' owner@example.com ')).resolves.toEqual({ id: 'shipper-1', companyName: 'ABC', contactName: 'Kim' });
    expect(query.eq).toHaveBeenCalledWith('id', 'shipper-1');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('화주 전용 계정은 본인 이메일로 포워더 검색 결과를 만들지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'shipper-1', email: 'owner@example.com' } }, error: null });
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: { service_role: 'shipper' }, error: null });
    fromMock.mockReturnValue(query);
    await expect(searchForwarderByEmail('owner@example.com')).resolves.toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });
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
        is_partner_forwarder: true, partner_company_name: 'ABC Logistics',
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
      isPartner: true, partnerCompanyName: 'ABC Logistics',
    }]);
  });

  it('후보가 없으면 빈 목록, RPC 오류는 그대로 던진다', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(matchForwarderForTrade('trade-1', [])).resolves.toEqual([]);
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'not owned' } });
    await expect(matchForwarderForTrade('trade-1', [])).rejects.toEqual({ message: 'not owned' });
  });
});
