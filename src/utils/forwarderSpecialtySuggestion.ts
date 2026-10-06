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

/** 한 나라만 쓰는 노선은 여기서 바로 정한다. */
const ROUTE_BY_COUNTRY: Record<string, ForwarderSpecialtyKey> = { CN: 'route_cn', US: 'route_us', JP: 'route_jp', VN: 'route_vn' };

/**
 * 여러 나라를 묶는 노선. 위에서부터 찾아 처음 걸리는 것을 쓴다.
 * 베트남은 동남아지만 물량이 많아 따로 두므로 ROUTE_BY_COUNTRY가 먼저 잡는다.
 */
const ROUTE_BY_REGION: { key: ForwarderSpecialtyKey; countries: Set<string> }[] = [
  { key: 'route_eu', countries: new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    'GB', 'NO', 'CH',
  ]) },
  { key: 'route_twhk', countries: new Set(['TW', 'HK', 'MO']) },
  { key: 'route_sea', countries: new Set(['TH', 'ID', 'MY', 'SG', 'PH', 'MM', 'KH', 'LA', 'BN']) },
  { key: 'route_in', countries: new Set(['IN', 'PK', 'BD', 'LK', 'NP']) },
  { key: 'route_me', countries: new Set(['AE', 'SA', 'QA', 'KW', 'OM', 'BH', 'IQ', 'IR', 'JO', 'IL', 'TR', 'EG']) },
  { key: 'route_cis', countries: new Set(['RU', 'KZ', 'UZ', 'BY', 'KG', 'TJ', 'TM', 'AZ', 'GE', 'AM']) },
  { key: 'route_latam', countries: new Set(['BR', 'MX', 'CL', 'PE', 'AR', 'CO', 'EC', 'UY', 'PA', 'CR', 'GT']) },
];

function routeForCountry(country: string): ForwarderSpecialtyKey | undefined {
  return ROUTE_BY_COUNTRY[country] ?? ROUTE_BY_REGION.find((region) => region.countries.has(country))?.key;
}

/** 육류·수산물·낙농품은 류(HS 2자리)만으로 온도 관리 화물로 본다. */
const COLD_CHAPTERS_ALWAYS = new Set(['02', '03', '04']);
/** 채소·과일은 신선·냉장·냉동 단서가 품명에 있을 때만. 건조 과일 등은 상온 화물이다. */
const COLD_CHAPTERS_WITH_KEYWORD = new Set(['07', '08']);
const COLD_KEYWORD = /frozen|chilled|refrigerat|fresh|냉동|냉장|신선/i;
const DG_KEYWORD = /lithium|battery|배터리|flammable|인화성|dangerous goods|위험물|\bUN\s?\d{4}\b/i;
const AIR_KEYWORD = /airport|공항/i;

/** HS 류(앞 2자리) → 품목 조건. 원료·중간재처럼 어느 쪽에도 딱 맞지 않는 류는 넣지 않는다. */
const GOODS_BY_CHAPTER: Record<string, ForwarderSpecialtyKey> = {};
const GOODS_CHAPTER_NAME: Record<string, string> = {};
function goodsChapters(key: ForwarderSpecialtyKey, chapters: Record<string, string>) {
  for (const [chapter, name] of Object.entries(chapters)) {
    GOODS_BY_CHAPTER[chapter] = key;
    GOODS_CHAPTER_NAME[chapter] = name;
  }
}
goodsChapters('goods_food', Object.fromEntries(
  Array.from({ length: 24 }, (_, index) => [String(index + 1).padStart(2, '0'), '식품·농수산물']),
));
goodsChapters('goods_chemical', {
  28: '무기화학품', 29: '유기화학품', 30: '의약품', 32: '염료·도료', 33: '화장품·향료', 34: '세제·비누', 38: '화학제품',
});
goodsChapters('goods_apparel', {
  50: '견직물', 51: '모직물', 52: '면직물', 54: '합성 필라멘트', 55: '합성 단섬유', 56: '부직포', 58: '특수 직물',
  60: '편물', 61: '편물제 의류', 62: '직물제 의류', 63: '섬유제품', 64: '신발', 65: '모자',
});
goodsChapters('goods_electronics', { 84: '기계', 85: '전기·전자기기', 90: '광학·측정기기' });
goodsChapters('goods_consumer', {
  42: '가죽제품·가방', 44: '목제품', 46: '짚·버들 제품', 48: '종이제품', 69: '도자기', 70: '유리제품',
  71: '귀금속·장신구', 91: '시계', 92: '악기', 94: '가구·조명', 95: '완구·운동용품', 96: '생활 잡화',
});
/** 가죽 의류(4203)는 42류지만 의류로 본다. */
const LEATHER_APPAREL_HEADING = '4203';

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
  const routeKey = country ? routeForCountry(country) : undefined;
  if (routeKey && counterpartPort) suggestions.push({ key: routeKey, reason: `${portRole} ${counterpartPort}` });

  if (profile.loadingMode === 'LCL') suggestions.push({ key: 'cargo_lcl', reason: '적재 방식 LCL' });
  if (profile.loadingMode === 'FCL') suggestions.push({ key: 'cargo_fcl', reason: '적재 방식 FCL' });

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

  if (hsDigits.startsWith(LEATHER_APPAREL_HEADING)) {
    suggestions.push({ key: 'goods_apparel', reason: `HS ${LEATHER_APPAREL_HEADING} · 가죽 의류` });
  } else if (GOODS_BY_CHAPTER[chapter]) {
    suggestions.push({ key: GOODS_BY_CHAPTER[chapter], reason: `HS ${chapter}류 · ${GOODS_CHAPTER_NAME[chapter]}` });
  }

  return suggestions;
}

/** 서류 검증에서 남은 오류·경고 수 — 많으면 처리 경험이 많은 담당자를 우선한다. */
export function countTradeReviewIssues(trade: Pick<SavedTrade, 'issues'>): number {
  return (trade.issues ?? []).filter((issue) => issue.severity === 'error' || issue.severity === 'warning').length;
}

/** 이 건수 이상이면 "까다로운 건"으로 보고 경험을 우선한다. */
export const EXPERIENCE_PRIORITY_ISSUE_THRESHOLD = 2;
