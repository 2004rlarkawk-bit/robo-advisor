import {
  Anchor,
  BarChart3,
  BookOpen,
  FileCheck2,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  PhoneCall,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { AppMenu } from '../../services/workspaceSessionService';
import type { WorkspaceRole } from '../../utils/workspaceRole';

interface NavigationItem {
  menu: AppMenu;
  label: string;
  icon: LucideIcon;
}

// 역할별 메뉴 — 화주는 신고 준비·이력·분석 중심, 포워더는 의뢰 큐 중심.
// 같은 menu 키라도 역할에 따라 라벨이 다르다 (dashboard: 작업실 ↔ 업무 큐).
const SHIPPER_ITEMS: NavigationItem[] = [
  { menu: 'about', label: '서비스 소개', icon: Anchor },
  { menu: 'dashboard', label: 'AI 통관 작업실', icon: LayoutDashboard },
  { menu: 'docs', label: '문서 관리', icon: FolderKanban },
  { menu: 'customs_history', label: '통관 내역', icon: FileCheck2 },
  { menu: 'analysis', label: '데이터 분석', icon: BarChart3 },
  { menu: 'profile', label: '프로필 관리', icon: UserRound },
  { menu: 'guide', label: '사용 안내', icon: BookOpen },
];

const FORWARDER_ITEMS: NavigationItem[] = [
  { menu: 'about', label: '서비스 소개', icon: Anchor },
  { menu: 'dashboard', label: '포워더 업무함', icon: Inbox },
  { menu: 'docs', label: '문서 관리', icon: FolderKanban },
  { menu: 'profile', label: '프로필 관리', icon: UserRound },
  { menu: 'guide', label: '사용 안내', icon: BookOpen },
];

export function navigationItemsForRole(role: WorkspaceRole): NavigationItem[] {
  return role === 'forwarder' ? FORWARDER_ITEMS : SHIPPER_ITEMS;
}

interface AppSidebarProps {
  activeMenu: AppMenu;
  collapsed: boolean;
  /** 현재 워크스페이스 역할 — 메뉴 구성이 달라진다 */
  role: WorkspaceRole;
  /** 로고 클릭 시 실행 — 현재 작업 중인 화면을 첫 화면(빈 입력 폼)으로 되돌린다. */
  onLogoClick: () => void;
  onNavigate: (menu: AppMenu) => void;
  /** 메뉴별 알림 수 — 0이면 표시하지 않는다 (예: 문서 관리의 포워더 보완 요청) */
  badges?: Partial<Record<AppMenu, number>>;
}

export default function AppSidebar({ activeMenu, collapsed, role, onNavigate, onLogoClick, badges }: AppSidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* 로고 클릭 = 작업실 첫 화면으로 이동. 새로고침(F5)은 진행 중 작업을 이어보여주지만
          로고는 시연 중 상태가 꼬였을 때 빈 입력 폼으로 빠르게 되돌리는 용도라 별개로 둔다. */}
      <div
        className="logo-section"
        role="button"
        tabIndex={0}
        title="PortAI 첫 화면으로"
        onClick={onLogoClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onLogoClick();
          }
        }}
      >
        <div className="logo-icon">🚢</div>
        <div>
          <div className="logo-text">PortAI</div>
          <div className="logo-sub">스마트 물류 & 통관 자동화 플랫폼</div>
        </div>
      </div>

      <ul className="menu-list">
        {navigationItemsForRole(role).map(({ menu, label, icon: Icon }) => (
          <li key={menu}>
            <div
              className={`menu-item ${activeMenu === menu ? 'active' : ''}`}
              onClick={() => onNavigate(menu)}
            >
              <Icon size={18} />
              {label}
              {(badges?.[menu] ?? 0) > 0 && <span className="menu-badge">{badges?.[menu]}</span>}
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
