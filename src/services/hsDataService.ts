/**
 * HS 부호 로컬 사전 서비스
 *
 * 관세청 HS부호 데이터(관세청_HS부호_20260101.xlsx, 12,469행)를 변환한
 * `public/data/hsCodes.json`을 런타임에 fetch하여 검색/조회에 사용합니다.
 *
 * - 오프라인·CORS 무관: 정적 자산으로 서빙되므로 공공 API 장애와 독립적입니다.
 * - 실 HSK 10자리 코드 기반이라 시뮬레이션 dict보다 정확합니다.
 * - fetch 실패(테스트 환경 등) 시 빈 결과를 반환하여 호출측 폴백을 유도합니다.
 *
 * JSON 레코드 형식(배열, 용량 최소화):
 *   [code, ko, en, qtyUnit, wtUnit, category]
 */

export interface HSDataEntry {
  code: string;        // 10자리 HSK (점/하이픈 없음)
  ko: string;          // 한글품목명 (세부/잎 항목명)
  en: string;          // 영문품목명
  qtyUnit: string;     // 수량단위코드 (예: U)
  wtUnit: string;      // 중량단위코드 (예: KG)
  category: string;    // 성질통합분류코드명 (예: "(말)")
}

type RawRow = [string, string, string, string, string, string];

let cache: HSDataEntry[] | null = null;
let loadPromise: Promise<HSDataEntry[]> | null = null;

function dataUrl(): string {
  // Vite base 경로 반영. 테스트/노드 환경에서는 BASE_URL이 없을 수 있음.
  const base =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
  return `${base}data/hsCodes.json`;
}

/** HS 데이터 로드 (1회 fetch 후 캐시). 실패 시 빈 배열. */
export async function loadHSData(): Promise<HSDataEntry[]> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      if (typeof fetch !== 'function') return [];
      const res = await fetch(dataUrl());
      if (!res.ok) throw new Error(`HS 데이터 로드 실패 (${res.status})`);
      const raw = (await res.json()) as RawRow[];
      cache = raw.map(([code, ko, en, qtyUnit, wtUnit, category]) => ({
        code,
        ko,
        en,
        qtyUnit,
        wtUnit,
        category,
      }));
      return cache;
    } catch (err) {
      console.warn('HS 로컬 사전 로드 실패, 폴백 사용:', err);
      cache = [];
      return cache;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

/** 6자리 또는 10자리 코드 표기(점/하이픈 포함) */
export function formatCode(code: string): string {
  const c = code.replace(/[\s.-]/g, '');
  if (c.length === 10) return `${c.slice(0, 4)}.${c.slice(4, 6)}-${c.slice(6, 10)}`;
  if (c.length === 6) return `${c.slice(0, 4)}.${c.slice(4, 6)}`;
  return code;
}

export interface HSSearchResult extends HSDataEntry {
  formattedCode: string;
  score: number;
}

/**
 * 키워드로 HS 후보 검색.
 * 다단어 검색어는 공백 기준 토큰으로 분리하여 OR 매칭 + 매칭 토큰 수로 가점.
 * 랭킹: 코드 접두 일치 > 전체 문구 일치 > 토큰별 (카테고리 > 한글명 > 영문명).
 * "기타"처럼 잎 항목명이 모호한 경우 category 필드가 실질 매칭을 담당합니다.
 */
/**
 * 영문 품명에서 토큰이 "단어로" 나오는지 본다(복수형 허용).
 * 부분문자열만 보면 pen 이 Litopenaeus·Pentafluoroethane 에 걸려
 * 동점이 무더기로 생기고, 동점 정렬이 코드 오름차순이라 무관한 저번호 품목이 상위를 차지한다.
 */
function hasWord(haystack: string, token: string): boolean {
  if (!/^[a-z0-9]+$/.test(token)) return haystack.includes(token);
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}(e?s)?([^a-z0-9]|$)`, 'i')
    .test(haystack);
}

/**
 * 무역 현장에서 쓰는 일상 영어 ↔ 관세청 공식 품명 영어의 어휘 격차를 메운다.
 *
 * 관세청 품명은 trousers·footwear·apparel 같은 공식 용어를 쓰는데
 * 사용자는 pants·shoes·clothes 로 입력한다. 이 매핑이 없으면
 * "pants" 검색에 6103·6203(진짜 바지)이 후보로 아예 들어오지 못하고,
 * 우연히 이름이 겹친 4203(가죽제 의류)만 남아 잘못된 추천으로 이어진다.
 */
const TERM_SYNONYMS: Record<string, string[]> = {
  pants: ['trousers'],
  trouser: ['trousers'],
  clothes: ['apparel', 'garments'],
  clothing: ['apparel', 'garments'],
  shoes: ['footwear'],
  shoe: ['footwear'],
  sneakers: ['footwear', 'sports footwear'],
  tshirt: ['t-shirts'],
  tee: ['t-shirts'],
  jumper: ['jerseys', 'pullovers'],
  sweater: ['jerseys', 'pullovers'],
  hoodie: ['jerseys', 'pullovers', 'sweatshirts'],
  cellphone: ['telephones'],
  handphone: ['telephones'],
  smartphone: ['telephones'],
  laptop: ['portable automatic data processing machines'],
  notebook: ['portable automatic data processing machines'],
  earphone: ['headphones', 'earphones'],
  earbuds: ['headphones', 'earphones'],
  bag: ['handbags'],
  bags: ['handbags'],
  glove: ['gloves', 'mittens'],
  gloves: ['mittens'],
  socks: ['stockings', 'hosiery'],
  engine: ['internal combustion piston engines'],
  cosmetics: ['beauty', 'make-up preparations'],
  car: ['motor cars', 'motor vehicles'],
  bike: ['bicycles'],
  furniture: ['seats', 'furniture'],
};

/** 입력 문구를 관세청 용어 변형까지 포함한 검색어 목록으로 확장한다. */
function expandQueries(keyword: string): string[] {
  const base = keyword.trim().toLowerCase();
  if (!base) return [];
  const variants = new Set<string>([base]);
  const words = base.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    const alternatives = TERM_SYNONYMS[words[i]];
    if (!alternatives) continue;
    for (const alternative of alternatives) {
      const swapped = [...words];
      swapped[i] = alternative;
      variants.add(swapped.join(' '));
    }
  }
  return Array.from(variants);
}

export async function searchHSByKeyword(keyword: string, limit = 8): Promise<HSSearchResult[]> {
  const data = await loadHSData();
  const phrase = normalize(keyword);
  if (!phrase || data.length === 0) return [];

  const isDigits = /^\d+$/.test(phrase);
  // 원문 + 관세청 용어로 치환한 변형들을 함께 검색해 어휘 격차를 메운다.
  const queries = (isDigits ? [keyword.trim().toLowerCase()] : expandQueries(keyword))
    .map((query) => ({
      phrase: normalize(query),
      phraseRaw: query,
      // 1글자 토큰은 노이즈라 제외 (예: "및", "용")
      tokens: query
        .split(/\s+/)
        .map((t) => normalize(t))
        .filter((t) => t.length >= 2),
    }))
    .filter((query) => query.phrase.length > 0);
  const results: HSSearchResult[] = [];

  for (const e of data) {
    let score = 0;
    for (const { phrase, phraseRaw, tokens } of queries) {
    let variantScore = 0;
    if (isDigits) {
      if (e.code.startsWith(phrase)) variantScore += 10;
    } else {
      const ko = normalize(e.ko);
      const en = normalize(e.en);
      const cat = normalize(e.category);
      // normalize()는 공백을 지우므로 단어 경계 판정에는 원문을 쓴다.
      const koRaw = e.ko.toLowerCase();
      const enRaw = e.en.toLowerCase();

      // 전체 문구 일치 (최고 신뢰)
      if (cat.includes(phrase)) variantScore += 6;
      if (ko.includes(phrase)) variantScore += 4;
      if (en.includes(phrase)) variantScore += 2;
      // 단어 단위로 맞은 경우를 부분문자열보다 확실히 위에 둔다.
      if (hasWord(enRaw, phraseRaw) || hasWord(koRaw, phraseRaw)) variantScore += 5;
      // 여러 단어로 된 검색어가 품명에 통째로 들어있으면 가장 강한 신호다.
      // ("ballpoint pen" → "Ball point pens") 이 가점이 없으면 토큰 하나만
      // 맞은 품목(예: "Pen nibs")과 동점이 되어 순위가 뒤집힌다.
      if (tokens.length > 1
        && (cat.includes(phrase) || ko.includes(phrase) || en.includes(phrase))) {
        variantScore += 7;
      }
      // 공식 품명이 검색어 그 자체이면 최우선.
      if (ko === phrase || en === phrase) variantScore += 8;

      // 토큰별 부분 일치 (다단어 품목명 대응)
      if (variantScore === 0 && tokens.length > 0) {
        let matched = 0;
        for (const t of tokens) {
          if (cat.includes(t)) { variantScore += 3; matched++; }
          else if (ko.includes(t)) { variantScore += 2; matched++; }
          else if (hasWord(enRaw, t) || hasWord(koRaw, t)) { variantScore += 2; matched++; }
          else if (en.includes(t)) { variantScore += 1; matched++; }
        }
        // 모든 토큰 매칭 시 가점 (AND 우대)
        if (matched === tokens.length && tokens.length > 1) variantScore += 3;
      }

      // 카테고리/한글명이 검색어로 시작하면 가점
      if (cat.startsWith('(' + phrase) || ko.startsWith(phrase)) variantScore += 2;
    }
      // 여러 변형 중 가장 잘 맞은 점수를 그 품목의 점수로 삼는다.
      score = Math.max(score, variantScore);
    }
    if (score > 0) {
      results.push({ ...e, formattedCode: formatCode(e.code), score });
    }
    if (isDigits && results.length >= limit * 4) break; // 코드 검색은 접두 특성상 조기 종료 가능
  }

  // 동점일 때 코드 오름차순으로 정렬하면 무관한 저번호 품목(예: pen → 0306 흰다리새우)이
  // 상위를 차지한다. 품명이 짧을수록 그 물품 자체를 가리키므로 이를 우선한다.
  results.sort((a, b) =>
    b.score - a.score
    || (a.ko.length + a.en.length) - (b.ko.length + b.en.length)
    || a.code.localeCompare(b.code));
  return results.slice(0, limit);
}

/** 정확한 코드(6/10자리)로 단건 조회. 6자리는 접두 일치 첫 항목 반환. */
export async function lookupHSByCode(code: string): Promise<HSDataEntry | null> {
  const data = await loadHSData();
  if (data.length === 0) return null;
  const c = code.replace(/[\s.-]/g, '');
  if (!c) return null;
  if (c.length === 10) {
    return data.find((e) => e.code === c) ?? null;
  }
  // 6자리 등 부분 코드: 접두 일치 첫 항목
  return data.find((e) => e.code.startsWith(c)) ?? null;
}

/** 공식 관세청 데이터에서 숫자 접두와 일치하는 실제 HSK 10자리만 반환합니다. */
export async function findTenDigitHSKByPrefix(prefix: string, limit = 30): Promise<HSDataEntry[]> {
  const normalized = prefix.replace(/[^0-9]/g, '').slice(0, 10);
  if (!/^\d{4,10}$/.test(normalized)) return [];
  const data = await loadHSData();
  return data
    .filter((entry) => /^\d{10}$/.test(entry.code) && entry.code.startsWith(normalized))
    .slice(0, limit);
}

/** 숫자 10자리 형식과 공식 관세청 HSK 사전의 정확 일치를 함께 검증합니다. */
export async function isOfficialTenDigitHSK(code: string): Promise<boolean> {
  if (!/^\d{10}$/.test(code)) return false;
  const entry = await lookupHSByCode(code);
  return entry?.code === code;
}
