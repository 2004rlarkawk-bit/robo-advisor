/** 화주 → 회원 포워더 내부 의뢰 요청(trade_requests) 서비스. */
import { supabase } from '../lib/supabase';
import type {
  ForwarderLookupResult,
  TradeRequest,
  TradeRequestPreview,
  TradeRequestStatus,
} from '../types/forwarderRequest';

interface TradeRequestRow {
  id: string;
  trade_id: string;
  requester_user_id: string;
  receiver_user_id: string;
  status: TradeRequestStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
}

function mapTradeRequestRow(row: TradeRequestRow): TradeRequest {
  return {
    id: row.id,
    tradeId: row.trade_id,
    requesterUserId: row.requester_user_id,
    receiverUserId: row.receiver_user_id,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    cancelledAt: row.cancelled_at,
  };
}

async function getRequiredUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');
  return userId;
}

/** 이메일로 등록된 포워더 계정을 검색한다. 화주 전용 계정·존재하지 않는 이메일이면 null.
 *  겸용(integrated) 계정은 본인 이메일도 검색된다 — 한 계정 시연에서 자기에게 의뢰하는 흐름용. */
export async function searchForwarderByEmail(email: string): Promise<ForwarderLookupResult | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabase.rpc('find_forwarder_by_email', { p_email: normalized });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.company_name ?? null,
    contactName: row.contact_name ?? null,
  };
}

/** 이미 보낸 pending 요청이 있는지 안내하기 위한 유니크 위반 코드. */
const UNIQUE_VIOLATION_CODE = '23505';

/** 회원 포워더에게 내부 의뢰 요청을 생성한다. */
export async function sendTradeRequest(
  tradeId: string,
  receiverUserId: string,
  message: string,
): Promise<TradeRequest> {
  const requesterUserId = await getRequiredUserId();
  const { data, error } = await supabase
    .from('trade_requests')
    .insert({
      trade_id: tradeId,
      requester_user_id: requesterUserId,
      receiver_user_id: receiverUserId,
      message: message.trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      throw new Error('이미 이 포워더에게 요청을 보냈습니다.');
    }
    throw error;
  }
  return mapTradeRequestRow(data as TradeRequestRow);
}

/** 화주 본인이 보낸 의뢰 요청 목록. tradeId를 주면 해당 거래로만 좁힌다. */
export async function listOutgoingTradeRequests(tradeId?: string): Promise<TradeRequest[]> {
  let query = supabase
    .from('trade_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (tradeId) query = query.eq('trade_id', tradeId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => mapTradeRequestRow(row as TradeRequestRow));
}

/** 포워더 본인이 받은 의뢰 요청 목록(수신함). */
export async function listIncomingTradeRequests(): Promise<TradeRequest[]> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from('trade_requests')
    .select('*')
    .eq('receiver_user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapTradeRequestRow(row as TradeRequestRow));
}

/** 수락 전 최소 정보 미리보기(RPC) — 화주의 전체 거래 데이터는 노출하지 않는다. */
export async function getTradeRequestPreview(requestId: string): Promise<TradeRequestPreview | null> {
  const { data, error } = await supabase.rpc('get_trade_request_preview', { p_request_id: requestId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    requestId: row.request_id,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    requesterCompany: row.requester_company,
    requesterContact: row.requester_contact,
    direction: row.direction,
    loadPort: row.load_port,
    dischargePort: row.discharge_port,
    itemName: row.item_name,
  };
}

/** 포워더가 요청을 수락 — RPC가 trades.forwarder_user_id 배정까지 원자적으로 처리한다. */
export async function acceptTradeRequest(requestId: string): Promise<TradeRequest> {
  const { data, error } = await supabase.rpc('accept_trade_request', { p_request_id: requestId });
  if (error) throw error;
  return mapTradeRequestRow(data as TradeRequestRow);
}

/** 포워더가 요청을 거절. */
export async function rejectTradeRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('trade_requests')
    .update({ status: 'rejected', rejected_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
}

/** 화주가 자신이 보낸 pending 요청을 취소. */
export async function cancelTradeRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('trade_requests')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
}
