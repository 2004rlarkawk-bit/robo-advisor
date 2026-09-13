import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import type { NotificationRecord, NotificationType } from '../types/forwarderRequest';
import { countUnreadNotifications, listNotifications, markNotificationRead } from '../services/notificationService';
import type { AppMenu } from '../services/workspaceSessionService';
import '../styles/forwarderRequest.css';

interface Props {
  /** 로그인 사용자가 없으면 폴링/렌더링을 하지 않는다. */
  userId: string | null;
  /** 폴링을 다시 트리거하는 값 — App.tsx에서 activeMenu 변경 시 새로 카운트하도록 넘긴다. */
  pollKey?: unknown;
  onNavigate: (menu: AppMenu) => void;
}

const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  trade_request_received: '새로운 포워딩 의뢰 요청이 도착했습니다.',
  trade_request_accepted: '포워더가 의뢰 요청을 수락했습니다.',
  trade_request_rejected: '포워더가 의뢰 요청을 거절했습니다.',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function NotificationBell({ userId, pollKey, onNavigate }: Props) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    void countUnreadNotifications().then((count) => {
      if (!cancelled) setUnreadCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, pollKey]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && userId) {
      void listNotifications().then(setNotifications);
    }
  };

  const handleItemClick = (notification: NotificationRecord) => {
    setOpen(false);
    if (!notification.readAt) {
      void markNotificationRead(notification.id).then(() => {
        setUnreadCount((count) => Math.max(0, count - 1));
      });
    }
    onNavigate('requests');
  };

  if (!userId) return null;

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button className="icon-btn" type="button" aria-label="알림" onClick={handleToggle}>
        <Bell size={20} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-head">알림</div>
          {notifications.length === 0 ? (
            <div className="notif-empty">새 알림이 없습니다.</div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`notif-item${notification.readAt ? '' : ' unread'}`}
                onClick={() => handleItemClick(notification)}
              >
                {NOTIFICATION_LABEL[notification.type]}
                <span className="notif-item-time">{formatTime(notification.createdAt)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
