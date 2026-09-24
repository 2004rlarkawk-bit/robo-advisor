import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, getUserMock, channelMock, removeChannelMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  channelMock: vi.fn(),
  removeChannelMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
    channel: channelMock,
    removeChannel: removeChannelMock,
  },
}));

import {
  listTradeMessages,
  listUnreadTradeMessageCounts,
  markTradeMessagesRead,
  sendTradeMessage,
  subscribeToTradeMessages,
  TRADE_MESSAGE_MAX_LENGTH,
} from './tradeMessageService';

const row = {
  id: 'msg-1',
  trade_request_id: 'req-1',
  trade_id: 'trade-1',
  sender_user_id: 'shipper-1',
  kind: 'message',
  body: '선적 일정 확인 부탁드립니다.',
  created_at: '2026-09-21T01:00:00.000Z',
  read_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'shipper-1' } }, error: null });
});

function selectQuery(result: { data: unknown; error: unknown }) {
  const query = { select: vi.fn(), eq: vi.fn(), neq: vi.fn(), is: vi.fn(), order: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.is.mockResolvedValue(result);
  query.order.mockResolvedValue(result);
  fromMock.mockReturnValue(query);
  return query;
}

describe('listTradeMessages', () => {
  it('의뢰 id로 오래된 순 조회하고 카멜케이스로 매핑한다', async () => {
    const query = selectQuery({ data: [row], error: null });
    const list = await listTradeMessages('req-1');
    expect(fromMock).toHaveBeenCalledWith('trade_messages');
    expect(query.eq).toHaveBeenCalledWith('trade_request_id', 'req-1');
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(list).toEqual([{
      id: 'msg-1', tradeRequestId: 'req-1', tradeId: 'trade-1', senderUserId: 'shipper-1',
      kind: 'message', body: '선적 일정 확인 부탁드립니다.', createdAt: '2026-09-21T01:00:00.000Z', readAt: null,
    }]);
  });
});

describe('sendTradeMessage', () => {
  function insertQuery(result: { data: unknown; error: unknown }) {
    const query = { insert: vi.fn(), select: vi.fn(), single: vi.fn() };
    query.insert.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.single.mockResolvedValue(result);
    fromMock.mockReturnValue(query);
    return query;
  }

  it('본문을 다듬어 보낸 사람 id와 함께 넣고, trade_id는 보내지 않는다', async () => {
    const query = insertQuery({ data: row, error: null });
    const sent = await sendTradeMessage('req-1', '  선적 일정 확인 부탁드립니다.  ');
    expect(query.insert).toHaveBeenCalledWith({
      trade_request_id: 'req-1', sender_user_id: 'shipper-1', kind: 'message', body: '선적 일정 확인 부탁드립니다.',
    });
    expect(query.insert.mock.calls[0][0]).not.toHaveProperty('trade_id');
    expect(sent.id).toBe('msg-1');
  });

  it('빈 본문·길이 초과는 서버에 보내지 않는다', async () => {
    await expect(sendTradeMessage('req-1', '   ')).rejects.toThrow('메시지 내용을 입력해 주세요.');
    await expect(sendTradeMessage('req-1', 'a'.repeat(TRADE_MESSAGE_MAX_LENGTH + 1))).rejects.toThrow('까지 보낼 수 있습니다');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('통합 계정의 실제 발신 역할을 저장한다', async () => {
    const query = insertQuery({ data: { ...row, sender_role: 'forwarder' }, error: null });
    const message = await sendTradeMessage('req-1', '확인했습니다.', 'message', 'forwarder');
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ sender_role: 'forwarder', sender_user_id: 'shipper-1' }));
    expect(message.senderRole).toBe('forwarder');
  });

  it('RLS 위반(종료된 의뢰)은 사용자에게 읽히는 문구로 바꾼다', async () => {
    insertQuery({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } });
    await expect(sendTradeMessage('req-1', '안녕하세요')).rejects.toThrow('종료된 의뢰이거나 대화 권한이 없어');
  });
});

describe('markTradeMessagesRead', () => {
  it('역할이 있으면 같은 계정도 반대 역할의 메시지만 읽는다', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), or: vi.fn(), is: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.or.mockReturnValue(query);
    query.is.mockResolvedValue({ error: null });
    fromMock.mockReturnValue(query);
    await markTradeMessagesRead('req-1', 'forwarder');
    expect(query.or).toHaveBeenCalledWith('sender_role.eq.shipper,and(sender_role.is.null,sender_user_id.neq.shipper-1)');
  });
  it('상대가 보낸 안 읽은 메시지만 읽음 처리한다', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), neq: vi.fn(), is: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.neq.mockReturnValue(query);
    query.is.mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue(query);

    await markTradeMessagesRead('req-1');
    expect(query.update).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(query.eq).toHaveBeenCalledWith('trade_request_id', 'req-1');
    expect(query.neq).toHaveBeenCalledWith('sender_user_id', 'shipper-1');
    expect(query.is).toHaveBeenCalledWith('read_at', null);
  });
});

describe('listUnreadTradeMessageCounts', () => {
  it('의뢰별로 안 읽은 수를 센다', async () => {
    selectQuery({ data: [
      { trade_request_id: 'req-1' }, { trade_request_id: 'req-1' }, { trade_request_id: 'req-2' },
    ], error: null });
    await expect(listUnreadTradeMessageCounts()).resolves.toEqual({ 'req-1': 2, 'req-2': 1 });
  });
});

describe('subscribeToTradeMessages', () => {
  it('의뢰 id로 필터한 INSERT 구독을 열고, 해제 시 채널을 지운다', () => {
    const channel = { on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    channelMock.mockReturnValue(channel);
    const onInsert = vi.fn();
    const onUpdate = vi.fn();

    const unsubscribe = subscribeToTradeMessages('req-1', onInsert, onUpdate);
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', table: 'trade_messages', filter: 'trade_request_id=eq.req-1' }),
      expect.any(Function),
    );
    const handler = channel.on.mock.calls[0][2] as (payload: { new: unknown }) => void;
    handler({ new: row });
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-1', tradeRequestId: 'req-1' }));
    expect(channel.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({ event: 'UPDATE', filter: 'trade_request_id=eq.req-1' }), expect.any(Function));
    const updateHandler = channel.on.mock.calls[1][2] as (payload: { new: unknown }) => void;
    updateHandler({ new: { ...row, read_at: '2026-09-23T00:00:00Z' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ readAt: '2026-09-23T00:00:00Z' }));

    unsubscribe();
    expect(removeChannelMock).toHaveBeenCalledWith(channel);
  });
});
