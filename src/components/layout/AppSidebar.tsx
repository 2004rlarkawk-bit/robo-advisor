import {
  Anchor,
  BarChart3,
  BookOpen,
  FileCheck2,
  FolderKanban,
  LayoutDashboard,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { AppMenu } from '../../services/workspaceSessionService';

interface NavigationItem {
  menu: AppMenu;
  label: string;
  icon: LucideIcon;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { menu: 'about', label: '서비스 소개', icon: Anchor },
  { menu: 'dashboard', label: 'AI 통관 작업실', icon: LayoutDashboard },
  { menu: 'docs', label: '문서 관리', icon: FolderKanban },
  { menu: 'customs_history', label: '통관 내역', icon: FileCheck2 },
  { menu: 'analysis', label: '데이터 분석', icon: BarChart3 },
  { menu: 'profile', label: '프로필 관리', icon: UserRound },
  { menu: 'guide', label: '사용 안내', icon: BookOpen },
  { menu: 'settings', label: '설정', icon: Settings },
];

interface AppSidebarProps {
  activeMenu: AppMenu;
  collapsed: boolean;
  onNavigate: (menu: AppMenu) => void;
  /** 메뉴별 알림 수 — 0이면 표시하지 않는다 (예: 문서 관리의 포워더 보완 요청) */
  badges?: Partial<Record<AppMenu, number>>;
}

export default function AppSidebar({ activeMenu, collapsed, onNavigate, badges }: AppSidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* 로고 클릭 = 앱 새로고침. 시연 중 상태가 꼬였을 때 빠르게 초기화하는 용도. */}
      <div
        className="logo-section"
        role="button"
        tabIndex={0}
        title="PortAI 새로고침"
        onClick={() => window.location.reload()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            window.location.reload();
          }
        }}
      >
        <div className="logo-icon"><Anchor size={26} strokeWidth={1.6} /></div>
        <div>
          <div className="logo-text">PortAI</div>
          <div className="logo-sub">스마트 물류 & 통관 자동화 플랫폼</div>
        </div>
      </div>

      <ul className="menu-list">
        {NAVIGATION_ITEMS.map(({ menu, label, icon: Icon }) => (
          <li key={menu}>
            <div
              className={`menu-item ${activeMenu === menu ? 'active' : ''}`}
              role="button"
              aria-label={label}
              tabIndex={0}
              aria-current={activeMenu === menu ? 'page' : undefined}
              onClick={() => onNavigate(menu)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigate(menu); } }}
            >
              <Icon size={18} />
              <span className="menu-label">{label}</span>
              {(badges?.[menu] ?? 0) > 0 && <span className="menu-badge">{badges?.[menu]}</span>}
            </div>
          </li>
        ))}
      </ul>

      <button type="button" className="support-card support-guide" onClick={() => onNavigate('guide')}><BookOpen size={17} /><span>이용 가이드<small>업무 흐름과 기능 안내</small></span></button>
    </aside>
  );
}
