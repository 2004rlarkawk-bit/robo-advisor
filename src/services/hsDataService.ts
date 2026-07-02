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
 * 랭킹: 코드 접두 일치 > 카테고리 포함 > 한글명 포함 > 영문명 포함.
 * "기타"처럼 잎 항목명이 모호한 경우 category 필드가 실질 매칭을 담당합니다.
 */
export async function searchHSByKeyword(keyword: string, limit = 8): Promise<HSSearchResult[]> {
  const data = await loadHSData();
  const q = normalize(keyword);
  if (!q || data.length === 0) return [];

  const isDigits = /^\d+$/.test(q);
  const results: HSSearchResult[] = [];

  for (const e of data) {
    let score = 0;
    if (isDigits) {
      if (e.code.startsWith(q)) score += 10;
    } else {
      const ko = normalize(e.ko);
      const en = normalize(e.en);
      const cat = normalize(e.category);
      if (cat.includes(q)) score += 5;
      if (ko.includes(q)) score += 3;
      if (en.includes(q)) score += 1;
      // 카테고리/한글명이 검색어로 시작하면 가점
      if (cat.startsWith('(' + q) || ko.startsWith(q)) score += 2;
    }
    if (score > 0) {
      results.push({ ...e, formattedCode: formatCode(e.code), score });
    }
    if (isDigits && results.length >= limit * 4) break; // 코드 검색은 접두 특성상 조기 종료 가능
  }

  results.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
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
