import type { TradeRole, TradeType } from '../types';

export const WORKSPACE_SESSION_KEY = 'portai_workspace_session_v1';

export type AppMenu =
  | 'about'
  | 'dashboard'
  | 'docs'
  | 'trades'
  | 'customs_history'
  | 'analysis'
  | 'profile'
  | 'guide'
  | 'settings';

export interface WorkspaceSessionState {
  userId: string;
  activeMenu: AppMenu;
  direction: TradeType;
  role: TradeRole;
  currentStep: number;
  selectedTradeId: string | null;
}

const MENUS = new Set<AppMenu>([
  'about',
  'dashboard',
  'docs',
  'trades',
  'customs_history',
  'analysis',
  'profile',
  'guide',
  'settings',
]);
const DIRECTIONS = new Set<TradeType>(['export', 'import']);
const ROLES = new Set<TradeRole>(['shipper', 'forwarder']);

export function defaultWorkspaceSession(userId: string): WorkspaceSessionState {
  return {
    userId,
    activeMenu: 'about',
    direction: 'export',
    role: 'shipper',
    currentStep: 1,
    selectedTradeId: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseWorkspaceSession(
  raw: string | null,
  userId: string,
): WorkspaceSessionState {
  if (!raw) return defaultWorkspaceSession(userId);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.userId !== userId) {
      return defaultWorkspaceSession(userId);
    }
    const activeMenu = MENUS.has(parsed.activeMenu as AppMenu)
      ? parsed.activeMenu as AppMenu
      : 'about';
    const direction = DIRECTIONS.has(parsed.direction as TradeType)
      ? parsed.direction as TradeType
      : 'export';
    const role = ROLES.has(parsed.role as TradeRole)
      ? parsed.role as TradeRole
      : 'shipper';
    const currentStep = typeof parsed.currentStep === 'number'
      && Number.isInteger(parsed.currentStep)
      && parsed.currentStep >= 1
      && parsed.currentStep <= 20
      ? parsed.currentStep
      : 1;
    const selectedTradeId = typeof parsed.selectedTradeId === 'string'
      && parsed.selectedTradeId.trim()
      ? parsed.selectedTradeId
      : null;
    return {
      userId,
      activeMenu,
      direction,
      role,
      currentStep,
      selectedTradeId,
    };
  } catch {
    return defaultWorkspaceSession(userId);
  }
}

export function loadWorkspaceSession(userId: string): WorkspaceSessionState {
  return parseWorkspaceSession(sessionStorage.getItem(WORKSPACE_SESSION_KEY), userId);
}

export function saveWorkspaceSession(state: WorkspaceSessionState): void {
  sessionStorage.setItem(WORKSPACE_SESSION_KEY, JSON.stringify(state));
}

export function clearWorkspaceSession(): void {
  sessionStorage.removeItem(WORKSPACE_SESSION_KEY);
}
