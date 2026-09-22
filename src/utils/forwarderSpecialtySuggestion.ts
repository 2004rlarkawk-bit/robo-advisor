/**
 * 거래 내용에서 "이 거래에 필요한 담당자 조건"을 뽑아내는 규칙.
 *
 * 화주가 분야를 둘러보며 고르는 디렉터리 방식이 아니라, 시스템이 거래(항로·HS부호·적재 방식)에서
 * 조건을 먼저 뽑고 근거를 함께 보여준다. 화주는 확인만 하고 필요하면 바꾼다.
 * 위험물처럼 잘못 짚으면 곤란한 조건은 품명에 명시적 단서가 있을 때만 제안한다.
 */
import type { SavedTrade } from '../types';
import { portCountryCode } from '../services/portLocodeService';
import type { ForwarderSpecialtyKey } from './forwarderSpecialty';

export interface SpecialtySuggestion {
  key: ForwarderSpecialtyKey;
  /** 왜 이 조건을 골랐는지 — 화주에게 그대로 보여준다. */
  reason: string;
}

const ROUTE_BY_COUNTRY: Record<string, ForwarderSpecialtyKey> = { CN: 'route_cn', US: 'route_us', JP: 'route_jp', VN: 'route_vn' };
const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

/** 육류·수산물·낙농품은 류(HS 2자리)만으로 온도 관리 화물로 본다. */
const COLD_CHAPTERS_ALWAYS = new Set(['02', '03', '04']);
/** 채소·과일은 신선·냉장·냉동 단서가 품명에 있을 때만. 건조 과일 등은 상온 화물이다. */
const COLD_CHAPTERS_WITH_KEYWORD = new Set(['07', '08']);
const COLD_KEYWORD = /frozen|chilled|refrigerat|fresh|냉동|냉장|신선/i;
const DG_KEYWORD = /lithium|battery|배터리|flammable|인화성|dangerous goods|위험물|\bUN\s?\d{4}\b/i;
const AIR_KEYWORD = /airport|공항/i;

type CountryResolver = (port: string | undefined) => string | null;

/**
 * 거래에서 담당자 조건을 제안한다. 수출이면 도착항, 수입이면 선적항이 상대국이다.
 * countryOf는 테스트에서 항구 사전 없이 검증하려고 주입 가능하게 뒀다.
 */
export function suggestSpecialtiesForTrade(
  trade: Pick<SavedTrade, 'profile' | 'tradeDirection'>,
  countryOf: CountryResolver = portCountryCode,
): SpecialtySuggestion[] {
  const profile = trade.profile;
  const direction = trade.tradeDirection ?? profile.tradeType;
  const suggestions: SpecialtySuggestion[] = [];

  const counterpartPort = direction === 'import' ? profile.loadPort : profile.dischargePort;
  const portRole = direction === 'import' ? '선적항' : '도착항';
  const country = countryOf(counterpartPort);
  const routeKey = country ? ROUTE_BY_COUNTRY[country] ?? (EU_COUNTRIES.has(country) ? 'route_eu' : undefined) : undefined;
  if (routeKey && counterpartPort) suggestions.push({ key: routeKey, reason: `${portRole} ${counterpartPort}` });

  if (profile.loadingMode === 'LCL') suggestions.push({ key: 'cargo_lcl', reason: '적재 방식 LCL' });

  const itemName = String(profile.itemName ?? '');
  const hsDigits = String(profile.hsCode ?? '').replace(/\D/g, '');
  const chapter = hsDigits.length >= 2 ? hsDigits.slice(0, 2) : '';
  const coldKeyword = itemName.match(COLD_KEYWORD)?.[0];
  if (COLD_CHAPTERS_ALWAYS.has(chapter)) {
    suggestions.push({ key: 'cargo_cold', reason: `HS ${chapter}류 · 온도 관리 품목` });
  } else if (coldKeyword && (COLD_CHAPTERS_WITH_KEYWORD.has(chapter) || !chapter)) {
    suggestions.push({ key: 'cargo_cold', reason: `품명에 "${coldKeyword}"` });
  }

  const dgKeyword = itemName.match(DG_KEYWORD)?.[0];
  if (dgKeyword) suggestions.push({ key: 'cargo_dg', reason: `품명에 "${dgKeyword}"` });

  const airPort = [profile.loadPort, profile.dischargePort].find((port) => port && AIR_KEYWORD.test(port));
  if (airPort) suggestions.push({ key: 'cargo_air', reason: `${airPort}` });

  return suggestions;
}

/** 서류 검증에서 남은 오류·경고 수 — 많으면 처리 경험이 많은 담당자를 우선한다. */
export function countTradeReviewIssues(trade: Pick<SavedTrade, 'issues'>): number {
  return (trade.issues ?? []).filter((issue) => issue.severity === 'error' || issue.severity === 'warning').length;
}

/** 이 건수 이상이면 "까다로운 건"으로 보고 경험을 우선한다. */
export const EXPERIENCE_PRIORITY_ISSUE_THRESHOLD = 2;
