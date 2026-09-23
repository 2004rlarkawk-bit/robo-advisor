/** 알림(notifications) 조회 서비스 — 1차 구현은 폴링 기반(App.tsx의 countShipperReturnRequests와 동일한 패턴). */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { NotificationRecord, NotificationType } from '../types/forwarderRequest';
import type { WorkspaceRole } from '../utils/workspaceRole';

interface NotificationRow {
  id: string;
  recipient_user_id: string;
  type: NotificationType;
  trade_request_id: string | null;
  trade_id: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const ROLE_NOTIFICATION_TYPES: Record<WorkspaceRole, NotificationType[]> = {
  shipper: [
    'trade_request_accepted',
    'trade_request_rejected',
    'trade_return_requested',
    'trade_forwarder_completed',
    'trade_message_received',
  ],
  forwarder: [
    'trade_request_received',
    'trade_return_replied',
    'trade_message_received',
  ],
};

export function notificationBelongsToRole(type: NotificationType, role: WorkspaceRole, payload?: Record<string, unknown>): boolean {
  if (type === 'trade_message_received') return payload?.recipient_role === role;
  return ROLE_NOTIFICATION_TYPES[role].includes(type);
}

/** 사용자 입력 역할이 아니라 의뢰의 실제 참여 관계로 메시지 알림을 분리한다. */
async function messageRoleFilter(role: WorkspaceRole): Promise<string> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('로그인이 필요합니다.');
  const { data, error } = await supabase.from('trade_requests').select('id')
    .eq(role === 'shipper' ? 'requester_user_id' : 'receiver_user_id', auth.user.id);
  if (error) throw error;
  const ids = (data ?? []).map(row => row.id as string).filter(id => /^[0-9a-f-]{36}$/i.test(id));
  return ids.length ? `type.neq.trade_message_received,trade_request_id.in.(${ids.join(',')})` : 'type.neq.trade_message_received';
}

function mapNotificationRow(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    type: row.type,
    tradeRequestId: row.trade_request_id,
    tradeId: row.trade_id,
    payload: row.payload ?? {},
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** 최근 알림 목록(최신순). */
export async function listNotifications(limit = 20, role?: WorkspaceRole): Promise<NotificationRecord[]> {
  if (!isSupabaseConfigured) return [];
  const filter = role ? await messageRoleFilter(role) : null;
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });
  if (role) query = query.in('type', ROLE_NOTIFICATION_TYPES[role]);
  if (filter) query = query.or(filter);
  const { data, error } = await query.limit(limit);
  if (error) throw error;
  return (data || []).map((row) => mapNotificationRow(row as NotificationRow));
}

/** 읽지 않은 알림 수 — 사이드바 배지·헤더 알림 벨에 쓴다. */
export async function countUnreadNotifications(role?: WorkspaceRole): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    const filter = role ? await messageRoleFilter(role) : null;
    let query = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    if (role) query = query.in('type', ROLE_NOTIFICATION_TYPES[role]);
    if (filter) query = query.or(filter);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    console.warn('알림 수 조회 실패:', err);
    return 0;
  }
}

/** 알림 한 건을 읽음 처리. */
export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) throw error;
}

/** 모든 알림을 읽음 처리. */
export async function markAllNotificationsRead(role?: WorkspaceRole): Promise<void> {
  const filter = role ? await messageRoleFilter(role) : null;
  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (role) query = query.in('type', ROLE_NOTIFICATION_TYPES[role]);
  if (filter) query = query.or(filter);
  const { error } = await query;
  if (error) throw error;
}

/** 현재 사용자의 새 알림을 실시간으로 받는다. 연결 실패 시 호출부의 주기 조회가 대체한다. */
export function subscribeToNotifications(
  userId: string,
  onInsert: (notification: NotificationRecord) => void,
): () => void {
  if (!isSupabaseConfigured) return () => undefined;
  let active = true;
  const channel = supabase
    .channel(`notifications:${userId}:${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_user_id=eq.${userId}`,
      },
      (payload) => {
        const notification = mapNotificationRow(payload.new as NotificationRow);
        if (notification.type !== 'trade_message_received') {
          if (active) onInsert(notification);
          return;
        }
        // 과거 알림에도 역할 필드가 없으므로 DB의 의뢰 관계로 판별한다.
        void (async () => {
          const { data, error } = await supabase.from('trade_requests')
            .select('requester_user_id,receiver_user_id').eq('id', notification.tradeRequestId!).maybeSingle();
          if (error || !data || !active) return; // 다음 주기 조회에서 재시도
          const role = data.requester_user_id === userId ? 'shipper' : data.receiver_user_id === userId ? 'forwarder' : null;
          if (role) onInsert({ ...notification, payload: { ...notification.payload, recipient_role: role } });
        })().catch(() => undefined);
      },
    )
    .subscribe();
  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}
