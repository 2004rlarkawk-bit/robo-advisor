import {
  Briefcase,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { AuthSessionUser } from '../../services/authService';
import type { UserProfile } from '../../services/profileService';
import type { AppMenu } from '../../services/workspaceSessionService';
import NotificationBell from '../NotificationBell';

interface AppHeaderProps {
  collapsed: boolean;
  user: AuthSessionUser;
  profile: UserProfile;
  /** 포워더 역할이면 헤더 색을 남색으로 바꿔 화주 화면과 즉시 구분되게 한다 */
  forwarderMode?: boolean;
  /** 알림 벨 폴링을 다시 트리거하는 값 (예: activeMenu 변경 시) */
  notificationPollKey?: unknown;
  onToggleSidebar: () => void;
  onNavigate: (menu: AppMenu) => void;
  onLogout: () => void;
}

export default function AppHeader({
  collapsed,
  user,
  profile,
  forwarderMode = false,
  notificationPollKey,
  onToggleSidebar,
  onNavigate,
  onLogout,
}: AppHeaderProps) {
  // 헤더 인사는 사람 이름(담당자명) 우선. 담당자명이 비어 있을 때만 회사명·이메일로 폴백.
  const userLabel = profile.contact_name?.trim() || profile.company_name?.trim() || user.email;
  const avatarLabel = userLabel.trim().charAt(0) || (user.type === 'member' ? '회' : '비');

  return (
    <header className={`header${forwarderMode ? ' header--forwarder' : ''}`}>
      <div className="header-title-sec">
        <button
          className="icon-btn sidebar-toggle"
          onClick={onToggleSidebar}
          title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
        >
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
        <span className="platform-badge">Mentoring Project 2026</span>
        {forwarderMode && (
          <span className="header-role-chip">
            <Briefcase size={13} /> 포워더 모드
          </span>
        )}
      </div>

      <div className="header-actions">
        <NotificationBell userId={user.id} pollKey={notificationPollKey} onNavigate={onNavigate} />
        <button
          className="icon-btn"
          type="button"
          onClick={() => onNavigate('guide')}
          title="사용 안내"
          aria-label="사용 안내 페이지로 이동"
        >
          <HelpCircle size={20} />
        </button>
        <div className="user-info-section">
          <button
            type="button"
            className="user-profile"
            onClick={() => onNavigate('profile')}
            title="프로필 관리"
            aria-label="프로필 관리 페이지로 이동"
          >
            <div className="user-avatar">{avatarLabel}</div>
            <span>{userLabel} 님</span>
          </button>
          <button className="btn-logout" onClick={onLogout}>로그아웃</button>
        </div>
      </div>
    </header>
  );
}
