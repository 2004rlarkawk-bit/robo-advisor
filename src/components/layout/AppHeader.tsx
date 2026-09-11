import {
  Bell,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { AuthSessionUser } from '../../services/authService';
import type { UserProfile } from '../../services/profileService';
import type { AppMenu } from '../../services/workspaceSessionService';

interface AppHeaderProps {
  collapsed: boolean;
  user: AuthSessionUser;
  profile: UserProfile;
  onToggleSidebar: () => void;
  onNavigate: (menu: AppMenu) => void;
  onLogout: () => void;
}

export default function AppHeader({
  collapsed,
  user,
  profile,
  onToggleSidebar,
  onNavigate,
  onLogout,
}: AppHeaderProps) {
  const userLabel = profile.company_name || profile.contact_name || user.email;
  const avatarLabel = userLabel.trim().charAt(0) || (user.type === 'member' ? '회' : '비');

  return (
    <header className="header">
      <div className="header-title-sec">
        <button
          className="icon-btn sidebar-toggle"
          onClick={onToggleSidebar}
          title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
        >
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
        <span className="platform-badge">Mentoring Project 2026</span>
      </div>

      <div className="header-actions">
        <button className="icon-btn" type="button" aria-label="알림">
          <Bell size={20} />
          <span className="badge-dot" />
        </button>
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
