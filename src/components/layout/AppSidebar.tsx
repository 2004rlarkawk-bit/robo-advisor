import {
  Anchor,
  BarChart3,
  BookOpen,
  FileCheck2,
  FolderKanban,
  LayoutDashboard,
  PhoneCall,
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
}

export default function AppSidebar({ activeMenu, collapsed, onNavigate }: AppSidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="logo-section">
        <div className="logo-icon">🚢</div>
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
              onClick={() => onNavigate(menu)}
            >
              <Icon size={18} />
              {label}
            </div>
          </li>
        ))}
      </ul>

      <div className="support-card">
        <div className="support-title">
          <PhoneCall size={14} />
          고객지원센터
        </div>
        <div className="support-phone">02-1234-5678</div>
        <div className="support-time">평일 09:00 - 18:00</div>
      </div>
    </aside>
  );
}
