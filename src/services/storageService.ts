/**
 * localStorage 기반 저장 서비스
 * 
 * 거래 프로필, 생성 문서, 이력 등을 localStorage에 저장합니다.
 * 추후 백엔드 DB 연동 시 이 인터페이스만 교체하면 됩니다.
 */
/*수정했습니다
*/
import type { SavedTrade, TradeProfile, DocumentStatus, GeneratedDocuments, ValidationIssue } from '../types';

const STORAGE_KEY = 'portai_saved_trades';
const SETTINGS_KEY = 'portai_settings';

// ===== 거래 이력 저장/조회 =====

export function getSavedTrades(): SavedTrade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTrade(
  profile: TradeProfile,
  documents: DocumentStatus[],
  issues: ValidationIssue[],
  generatedDocs?: GeneratedDocuments
): SavedTrade {
  const trades = getSavedTrades();
  const now = new Date().toISOString();
  
  const newTrade: SavedTrade = {
    id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    profile,
    documents,
    generatedDocs,
    issues,
    createdAt: now,
    updatedAt: now,
  };

  trades.unshift(newTrade); // 최신순 정렬

  // 최대 50건까지만 보관
  if (trades.length > 50) {
    trades.splice(50);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  return newTrade;
}

export function deleteTrade(id: string): void {
  const trades = getSavedTrades().filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
}

export function clearAllTrades(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ===== 설정 저장 =====

export interface AppSettings {
  userName: string;
  companyName: string;
  companyAddress: string;
  claudeApiKey: string;
  useLLM: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  userName: '',
  companyName: '',
  companyAddress: '',
  claudeApiKey: '',
  useLLM: false,
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const current = getSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  
  // API 키가 변경되면 claudeService에도 동기화
  if (settings.claudeApiKey !== undefined) {
    localStorage.setItem('portai_claude_api_key', settings.claudeApiKey);
  }
}

// ===== 통계 조회 (데이터 분석 탭용) =====

export interface TradeAnalytics {
  totalTrades: number;
  exportCount: number;
  importCount: number;
  issuesByType: Record<string, number>;
  tradesByMonth: { month: string; count: number }[];
  completionRate: number;
}

export function getAnalytics(): TradeAnalytics {
  const trades = getSavedTrades();
  
  const issuesByType: Record<string, number> = {};
  let totalCompleted = 0;
  let totalDocs = 0;
  const monthMap: Record<string, number> = {};

  for (const trade of trades) {
    // 이슈 유형 카운트
    for (const issue of trade.issues) {
      const key = issue.field;
      issuesByType[key] = (issuesByType[key] || 0) + 1;
    }
    
    // 문서 완료율
    for (const doc of trade.documents) {
      totalDocs++;
      if (doc.status === 'completed') totalCompleted++;
    }

    // 월별 거래 수
    const month = trade.createdAt.substring(0, 7); // "2026-07"
    monthMap[month] = (monthMap[month] || 0) + 1;
  }

  const tradesByMonth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return {
    totalTrades: trades.length,
    exportCount: trades.filter(t => t.profile.tradeType === 'export').length,
    importCount: trades.filter(t => t.profile.tradeType === 'import').length,
    issuesByType,
    tradesByMonth,
    completionRate: totalDocs > 0 ? Math.round((totalCompleted / totalDocs) * 100) : 0,
  };
}
