import type { TariffRate } from './unipassService';
import type { ImportFtaCandidate } from '../types/importTrade';

/**
 * FTA 적용 가능성 사전 확인.
 *
 * 여기서 하는 일은 세 가지뿐이다.
 *  1. 원산지 국가와 우리나라 사이에 발효된 협정이 있는지
 *  2. 관세청 관세율 조회 결과에 그 협정의 세율 행이 있는지
 *  3. 그 세율이 기본세율보다 낮은지 (예상 절감액)
 *
 * 세번변경기준·부가가치기준 같은 원산지 결정기준 충족 여부는 판정하지 않는다.
 * 그건 원산지증명서와 생산 자료를 보고 관세사가 확정할 일이다.
 */

interface FtaAgreement {
  /** 관세청 세율구분코드 앞머리 (예: FUS1 → FUS) */
  code: string;
  name: string;
  /** 세율구분명에서 협정을 알아볼 때 쓰는 표현 — 코드 체계가 바뀌어도 이름으로 맞춘다 */
  nameKeywords: RegExp;
  /** 협정 상대국 (ftaCountryCode 기준) */
  countries: string[];
}

const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
const ASEAN = ['BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'VN'];
const EFTA = ['CH', 'NO', 'IS', 'LI'];
const CENTRAL_AMERICA = ['PA', 'CR', 'HN', 'SV', 'NI'];

/** 발효 순서와 무관하게, 양자협정을 먼저 두고 다자협정(아세안·RCEP)을 뒤에 둔다. */
export const FTA_AGREEMENTS: FtaAgreement[] = [
  { code: 'FUS', name: '한·미 FTA', nameKeywords: /미국|한[·ㆍ\-\s]*미/, countries: ['US'] },
  { code: 'FEU', name: '한·EU FTA', nameKeywords: /\bEU\b|유럽연합/, countries: EU },
  { code: 'FGB', name: '한·영 FTA', nameKeywords: /영국|\bUK\b/, countries: ['GB'] },
  { code: 'FCN', name: '한·중 FTA', nameKeywords: /중국|한[·ㆍ\-\s]*중(?!미)/, countries: ['CN'] },
  { code: 'FVN', name: '한·베트남 FTA', nameKeywords: /베트남/, countries: ['VN'] },
  { code: 'FIN', name: '한·인도 CEPA', nameKeywords: /인도(?!네시아)/, countries: ['IN'] },
  { code: 'FID', name: '한·인도네시아 CEPA', nameKeywords: /인도네시아/, countries: ['ID'] },
  { code: 'FPH', name: '한·필리핀 FTA', nameKeywords: /필리핀/, countries: ['PH'] },
  { code: 'FKH', name: '한·캄보디아 FTA', nameKeywords: /캄보디아/, countries: ['KH'] },
  { code: 'FSG', name: '한·싱가포르 FTA', nameKeywords: /싱가포르/, countries: ['SG'] },
  { code: 'FCL', name: '한·칠레 FTA', nameKeywords: /칠레/, countries: ['CL'] },
  { code: 'FPE', name: '한·페루 FTA', nameKeywords: /페루/, countries: ['PE'] },
  { code: 'FCO', name: '한·콜롬비아 FTA', nameKeywords: /콜롬비아/, countries: ['CO'] },
  { code: 'FCE', name: '한·중미 FTA', nameKeywords: /중미/, countries: CENTRAL_AMERICA },
  { code: 'FTR', name: '한·튀르키예 FTA', nameKeywords: /터키|튀르키예/, countries: ['TR'] },
  { code: 'FAU', name: '한·호주 FTA', nameKeywords: /호주/, countries: ['AU'] },
  { code: 'FNZ', name: '한·뉴질랜드 FTA', nameKeywords: /뉴질랜드/, countries: ['NZ'] },
  { code: 'FCA', name: '한·캐나다 FTA', nameKeywords: /캐나다/, countries: ['CA'] },
  { code: 'FIL', name: '한·이스라엘 FTA', nameKeywords: /이스라엘/, countries: ['IL'] },
  { code: 'FEF', name: '한·EFTA FTA', nameKeywords: /EFTA/, countries: EFTA },
  { code: 'FAS', name: '한·아세안 FTA', nameKeywords: /아세안|ASEAN/, countries: ASEAN },
  { code: 'FRC', name: 'RCEP', nameKeywords: /RCEP|역내포괄/, countries: [...ASEAN, 'CN', 'JP', 'AU', 'NZ'] },
];

const COUNTRY_PATTERNS: Array<[RegExp, string]> = [
  [/korea|한국|대한민국|\bkr\b/i, 'KR'],
  [/united states|u\.?s\.?a\.?|america|미국|\bus\b/i, 'US'],
  [/united kingdom|great britain|england|영국|\bgb\b|\buk\b/i, 'GB'],
  [/china|중국|\bcn\b/i, 'CN'], [/japan|일본|\bjp\b/i, 'JP'],
  [/viet ?nam|베트남|\bvn\b/i, 'VN'], [/thailand|태국|\bth\b/i, 'TH'],
  [/indonesia|인도네시아|\bid\b/i, 'ID'], [/india|인도|\bin\b/i, 'IN'],
  [/malaysia|말레이시아|\bmy\b/i, 'MY'], [/singapore|싱가포르|\bsg\b/i, 'SG'],
  [/philippines|필리핀|\bph\b/i, 'PH'], [/cambodia|캄보디아|\bkh\b/i, 'KH'],
  [/myanmar|burma|미얀마|\bmm\b/i, 'MM'], [/laos?|라오스|\bla\b/i, 'LA'], [/brunei|브루나이|\bbn\b/i, 'BN'],
  [/australia|호주|\bau\b/i, 'AU'], [/new zealand|뉴질랜드|\bnz\b/i, 'NZ'], [/canada|캐나다|\bca\b/i, 'CA'],
  [/chile|칠레|\bcl\b/i, 'CL'], [/peru|페루|\bpe\b/i, 'PE'], [/colombia|콜롬비아|\bco\b/i, 'CO'],
  [/t[uü]rk(ey|iye)|터키|튀르키예|\btr\b/i, 'TR'], [/israel|이스라엘|\bil\b/i, 'IL'],
  [/switzerland|스위스|\bch\b/i, 'CH'], [/norway|노르웨이|\bno\b/i, 'NO'], [/iceland|아이슬란드|\bis\b/i, 'IS'], [/liechtenstein|\bli\b/i, 'LI'],
  [/panama|파나마|\bpa\b/i, 'PA'], [/costa rica|코스타리카|\bcr\b/i, 'CR'], [/honduras|온두라스|\bhn\b/i, 'HN'],
  [/el salvador|엘살바도르|\bsv\b/i, 'SV'], [/nicaragua|니카라과|\bni\b/i, 'NI'],
  [/germany|독일|\bde\b/i, 'DE'], [/france|프랑스|\bfr\b/i, 'FR'], [/italy|이탈리아|\bit\b/i, 'IT'],
  [/spain|스페인|\bes\b/i, 'ES'], [/netherlands|holland|네덜란드|\bnl\b/i, 'NL'], [/belgium|벨기에|\bbe\b/i, 'BE'],
  [/austria|오스트리아|\bat\b/i, 'AT'], [/poland|폴란드|\bpl\b/i, 'PL'], [/sweden|스웨덴|\bse\b/i, 'SE'],
  [/denmark|덴마크|\bdk\b/i, 'DK'], [/finland|핀란드|\bfi\b/i, 'FI'], [/ireland|아일랜드|\bie\b/i, 'IE'],
  [/portugal|포르투갈|\bpt\b/i, 'PT'], [/greece|그리스|\bgr\b/i, 'GR'], [/czech|체코|\bcz\b/i, 'CZ'],
  [/hungary|헝가리|\bhu\b/i, 'HU'], [/romania|루마니아|\bro\b/i, 'RO'], [/bulgaria|불가리아|\bbg\b/i, 'BG'],
  [/croatia|크로아티아|\bhr\b/i, 'HR'], [/slovakia|슬로바키아|\bsk\b/i, 'SK'], [/slovenia|슬로베니아|\bsi\b/i, 'SI'],
  [/lithuania|리투아니아|\blt\b/i, 'LT'], [/latvia|라트비아|\blv\b/i, 'LV'], [/estonia|에스토니아|\bee\b/i, 'EE'],
  [/luxembourg|룩셈부르크|\blu\b/i, 'LU'], [/malta|몰타|\bmt\b/i, 'MT'], [/cyprus|키프로스|\bcy\b/i, 'CY'],
  [/taiwan|대만|\btw\b/i, 'TW'],
];

/** 서류의 국가 표기("U.S.A.", "미국", "US")를 ISO 코드로 — 모르는 표기는 빈 문자열 */
export function ftaCountryCode(value?: string): string {
  const text = (value ?? '').trim();
  if (!text) return '';
  for (const [pattern, code] of COUNTRY_PATTERNS) if (pattern.test(text)) return code;
  return '';
}

export function findAgreementsForOrigin(originCountry: string): FtaAgreement[] {
  const code = ftaCountryCode(originCountry);
  if (!code || code === 'KR') return [];
  return FTA_AGREEMENTS.filter((agreement) => agreement.countries.includes(code));
}

function isAgreementRate(rate: TariffRate, agreement: FtaAgreement): boolean {
  if (rate.typeCode.toUpperCase().startsWith(agreement.code)) return true;
  return /FTA|협정|CEPA|RCEP/i.test(rate.typeName) && agreement.nameKeywords.test(rate.typeName);
}

/** 관세율 조회 결과에서 원산지에 쓸 수 있는 협정세율 중 가장 낮은 것 */
export function pickFtaRate(rates: TariffRate[], agreements: FtaAgreement[]): { agreement: FtaAgreement; rate: TariffRate } | null {
  let best: { agreement: FtaAgreement; rate: TariffRate } | null = null;
  for (const agreement of agreements) {
    for (const rate of rates) {
      if (!isAgreementRate(rate, agreement)) continue;
      if (!best || rate.rate < best.rate.rate) best = { agreement, rate };
    }
  }
  return best;
}

export interface FtaItemLookup {
  hsCode: string;
  rates: TariffRate[];
  customsValue: number;
  basicDuty: number;
}

/** 품목별 관세율 조회 결과를 모아 FTA 후보(협정·세율·절감액)를 만든다. 적용 여부는 여기서 정하지 않는다. */
export function buildFtaCandidate(originCountry: string, destinationCountry: string, items: FtaItemLookup[]): ImportFtaCandidate {
  const notes: string[] = [];
  const destination = ftaCountryCode(destinationCountry);
  if (destination && destination !== 'KR') {
    return { agreements: [], agreement: null, rate: null, duty: null, savings: null, coverage: 'none', notes: ['수입국이 한국이 아니라 우리나라 FTA 세율을 확인하지 않습니다.'] };
  }
  const agreements = findAgreementsForOrigin(originCountry);
  if (agreements.length === 0) {
    return { agreements: [], agreement: null, rate: null, duty: null, savings: null, coverage: 'none', notes: [] };
  }

  const picks = items.map((item) => pickFtaRate(item.rates, agreements));
  const matched = picks.filter((pick): pick is NonNullable<typeof pick> => pick !== null);
  if (matched.length === 0) {
    notes.push(`${agreements.map((agreement) => agreement.name).join('·')} 협정은 있지만, 관세청 관세율 조회 결과에서 이 HSK의 협정세율 행을 찾지 못했습니다. 관세법령정보포털에서 세율을 확인하세요.`);
    return { agreements: agreements.map((agreement) => agreement.name), agreement: null, rate: null, duty: null, savings: null, coverage: 'none', notes };
  }
  if (matched.length < items.length) {
    notes.push('일부 품목에만 협정세율이 있어, 협정세율이 없는 품목은 기본세율로 두고 계산했습니다.');
  }

  let ftaDuty = 0;
  let totalValue = 0;
  let weightedRate = 0;
  items.forEach((item, index) => {
    const pick = picks[index];
    const duty = pick ? Math.round(item.customsValue * pick.rate.rate / 100) : item.basicDuty;
    ftaDuty += duty;
    totalValue += item.customsValue;
    weightedRate += item.customsValue * (pick ? pick.rate.rate : (item.customsValue ? item.basicDuty / item.customsValue * 100 : 0));
  });
  const basicDuty = items.reduce((sum, item) => sum + item.basicDuty, 0);
  const agreementNames = Array.from(new Set(matched.map((pick) => pick.agreement.name)));

  return {
    agreements: agreements.map((agreement) => agreement.name),
    agreement: agreementNames.join('·'),
    rate: totalValue ? Number((weightedRate / totalValue).toFixed(4)) : null,
    duty: ftaDuty,
    savings: Math.max(0, basicDuty - ftaDuty),
    coverage: matched.length === items.length ? 'all' : 'partial',
    notes,
  };
}

export type FtaEligibilityStatus = 'possible' | 'needs-evidence' | 'not-applicable';

export interface FtaEligibilityCheck {
  label: string;
  value: string;
  /** true 충족, false 미충족, null 아직 모름 */
  ok: boolean | null;
}

export interface FtaEligibility {
  status: FtaEligibilityStatus;
  label: string;
  checks: FtaEligibilityCheck[];
  /** 협정세율을 예상세액에 반영해도 되는 상태인지 (status === 'possible') */
  applyRate: boolean;
}

export interface FtaEvidence {
  originCountry: string;
  basicRate: number;
  basicDuty: number;
  hasCertificateOfOrigin: boolean;
  /** 원산지증명서 기재값이 다른 서류와 어긋난 항목 수. 서류가 없거나 대조 결과가 없으면 null */
  certificateMismatches: number | null;
}

/**
 * 자동으로 확인할 수 있는 항목만 보고 적용 가능성을 세 단계로 나눈다.
 * '적용 가능성 있음'이어도 원산지 결정기준 충족 여부는 관세사 확인 사항이다.
 */
export function assessFtaEligibility(candidate: ImportFtaCandidate, evidence: FtaEvidence): FtaEligibility {
  const krw = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
  const origin = evidence.originCountry || '확인 필요';
  const checks: FtaEligibilityCheck[] = [];

  if (candidate.agreements.length === 0) {
    checks.push({ label: '협정', value: `${origin} — 한국과 발효된 FTA 없음`, ok: false });
    return { status: 'not-applicable', label: 'FTA 적용 대상 아님', checks, applyRate: false };
  }
  checks.push({ label: '협정', value: candidate.agreement ?? candidate.agreements.join('·'), ok: true });

  if (candidate.rate == null || candidate.duty == null || candidate.savings == null) {
    checks.push({ label: '협정세율', value: '관세청 조회 결과에 없음 — 관세사 확인', ok: null });
    return { status: 'needs-evidence', label: 'FTA 적용 가능성 있음 · 협정세율 확인 필요', checks, applyRate: false };
  }

  const lower = candidate.rate < evidence.basicRate;
  checks.push({ label: '협정세율', value: `${candidate.rate}% (기본세율 ${evidence.basicRate}%)`, ok: lower });
  if (!lower) {
    return { status: 'not-applicable', label: 'FTA 적용 실익 없음', checks, applyRate: false };
  }
  checks.push({ label: '예상 절감액', value: `${krw(candidate.savings)} (관세 ${krw(evidence.basicDuty)} → ${krw(candidate.duty)})`, ok: true });

  if (!evidence.hasCertificateOfOrigin) {
    checks.push({ label: '원산지증명서', value: '미첨부 — 발급·첨부 후 적용', ok: false });
    return { status: 'needs-evidence', label: 'FTA 적용 가능성 있음 · 증빙 확인 필요', checks, applyRate: false };
  }
  if (evidence.certificateMismatches != null && evidence.certificateMismatches > 0) {
    checks.push({ label: '원산지증명서', value: `첨부됨 · 다른 서류와 ${evidence.certificateMismatches}건 불일치`, ok: false });
    return { status: 'needs-evidence', label: 'FTA 적용 가능성 있음 · 증빙 확인 필요', checks, applyRate: false };
  }
  checks.push({ label: '원산지증명서', value: evidence.certificateMismatches === 0 ? '첨부됨 · 기재 정보 일치' : '첨부됨', ok: true });
  checks.push({ label: '원산지 결정기준', value: '세번변경·부가가치 기준은 관세사 확인', ok: null });
  return { status: 'possible', label: 'FTA 적용 가능성 있음', checks, applyRate: true };
}
