/**
 * 의류 HS 호·소호의 분류 기준(성별·편직 여부·소재) 보조표.
 *
 * 관세청 HSK 사전은 10자리 말단 품명만 담고 있어, 의류는 서로 다른 코드가
 * 같은 품명을 공유한다. 예) 6201.20 / 6201.30 / 6202.30 모두
 * "오버코트ㆍ레인코트ㆍ카코트ㆍ케이프ㆍ클록과 이와 유사한 의류".
 * 실제 구분 기준인 성별(6201 남성용 / 6202 여성용)과 소재(.20 양모 / .30 면)는
 * 상위 호·소호 문구에만 있으므로, 이 표로 보완해
 *  - AI 추천 후보 설명에 기준을 덧붙이고(서로 다른 코드를 구분할 수 있게)
 *  - 되묻기 선택지를 "남성용 · 양모" 같은 짧은 라벨로 보여주고
 *  - 선택 결과로 "Men's Wool Coat" 같은 영문 품명을 만든다.
 *
 * 문구는 HS 2022 품목분류표(WCO) 호·소호 용어를 따른다.
 */

interface HeadingScope {
  /** 성별 — 짧은 표기 */
  genderKo?: string;
  genderEn?: string;
  /** 호 전체 설명 (AI 후보 설명용) */
  ko: string;
  en: string;
  /** 소재가 호 자체로 정해지는 경우 (가죽 의류) */
  materialKo?: string;
  materialEn?: string;
}

interface SubheadingScope {
  materialKo: string;
  materialEn: string;
  /** 같은 호 안에서 품목 종류까지 갈리는 경우 (재킷 vs 바지) */
  garmentKo?: string;
  garmentEn?: string;
}

const HEADING_SCOPE: Record<string, HeadingScope> = {
  '6101': { genderKo: '남성용', genderEn: "Men's", ko: '남성용·소년용, 편물제', en: "men's or boys', knitted or crocheted" },
  '6102': { genderKo: '여성용', genderEn: "Women's", ko: '여성용·소녀용, 편물제', en: "women's or girls', knitted or crocheted" },
  '6109': { ko: '편물제', en: 'knitted or crocheted' },
  '6110': { ko: '편물제', en: 'knitted or crocheted' },
  '6201': { genderKo: '남성용', genderEn: "Men's", ko: '남성용·소년용, 직물제', en: "men's or boys', not knitted" },
  '6202': { genderKo: '여성용', genderEn: "Women's", ko: '여성용·소녀용, 직물제', en: "women's or girls', not knitted" },
  '6203': { genderKo: '남성용', genderEn: "Men's", ko: '남성용·소년용, 직물제', en: "men's or boys', not knitted" },
  '6204': { genderKo: '여성용', genderEn: "Women's", ko: '여성용·소녀용, 직물제', en: "women's or girls', not knitted" },
  '4203': { ko: '가죽제·콤퍼지션 가죽제', en: 'of leather or composition leather', materialKo: '가죽', materialEn: 'Leather' },
};

const wool = { materialKo: '양모', materialEn: 'Wool' };
const cotton = { materialKo: '면', materialEn: 'Cotton' };
const manMade = { materialKo: '인조섬유', materialEn: 'Synthetic' };
const synthetic = { materialKo: '합성섬유', materialEn: 'Synthetic' };
const other = { materialKo: '기타 섬유', materialEn: '' };
const jacket = { garmentKo: '재킷', garmentEn: 'Jacket' };
const trousers = { garmentKo: '바지', garmentEn: 'Trousers' };

const SUBHEADING_SCOPE: Record<string, SubheadingScope> = {
  // 6101 남성용 코트(편물)
  '610120': cotton, '610130': manMade, '610190': other,
  // 6102 여성용 코트(편물)
  '610210': wool, '610220': cotton, '610230': manMade, '610290': other,
  // 6109 티셔츠
  '610910': cotton, '610990': other,
  // 6110 스웨터·풀오버
  '611011': wool,
  '611012': { materialKo: '캐시미어', materialEn: 'Cashmere' },
  '611019': { materialKo: '기타 동물 섬모', materialEn: 'Fine Animal Hair' },
  '611020': cotton, '611030': manMade, '611090': other,
  // 6201 남성용 코트(직물)
  '620120': wool, '620130': cotton, '620140': manMade, '620190': other,
  // 6202 여성용 코트(직물)
  '620220': wool, '620230': cotton, '620240': manMade, '620290': other,
  // 6203 남성용 재킷·블레이저 / 바지
  '620331': { ...wool, ...jacket }, '620332': { ...cotton, ...jacket },
  '620333': { ...synthetic, ...jacket }, '620339': { ...other, ...jacket },
  '620341': { ...wool, ...trousers }, '620342': { ...cotton, ...trousers },
  '620343': { ...synthetic, ...trousers }, '620349': { ...other, ...trousers },
  // 6204 여성용 재킷·블레이저 / 바지
  '620431': { ...wool, ...jacket }, '620432': { ...cotton, ...jacket },
  '620433': { ...synthetic, ...jacket }, '620439': { ...other, ...jacket },
  '620461': { ...wool, ...trousers }, '620462': { ...cotton, ...trousers },
  '620463': { ...synthetic, ...trousers }, '620469': { ...other, ...trousers },
};

export interface ApparelScope {
  /** AI 후보 설명용 전체 기준 */
  ko: string;
  en: string;
  /** 되묻기 선택지 라벨 — "남성용 · 양모" */
  shortKo: string;
  /** 품명 조합용 — "Men's", "Wool" */
  genderEn: string;
  materialEn: string;
  garmentEn: string;
}

/** 코드의 성별·소재 분류 기준. 보조표에 없는 코드는 null. */
export function apparelScopeOf(code: string): ApparelScope | null {
  const digits = code.replace(/\D/g, '');
  const heading = HEADING_SCOPE[digits.slice(0, 4)];
  if (!heading) return null;
  const sub = SUBHEADING_SCOPE[digits.slice(0, 6)];

  const materialKo = sub?.materialKo ?? heading.materialKo ?? '';
  const materialEn = sub?.materialEn ?? heading.materialEn ?? '';
  const detailKo = [sub?.garmentKo, materialKo].filter(Boolean).join(', ');
  const detailEn = [sub?.garmentEn, materialEn].filter(Boolean).join(', ');

  return {
    ko: detailKo ? `${heading.ko} · ${detailKo}` : heading.ko,
    en: detailEn ? `${heading.en}, ${detailEn.toLowerCase()}` : heading.en,
    shortKo: [heading.genderKo, sub?.garmentKo, materialKo].filter(Boolean).join(' · ') || heading.ko,
    genderEn: heading.genderEn ?? '',
    materialEn,
    garmentEn: sub?.garmentEn ?? '',
  };
}

/**
 * 후보 품명에 분류 기준을 덧붙인다 (AI 추천 입력용).
 * "오버코트…" + 6202.30 → "오버코트… [여성용·소녀용, 직물제 · 면]"
 * 보조표 대상이 아니면 원래 품명을 그대로 돌려준다.
 */
export function annotateApparelNames(
  code: string,
  koreanName: string,
  englishName: string,
): { koreanName: string; englishName: string } {
  const scope = apparelScopeOf(code);
  if (!scope) return { koreanName, englishName };
  return {
    koreanName: `${koreanName} [${scope.ko}]`,
    englishName: englishName ? `${englishName} [${scope.en}]` : englishName,
  };
}

const titleCase = (value: string) =>
  value.trim().replace(/\s+/g, ' ').replace(/\b([a-z])/g, (match) => match.toUpperCase());

/**
 * 의류 선택지를 고른 결과로 무역서류용 영문 품명을 만든다.
 * "coat" + 6201.20 → "Men's Wool Coat", "jacket" + 4203.10 → "Leather Jacket"
 * 품목 종류가 소호로 정해지면(6203.31 재킷) 사용자가 적은 단어 대신 그 종류를 쓴다.
 */
export function composeApparelGoodsName(code: string, userTerm: string): string | null {
  const scope = apparelScopeOf(code);
  if (!scope) return null;
  const garment = scope.garmentEn || titleCase(userTerm);
  if (!garment) return null;
  return [scope.genderEn, scope.materialEn, garment].filter(Boolean).join(' ');
}

/**
 * 품목 단어 → 해당 의류 소호.
 * 직물 재킷(6203.32 등)의 사전 품명은 "면으로 만든 것 / Of cotton"뿐이라
 * "jacket"으로 검색해도 걸리지 않는다. 품목 종류는 상위 소호 제목에만 있으므로
 * 여기서 검색어를 소호로 이어 준다.
 */
const GARMENT_QUERY_INDEX: Array<{ pattern: RegExp; prefixes: string[] }> = [
  {
    pattern: /\b(jackets?|blazers?)\b|재킷|자켓|블레이저/i,
    prefixes: [
      '620331', '620332', '620333', '620339',
      '620431', '620432', '620433', '620439',
      '420310',
    ],
  },
  {
    pattern: /\b(trousers?|pants|slacks)\b|바지|팬츠|슬랙스/i,
    prefixes: [
      '620341', '620342', '620343', '620349',
      '620461', '620462', '620463', '620469',
    ],
  },
  {
    pattern: /\b(coats?|overcoats?|raincoats?|parkas?|anoraks?)\b|코트|파카|아노락/i,
    prefixes: ['420310', '6201', '6202', '6101', '6102'],
  },
];

/** 검색어가 의류 품목 단어면 후보로 끌어올 소호 목록. 해당 없으면 빈 배열. */
export function apparelPrefixesForQuery(query: string): string[] {
  const prefixes = new Set<string>();
  for (const { pattern, prefixes: list } of GARMENT_QUERY_INDEX) {
    if (pattern.test(query)) list.forEach((prefix) => prefixes.add(prefix));
  }
  return Array.from(prefixes);
}
