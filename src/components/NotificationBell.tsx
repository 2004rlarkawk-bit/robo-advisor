import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  MessageSquareReply,
  X,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NotificationRecord, NotificationType } from '../types/forwarderRequest';
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationBelongsToRole,
  subscribeToNotifications,
} from '../services/notificationService';
import type { AppMenu } from '../services/workspaceSessionService';
import type { WorkspaceRole } from '../utils/workspaceRole';
import '../styles/forwarderRequest.css';

interface Props {
  userId: string | null;
  role: WorkspaceRole;
  pollKey?: unknown;
  onNavigate: (menu: AppMenu) => void;
  onOpenNotification?: (notification: NotificationRecord, menu: AppMenu) => void;
}

interface NotificationPresentation {
  title: string;
  fallbackDetail: string;
  icon: LucideIcon;
  tone: 'info' | 'success' | 'danger' | 'warning';
}

const PRESENTATION: Record<NotificationType, NotificationPresentation> = {
  trade_request_received: {
    title: '새 포워딩 의뢰가 도착했습니다',
    fallbackDetail: '의뢰 내용을 확인하고 수락 여부를 결정해 주세요.',
    icon: ClipboardList,
    tone: 'info',
  },
  trade_request_accepted: {
    title: '포워더가 의뢰를 수락했습니다',
    fallbackDetail: '담당 포워더가 배정되었습니다.',
    icon: CheckCircle2,
    tone: 'success',
  },
  trade_request_rejected: {
    title: '포워더가 의뢰를 거절했습니다',
    fallbackDetail: '의뢰 상태를 확인해 주세요.',
    icon: XCircle,
    tone: 'danger',
  },
  trade_return_requested: {
    title: '서류 보완 요청이 도착했습니다',
    fallbackDetail: '요청 내용을 확인하고 수정 서류를 다시 제출해 주세요.',
    icon: FileWarning,
    tone: 'warning',
  },
  trade_return_replied: {
    title: '화주의 보완 회신이 도착했습니다',
    fallbackDetail: '수정 서류와 회신 내용을 다시 검토해 주세요.',
    icon: MessageSquareReply,
    tone: 'success',
  },
  trade_forwarder_completed: {
    title: '포워더가 서류 업무를 완료했습니다',
    fallbackDetail: '완료된 문서를 확인해 주세요.',
    icon: CheckCheck,
    tone: 'success',
  },
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return sameDay ? `오늘 ${time}` : `${date.getMonth() + 1}월 ${date.getDate()}일 ${time}`;
}

function payloadText(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function notificationDetail(notification: NotificationRecord): string {
  const presentation = PRESENTATION[notification.type];
  const company = payloadText(
    notification.payload,
    'requester_company',
    'forwarder_company',
    'shipper_company',
    'company_name',
  );
  const item = payloadText(notification.payload, 'item_name');
  const blNo = payloadText(notification.payload, 'bl_no');
  const summary = [company, item, blNo && `B/L ${blNo}`].filter(Boolean).join(' · ');
  return summary || presentation.fallbackDetail;
}

function notificationTarget(notification: NotificationRecord): AppMenu {
  switch (notification.type) {
    case 'trade_request_received': return 'dashboard';
    case 'trade_return_replied': return 'dashboard';
    case 'trade_request_accepted':
    case 'trade_request_rejected':
    case 'trade_return_requested':
    case 'trade_forwarder_completed':
      return 'docs';
  }
}

export default function NotificationBell({
  userId,
  role,
  pollKey,
  onNavigate,
  onOpenNotification,
}: Props) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [toast, setToast] = useState<NotificationRecord | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const hydratedRef = useRef(false);

  const refresh = useCallback(async (announceNew: boolean) => {
    if (!userId) return;
    try {
      const [items, count] = await Promise.all([
        listNotifications(30, role),
        countUnreadNotifications(role),
      ]);
      if (announceNew && hydratedRef.current) {
        const newest = items.find((item) => !item.readAt && !knownIdsRef.current.has(item.id));
        if (newest) setToast(newest);
      }
      knownIdsRef.current = new Set(items.map((item) => item.id));
      hydratedRef.current = true;
      setNotifications(items);
      setUnreadCount(count);
    } catch (error) {
      console.warn('알림 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [role, userId]);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      setNotifications([]);
      return;
    }
    hydratedRef.current = false;
    knownIdsRef.current = new Set();
    setLoading(true);
    void refresh(false);

    const unsubscribe = subscribeToNotifications(userId, (notification) => {
      if (!notificationBelongsToRole(notification.type, role)) return;
      if (knownIdsRef.current.has(notification.id)) return;
      knownIdsRef.current.add(notification.id);
      setNotifications((current) => [notification, ...current].slice(0, 30));
      if (!notification.readAt) setUnreadCount((count) => count + 1);
      setToast(notification);
    });
    const interval = window.setInterval(() => void refresh(true), 15_000);
    const handleFocus = () => void refresh(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh, role, userId]);

  useEffect(() => {
    if (userId && pollKey !== undefined) void refresh(true);
  }, [pollKey, refresh, userId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 6_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    setToast(null);
    if (next) {
      setLoading(true);
      void refresh(false);
    }
  };

  const handleItemClick = (notification: NotificationRecord) => {
    setOpen(false);
    if (!notification.readAt) {
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, readAt } : item
      )));
      setUnreadCount((count) => Math.max(0, count - 1));
      void markNotificationRead(notification.id).catch(() => void refresh(false));
    }
    const target = notificationTarget(notification);
    if (onOpenNotification) onOpenNotification(notification, target);
    else onNavigate(target);
  };

  const handleMarkAllRead = () => {
    if (unreadCount === 0) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    setUnreadCount(0);
    void markAllNotificationsRead(role).catch(() => void refresh(false));
  };

  if (!userId) return null;

  const toastPresentation = toast ? PRESENTATION[toast.type] : null;
  const ToastIcon = toastPresentation?.icon;

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button
        className={`icon-btn notif-bell-button${unreadCount > 0 ? ' has-unread' : ''}`}
        type="button"
        aria-label={unreadCount > 0 ? `알림, 읽지 않음 ${unreadCount}개` : '알림'}
        aria-expanded={open}
        onClick={handleToggle}
      >
        <Bell size={20} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {toast && toastPresentation && ToastIcon && !open && (
        <div className="notif-toast" role="status">
          <button type="button" className="notif-toast-main" onClick={() => handleItemClick(toast)}>
            <span className={`notif-type-icon is-${toastPresentation.tone}`}><ToastIcon size={17} /></span>
            <span className="notif-toast-copy">
              <strong>{toastPresentation.title}</strong>
              <span>{notificationDetail(toast)}</span>
            </span>
          </button>
          <button
            type="button"
            className="notif-toast-close"
            aria-label="알림 닫기"
            onClick={() => setToast(null)}
          ><X size={15} /></button>
        </div>
      )}

      {open && (
        <section className="notif-dropdown" aria-label="알림 목록">
          <div className="notif-dropdown-head">
            <div>
              <strong>알림</strong>
              {unreadCount > 0 && <span className="notif-unread-summary">읽지 않음 {unreadCount}</span>}
            </div>
            {unreadCount > 0 && (
              <button type="button" className="notif-read-all" onClick={handleMarkAllRead}>
                <CheckCheck size={14} /> 모두 읽음
              </button>
            )}
          </div>
          <div className="notif-list">
            {loading && notifications.length === 0 ? (
              <div className="notif-empty">알림을 불러오는 중…</div>
            ) : notifications.length === 0 ? (
              <div className="notif-empty">
                <Bell size={22} />
                <strong>도착한 알림이 없습니다</strong>
                <span>새로운 업무 소식이 여기에 표시됩니다.</span>
              </div>
            ) : (
              notifications.map((notification) => {
                const presentation = PRESENTATION[notification.type];
                const Icon = presentation.icon;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    className={`notif-item${notification.readAt ? '' : ' unread'}`}
                    onClick={() => handleItemClick(notification)}
                  >
                    <span className={`notif-type-icon is-${presentation.tone}`}><Icon size={16} /></span>
                    <span className="notif-item-copy">
                      <span className="notif-item-title">
                        {!notification.readAt && <span className="notif-unread-dot" aria-label="읽지 않음" />}
                        {presentation.title}
                      </span>
                      <span className="notif-item-detail">{notificationDetail(notification)}</span>
                      <span className="notif-item-time">{formatTime(notification.createdAt)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
