/** 알림(notifications) 조회 서비스 — 1차 구현은 폴링 기반(App.tsx의 countShipperReturnRequests와 동일한 패턴). */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { NotificationRecord, NotificationType } from '../types/forwarderRequest';

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
export async function listNotifications(limit = 20): Promise<NotificationRecord[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) => mapNotificationRow(row as NotificationRow));
}

/** 읽지 않은 알림 수 — 사이드바 배지·헤더 알림 벨에 쓴다. */
export async function countUnreadNotifications(): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
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
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw error;
}
