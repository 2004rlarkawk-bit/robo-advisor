/**
 * 평가 전용 정규화 (normalizationVersion: norm-v1)
 *
 * 앱의 분석·대사 로직과 분리돼 있다. 앱 코드가 바뀌어도 평가 기준이 흔들리지 않도록
 * 여기서는 앱 정규화 함수를 재사용하지 않고, 항구 사전 조회(resolvePort)만 가져다 쓴다.
 * 규칙을 바꾸면 NORMALIZATION_VERSION을 올리고 기준선을 다시 잰다.
 */
import { resolvePort, type PortEntry } from '../../src/services/portLocodeService';

export const NORMALIZATION_VERSION = 'norm-v1';

export type EvaluationMode =
  | 'strict'
  | 'text_relaxed'
  | 'numeric'
  | 'numeric_with_unit'
  | 'date'
  | 'company_strict'
  | 'company_relaxed'
  | 'port_locode';

export const EVALUATION_MODES: readonly EvaluationMode[] = [
  'strict', 'text_relaxed', 'numeric', 'numeric_with_unit', 'date', 'company_strict', 'company_relaxed', 'port_locode',
];

/** 서류에서 "값 없음"을 뜻하는 표기 — 누락으로 센다. */
const ABSENT_VALUES = new Set(['', '-', '—', '–', '(미기재)', 'n/a', 'na', '없음', '미기재', '해당없음', 'unknown', 'null', 'none']);

export function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return ABSENT_VALUES.has(String(value).normalize('NFKC').trim().toLowerCase());
}

const clean = (value: unknown) => String(value ?? '').normalize('NFKC').trim();

// ── 문자열 ────────────────────────────────────────────────────────────

/** strict: 앞뒤 공백만 제거하고 그대로 비교한다. */
export function strictEqual(expected: unknown, predicted: unknown): boolean {
  return clean(expected) === clean(predicted);
}

/** 대소문자·연속 공백·구두점 차이를 무시한 비교용 문자열. */
export function relaxText(value: unknown): string {
  return clean(value)
    .toUpperCase()
    .replace(/[.,;:'"`()[\]{}/\\_\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function textRelaxedEqual(expected: unknown, predicted: unknown): boolean {
  const e = relaxText(expected);
  return e !== '' && e === relaxText(predicted);
}

// ── 숫자·단위 ─────────────────────────────────────────────────────────

export interface NumberWithUnit {
  value: number | null;
  /** 정규화된 단위(KG/MT/G/그 외 대문자). 없으면 null */
  unit: string | null;
}

const UNIT_ALIASES: Record<string, string> = {
  KG: 'KG', KGS: 'KG', KGM: 'KG', KILOGRAM: 'KG', KILOGRAMS: 'KG', KILO: 'KG', KILOS: 'KG',
  MT: 'MT', 'M/T': 'MT', TON: 'MT', TONS: 'MT', TONNE: 'MT', TONNES: 'MT', TNE: 'MT',
  G: 'G', GR: 'G', GRS: 'G', GRM: 'G', GRAM: 'G', GRAMS: 'G',
};

export function normalizeUnit(raw: string | null | undefined): string | null {
  const text = clean(raw).toUpperCase().replace(/\.$/, '');
  if (!text) return null;
  return UNIT_ALIASES[text] ?? text;
}

/**
 * "1,250.00 KGS" → { value: 1250, unit: 'KG' }
 * 쉼표는 천 단위 구분자로만 본다(유럽식 소수점 쉼표는 지원하지 않음).
 * 숫자가 여러 개 섞였거나 읽을 수 없으면 value는 null.
 */
export function parseNumberWithUnit(raw: unknown): NumberWithUnit {
  const text = clean(raw).toUpperCase();
  if (!text || isMissingValue(text)) return { value: null, unit: null };
  const match = text.match(/^([-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[-+]?\d+(?:\.\d+)?)\s*([A-Z/][A-Z/.]*)?$/);
  if (!match) return { value: null, unit: null };
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return { value: null, unit: null };
  return { value, unit: normalizeUnit(match[2] ?? null) };
}

const MASS_IN_KG: Record<string, number> = { KG: 1, MT: 1000, G: 0.001 };

/** 질량 단위만 환산한다(KG·MT·G). 환산할 수 없으면 null. */
export function convertMass(value: number, from: string, to: string): number | null {
  const f = MASS_IN_KG[from];
  const t = MASS_IN_KG[to];
  if (f === undefined || t === undefined) return null;
  return (value * f) / t;
}

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** numeric: 단위는 보지 않고 숫자 값만 비교한다. */
export function numericEqual(expected: unknown, predicted: unknown): boolean {
  const e = parseNumberWithUnit(expected).value;
  const p = parseNumberWithUnit(predicted).value;
  return e !== null && p !== null && sameNumber(e, p);
}

/**
 * numeric_with_unit
 * - allowConversion=false(strict): 숫자와 단위(별칭 정규화 후)가 모두 같아야 한다.
 * - allowConversion=true(normalized): KG↔MT, G↔KG 환산 후 같으면 일치.
 * expectedUnit이 비어 있으면 정답값 문자열에 붙은 단위를 쓴다. 둘 다 없으면 숫자만 비교한다.
 */
export function numericWithUnitEqual(
  expected: unknown,
  expectedUnit: string | null | undefined,
  predicted: unknown,
  options: { allowConversion: boolean },
): boolean {
  const e = parseNumberWithUnit(expected);
  const p = parseNumberWithUnit(predicted);
  if (e.value === null || p.value === null) return false;
  const eUnit = normalizeUnit(expectedUnit) ?? e.unit;
  if (!eUnit) return sameNumber(e.value, p.value);
  if (!p.unit) return false; // 정답에 단위가 있는데 예측에 단위가 없으면 판단할 수 없다
  if (eUnit === p.unit) return sameNumber(e.value, p.value);
  if (!options.allowConversion) return false;
  const converted = convertMass(p.value, p.unit, eUnit);
  return converted !== null && sameNumber(e.value, converted);
}

// ── 날짜 ──────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4, MAY: 5,
  JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9,
  OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12,
};

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 날짜 → YYYY-MM-DD. 연·월·일이 모두 확실할 때만 돌려준다.
 * 지원: 2026-09-30, 2026/09/30, 2026.09.30, 30 SEP 2026, 30-SEP-2026, SEP. 30, 2026, SEPTEMBER 30 2026, 2026년 9월 30일
 * 연도 없는 날짜, "SEP 2026", 일·월 순서가 모호한 "09/10/2026" 은 null (임의로 채우지 않음).
 */
export function parseDate(raw: unknown): string | null {
  const text = clean(raw).toUpperCase().replace(/\s+/g, ' ');
  if (!text) return null;

  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = text.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = text.match(/^(\d{1,2})[\s-]+([A-Z]+)\.?[\s,-]+(\d{4})$/);
  if (m && MONTHS[m[2]]) return toIsoDate(Number(m[3]), MONTHS[m[2]], Number(m[1]));

  m = text.match(/^([A-Z]+)\.?\s+(\d{1,2})(?:ST|ND|RD|TH)?,?\s+(\d{4})$/);
  if (m && MONTHS[m[1]]) return toIsoDate(Number(m[3]), MONTHS[m[1]], Number(m[2]));

  return null;
}

export function dateEqual(expected: unknown, predicted: unknown): boolean {
  const e = parseDate(expected);
  const p = parseDate(predicted);
  return e !== null && e === p;
}

// ── 회사명 ────────────────────────────────────────────────────────────

const COMPANY_SUFFIX: Array<[RegExp, string]> = [
  [/\bCORPORATION\b/g, 'CORP'],
  [/\bINCORPORATED\b/g, 'INC'],
  [/\bLIMITED\b/g, 'LTD'],
  [/\bCOMPANY\b/g, 'CO'],
];

/** relaxed: 대소문자·공백·마침표·쉼표 차이, CO., LTD.=CO LTD, CORPORATION=CORP 만 허용. */
export function relaxCompany(value: unknown): string {
  let text = clean(value).toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of COMPANY_SUFFIX) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, ' ').trim();
}

export function companyRelaxedEqual(expected: unknown, predicted: unknown): boolean {
  const e = relaxCompany(expected);
  return e !== '' && e === relaxCompany(predicted);
}

// ── 품명 ──────────────────────────────────────────────────────────────

export type ProductTextMode = 'strict' | 'punctuation_relaxed' | 'core_text_contains';

/**
 * core_text_contains: 정답 품명의 단어(구두점 무시)가 예측 품명에 모두 들어 있으면 일치.
 * 예) 정답 "COTTON SHIRT" ⊂ 예측 "COTTON SHIRT, LIGHT GREEN". 의미 유사도는 쓰지 않는다.
 */
export function productTextEqual(expected: unknown, predicted: unknown, mode: ProductTextMode): boolean {
  if (mode === 'strict') return strictEqual(expected, predicted) && clean(expected) !== '';
  if (mode === 'punctuation_relaxed') return textRelaxedEqual(expected, predicted);
  const expectedWords = relaxText(expected).split(' ').filter(Boolean);
  const predictedWords = new Set(relaxText(predicted).split(' ').filter(Boolean));
  return expectedWords.length > 0 && expectedWords.every((word) => predictedWords.has(word));
}

// ── 항구 ──────────────────────────────────────────────────────────────

/** UN/LOCODE로 정확히 풀리는 경우만 코드를 돌려준다(오타 추정 fuzzy는 null). */
export function resolvePortLocode(raw: unknown, ports: PortEntry[] | null): string | null {
  const text = clean(raw);
  if (!text || !ports || ports.length === 0) return null;
  const resolution = resolvePort(text, ports);
  return resolution.status === 'exact' && resolution.match ? resolution.match.locode : null;
}

export function portEqual(expected: unknown, predicted: unknown, ports: PortEntry[] | null): boolean {
  const e = resolvePortLocode(expected, ports);
  return e !== null && e === resolvePortLocode(predicted, ports);
}

// ── HSK ───────────────────────────────────────────────────────────────

export function normalizeHsk(raw: unknown): string {
  return clean(raw).replace(/\D/g, '');
}

/** 참조가 10자리면 완전 일치, 그보다 짧으면 앞자리 일치. */
export function hskMatches(reference: unknown, candidate: unknown): boolean {
  const ref = normalizeHsk(reference);
  const cand = normalizeHsk(candidate);
  if (!ref || !cand) return false;
  return ref.length >= 10 ? cand === ref : cand.startsWith(ref);
}

// ── 모드별 판정 ────────────────────────────────────────────────────────

export interface FieldJudgement {
  missing: boolean;
  strict: boolean;
  normalized: boolean;
}

export interface JudgeContext {
  ports?: PortEntry[] | null;
}

/**
 * 한 필드의 판정.
 * - strict: 모드와 상관없이 앞뒤 공백 제거 후 완전 일치
 * - normalized: evaluation_mode 규칙 적용
 */
export function judgeField(
  mode: EvaluationMode,
  expected: unknown,
  expectedUnit: string | null | undefined,
  predicted: unknown,
  context: JudgeContext = {},
): FieldJudgement {
  const missing = isMissingValue(predicted);
  if (missing) return { missing: true, strict: false, normalized: false };
  const strict = clean(expected) !== '' && strictEqual(expected, predicted);
  let normalized: boolean;
  switch (mode) {
    case 'strict':
    case 'company_strict':
      normalized = strict;
      break;
    case 'text_relaxed':
      normalized = textRelaxedEqual(expected, predicted);
      break;
    case 'numeric':
      normalized = numericEqual(expected, predicted);
      break;
    case 'numeric_with_unit':
      normalized = numericWithUnitEqual(expected, expectedUnit, predicted, { allowConversion: true });
      break;
    case 'date':
      normalized = dateEqual(expected, predicted);
      break;
    case 'company_relaxed':
      normalized = companyRelaxedEqual(expected, predicted);
      break;
    case 'port_locode':
      normalized = portEqual(expected, predicted, context.ports ?? null);
      break;
    default:
      normalized = false;
  }
  return { missing: false, strict, normalized: strict || normalized };
}

export function isEvaluationMode(value: string): value is EvaluationMode {
  return (EVALUATION_MODES as readonly string[]).includes(value);
}
