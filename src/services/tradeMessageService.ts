/**
 * 의뢰별 대화 스레드(trade_messages) 서비스.
 *
 * 스레드는 거래가 아니라 의뢰(trade_request) 단위다. 같은 거래라도 포워더가 다르면 방이 다르다.
 * 기존 보완 요청(workflow_data.forwarderCase.returnRequest)은 건드리지 않고, 화면에서만 합쳐 보여준다.
 */
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { TradeMessage, TradeMessageKind } from '../types/forwarderRequest';

interface TradeMessageRow {
  id: string;
  trade_request_id: string;
  trade_id: string;
  sender_user_id: string;
  sender_role?: 'shipper' | 'forwarder' | null;
  kind: TradeMessageKind;
  body: string;
  created_at: string;
  read_at: string | null;
}

export const TRADE_MESSAGE_MAX_LENGTH = 4000;

export function mapTradeMessageRow(row: TradeMessageRow): TradeMessage {
  return {
    id: row.id,
    tradeRequestId: row.trade_request_id,
    tradeId: row.trade_id,
    senderUserId: row.sender_user_id,
    ...(row.sender_role !== undefined ? { senderRole: row.sender_role } : {}),
    kind: row.kind,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

async function getRequiredUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');
  return userId;
}

/** 한 의뢰의 대화 전체(오래된 순). RLS가 참여자가 아닌 사용자에게는 빈 목록을 돌려준다. */
export async function listTradeMessages(tradeRequestId: string): Promise<TradeMessage[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('trade_messages')
    .select('*')
    .eq('trade_request_id', tradeRequestId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => mapTradeMessageRow(row as TradeMessageRow));
}

/**
 * 메시지 전송. trade_id는 서버 트리거가 의뢰에서 채우므로 보내지 않는다.
 * 거절·취소된 의뢰에는 RLS가 insert를 막는다 — 그 경우 사용자에게 읽히는 문구로 바꿔 던진다.
 */
export async function sendTradeMessage(
  tradeRequestId: string,
  body: string,
  kind: TradeMessageKind = 'message',
  senderRole?: 'shipper' | 'forwarder',
): Promise<TradeMessage> {
  const text = body.trim();
  if (!text) throw new Error('메시지 내용을 입력해 주세요.');
  if (text.length > TRADE_MESSAGE_MAX_LENGTH) {
    throw new Error(`메시지는 ${TRADE_MESSAGE_MAX_LENGTH.toLocaleString()}자까지 보낼 수 있습니다.`);
  }
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from('trade_messages')
    .insert({ trade_request_id: tradeRequestId, sender_user_id: userId, kind, body: text, ...(senderRole ? { sender_role: senderRole } : {}) })
    .select()
    .single();
  if (error) {
    // 42501 = RLS 위반. 종료된 의뢰이거나 참여자가 아닌 경우다.
    if (error.code === '42501') throw new Error('종료된 의뢰이거나 대화 권한이 없어 메시지를 보낼 수 없습니다.');
    throw error;
  }
  return mapTradeMessageRow(data as TradeMessageRow);
}

/** 상대가 보낸 안 읽은 메시지를 모두 읽음 처리한다. 내가 보낸 것은 RLS가 막으므로 조건에서도 뺀다. */
export async function markTradeMessagesRead(tradeRequestId: string, role?: 'shipper' | 'forwarder'): Promise<void> {
  if (!isSupabaseConfigured) return;
  const userId = await getRequiredUserId();
  let query = supabase
    .from('trade_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('trade_request_id', tradeRequestId);
  query = role ? query.or(`sender_role.eq.${role === 'shipper' ? 'forwarder' : 'shipper'},and(sender_role.is.null,sender_user_id.neq.${userId})`) : query.neq('sender_user_id', userId);
  const { error } = await query.is('read_at', null);
  if (error) throw error;
}

/** 의뢰별 안 읽은 메시지 수 — 목록 화면 배지용. 내가 보낸 메시지는 세지 않는다. */
export async function listUnreadTradeMessageCounts(role?: 'shipper' | 'forwarder'): Promise<Record<string, number>> {
  if (!isSupabaseConfigured) return {};
  const userId = await getRequiredUserId();
  let query = supabase
    .from('trade_messages')
    .select('trade_request_id');
  if (role) {
    const { data: requests, error: requestError } = await supabase.from('trade_requests').select('id')
      .eq(role === 'shipper' ? 'requester_user_id' : 'receiver_user_id', userId);
    if (requestError) throw requestError;
    if (!requests?.length) return {};
    query = query.in('trade_request_id', requests.map(request => request.id))
      .or(`sender_role.eq.${role === 'shipper' ? 'forwarder' : 'shipper'},and(sender_role.is.null,sender_user_id.neq.${userId})`);
  } else query = query.neq('sender_user_id', userId);
  const { data, error } = await query.is('read_at', null);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data || []) as Array<{ trade_request_id: string }>) {
    counts[row.trade_request_id] = (counts[row.trade_request_id] ?? 0) + 1;
  }
  return counts;
}

/** 한 스레드의 새 메시지를 실시간으로 받는다. 연결이 안 되면 호출부의 새로고침이 대체한다. */
export function subscribeToTradeMessages(
  tradeRequestId: string,
  onInsert: (message: TradeMessage) => void,
  onUpdate?: (message: TradeMessage) => void,
): () => void {
  if (!isSupabaseConfigured) return () => undefined;
  const channel = supabase
    .channel(`trade_messages:${tradeRequestId}:${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'trade_messages',
        filter: `trade_request_id=eq.${tradeRequestId}`,
      },
      (payload) => onInsert(mapTradeMessageRow(payload.new as TradeMessageRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'trade_messages', filter: `trade_request_id=eq.${tradeRequestId}` },
      (payload) => onUpdate?.(mapTradeMessageRow(payload.new as TradeMessageRow)),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
