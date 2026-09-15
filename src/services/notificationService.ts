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
  ],
  forwarder: [
    'trade_request_received',
    'trade_return_replied',
  ],
};

export function notificationBelongsToRole(type: NotificationType, role: WorkspaceRole): boolean {
  return ROLE_NOTIFICATION_TYPES[role].includes(type);
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
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });
  if (role) query = query.in('type', ROLE_NOTIFICATION_TYPES[role]);
  const { data, error } = await query.limit(limit);
  if (error) throw error;
  return (data || []).map((row) => mapNotificationRow(row as NotificationRow));
}

/** 읽지 않은 알림 수 — 사이드바 배지·헤더 알림 벨에 쓴다. */
export async function countUnreadNotifications(role?: WorkspaceRole): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    let query = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    if (role) query = query.in('type', ROLE_NOTIFICATION_TYPES[role]);
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
  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (role) query = query.in('type', ROLE_NOTIFICATION_TYPES[role]);
  const { error } = await query;
  if (error) throw error;
}

/** 현재 사용자의 새 알림을 실시간으로 받는다. 연결 실패 시 호출부의 주기 조회가 대체한다. */
export function subscribeToNotifications(
  userId: string,
  onInsert: (notification: NotificationRecord) => void,
): () => void {
  if (!isSupabaseConfigured) return () => undefined;
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
      (payload) => onInsert(mapNotificationRow(payload.new as NotificationRow)),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
