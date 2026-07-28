/**
 * 수입 서류 대사(對査) 룰 정의 — IR1 ~ IR10
 *
 * 수출 검증(validatorEngine)의 룰-엔진 패턴을 문서 간 교차검증으로 확장한다.
 * 판정 로직은 결정론적(코드)이며, 입력(추출필드)이 실 OCR에서 오든 데모
 * 픽스처에서 오든 동일하게 동작한다. LLM은 필드 추출만 담당하고 판정은 여기서.
 *
 * 각 룰은 evaluate(input) → { status, evidence } 를 반환한다.
 *  - pass : 대사 통과(일치)
 *  - fail : 불일치 (severity에 따라 error/warning)
 *  - skip : 판정에 필요한 값이 없음(확인불가) — 오탐 방지를 위해 실패로 치지 않는다
 *
 * 허용오차는 매직넘버로 박지 않고 상단 상수로 노출한다(룰 파라미터화).
 */
import type {
  ImportDocFields,
  ImportDocumentType,
  ImportReconciliationInput,
  ReconciliationStatus,
} from '../types/importTrade';
import type { ValidationSeverity } from '../types';

// ===== 허용오차 파라미터 (룰 정의값 — 하드코딩 금지) =====

/** IR3 총중량 대사: ±0.5% 또는 ±1kg 중 큰 쪽까지 허용 */
export const WEIGHT_TOLERANCE = { pct: 0.005, abs: 1 } as const;
/** IR6 금액 정합: 단가·수량 반올림 오차 흡수 (±1 또는 ±1%) */
export const AMOUNT_TOLERANCE = { pct: 0.01, abs: 1 } as const;
/** IR1 품명 일치: 문서 간 토큰 자카드 겹침이 이 값 미만이면 상이로 판정 */
export const DESC_MIN_OVERLAP = 0.5;

/** Incoterms 2020 표준 11종 (IR9) */
export const STANDARD_INCOTERMS = new Set([
  'EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
]);

// ===== 파싱/정규화 헬퍼 (테스트에서 재사용) =====

/** "1,020개" · "3.5 CBM" · "USD 18,000" → 숫자. 값 없거나 숫자 아님 → null */
export function parseNumeric(value?: string): number | null {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 품명 정규화 토큰화: 소문자·기호 제거·2글자 이상 토큰만 */
export function descTokens(value?: string): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** 두 토큰 집합의 자카드 유사도 (0~1) */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

const CI: ImportDocumentType = 'commercial_invoice';
const PL: ImportDocumentType = 'packing_list';
const BL: ImportDocumentType = 'bill_of_lading';

const DOC_LABEL: Record<ImportDocumentType, string> = {
  commercial_invoice: 'C/I',
  packing_list: 'P/L',
  bill_of_lading: 'B/L',
  unknown: '기타',
};

function n(v: number): string {
  return v.toLocaleString();
}

// ===== 룰 타입 =====

export interface RuleOutcome {
  status: ReconciliationStatus;
  evidence: string;
}

export interface ReconciliationRule {
  id: string;
  label: string;
  severity: ValidationSeverity;
  /**
   * 하드 차단 여부. true면 사유 override로도 다음 단계로 넘길 수 없다(구조적 결격).
   * 필수 서류 누락(IR10)처럼 수입신고 자체가 불가능한 경우에만 true.
   * 내용 불일치(수량·중량 등)는 false — 포워더가 받은 서류를 못 고치므로 사유 override 허용.
   */
  blocking?: boolean;
  documents: ImportDocumentType[];
  evaluate: (input: ImportReconciliationInput) => RuleOutcome;
}

function get(input: ImportReconciliationInput, type: ImportDocumentType): ImportDocFields | undefined {
  return input[type];
}

// ===== IR1 ~ IR10 =====

export const IMPORT_RECONCILIATION_RULES: ReconciliationRule[] = [
  {
    id: 'IR1',
    label: '품명 일치',
    severity: 'warning',
    documents: [CI, PL, BL],
    evaluate: (input) => {
      const entries = [CI, PL, BL]
        .map((type) => ({ type, desc: (get(input, type)?.productDescription ?? '').trim() }))
        .filter((e) => e.desc !== '');
      if (entries.length < 2) return { status: 'skip', evidence: '품명이 있는 서류가 2건 미만이라 대사할 수 없습니다.' };

      let minOverlap = 1;
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          minOverlap = Math.min(minOverlap, jaccard(descTokens(entries[i].desc), descTokens(entries[j].desc)));
        }
      }
      if (minOverlap >= DESC_MIN_OVERLAP) {
        return { status: 'pass', evidence: `품명 표기가 문서 간 일치합니다 (${entries.map((e) => `${DOC_LABEL[e.type]} "${e.desc}"`).join(', ')}).` };
      }
      return {
        status: 'fail',
        evidence: `품명 표기 상이 — ${entries.map((e) => `${DOC_LABEL[e.type]} "${e.desc}"`).join(' vs ')} → 동일 물품인지 확인 필요.`,
      };
    },
  },
  {
    id: 'IR2',
    label: '수량 일치',
    severity: 'error',
    documents: [CI, PL],
    evaluate: (input) => {
      const ci = parseNumeric(get(input, CI)?.quantity);
      const pl = parseNumeric(get(input, PL)?.quantity);
      if (ci == null || pl == null) return { status: 'skip', evidence: 'C/I 또는 P/L 수량 값이 없어 대사할 수 없습니다.' };
      if (ci === pl) return { status: 'pass', evidence: `수량 일치: C/I·P/L 모두 ${n(ci)}.` };
      return { status: 'fail', evidence: `C/I 수량 ${n(ci)} vs P/L 수량 ${n(pl)} → ${n(Math.abs(ci - pl))} 차이.` };
    },
  },
  {
    id: 'IR3',
    label: '총중량 일치',
    severity: 'error',
    documents: [PL, BL],
    evaluate: (input) => {
      const pl = parseNumeric(get(input, PL)?.grossWeight);
      const bl = parseNumeric(get(input, BL)?.grossWeight);
      if (pl == null || bl == null) return { status: 'skip', evidence: 'P/L 또는 B/L 총중량 값이 없어 대사할 수 없습니다.' };
      const diff = Math.abs(pl - bl);
      const allowed = Math.max(WEIGHT_TOLERANCE.abs, WEIGHT_TOLERANCE.pct * Math.max(pl, bl));
      if (diff <= allowed) return { status: 'pass', evidence: `총중량 일치: P/L ${n(pl)}kg, B/L ${n(bl)}kg (허용오차 ±${n(Math.round(allowed * 100) / 100)}kg 이내).` };
      return { status: 'fail', evidence: `총중량 불일치: P/L ${n(pl)}kg vs B/L ${n(bl)}kg → ${n(Math.round(diff * 100) / 100)}kg 차이 (허용 ±${n(Math.round(allowed * 100) / 100)}kg).` };
    },
  },
  {
    id: 'IR4',
    label: '순중량 ≤ 총중량',
    severity: 'error',
    documents: [PL],
    evaluate: (input) => {
      const net = parseNumeric(get(input, PL)?.netWeight);
      const gross = parseNumeric(get(input, PL)?.grossWeight);
      if (net == null || gross == null) return { status: 'skip', evidence: 'P/L 순중량 또는 총중량 값이 없어 대사할 수 없습니다.' };
      if (net <= gross) return { status: 'pass', evidence: `순중량(${n(net)}kg) ≤ 총중량(${n(gross)}kg).` };
      return { status: 'fail', evidence: `순중량 ${n(net)}kg 이 총중량 ${n(gross)}kg 보다 큽니다 → 중량 오기재.` };
    },
  },
  {
    id: 'IR5',
    label: '포장 수량 일치',
    severity: 'error',
    documents: [PL, BL],
    evaluate: (input) => {
      const pl = parseNumeric(get(input, PL)?.packageCount);
      const bl = parseNumeric(get(input, BL)?.packageCount);
      if (pl == null || bl == null) return { status: 'skip', evidence: 'P/L 또는 B/L 포장 수량 값이 없어 대사할 수 없습니다.' };
      if (pl === bl) return { status: 'pass', evidence: `포장 수량 일치: ${n(pl)}.` };
      return { status: 'fail', evidence: `포장 수량 불일치: P/L ${n(pl)} vs B/L ${n(bl)}.` };
    },
  },
  {
    id: 'IR6',
    label: '금액 정합 (단가×수량)',
    severity: 'error',
    documents: [CI],
    evaluate: (input) => {
      const ci = get(input, CI);
      const price = parseNumeric(ci?.unitPrice);
      const qty = parseNumeric(ci?.quantity);
      const total = parseNumeric(ci?.totalAmount);
      if (price == null || qty == null || total == null) return { status: 'skip', evidence: 'C/I 단가·수량·총액 중 값이 없어 대사할 수 없습니다.' };
      const expected = price * qty;
      const allowed = Math.max(AMOUNT_TOLERANCE.abs, AMOUNT_TOLERANCE.pct * expected);
      if (Math.abs(expected - total) <= allowed) return { status: 'pass', evidence: `금액 정합: 단가 ${n(price)} × 수량 ${n(qty)} = ${n(expected)} ≈ 총액 ${n(total)}.` };
      return { status: 'fail', evidence: `금액 불일치: 단가 ${n(price)} × 수량 ${n(qty)} = ${n(expected)} 이지만 총액은 ${n(total)}.` };
    },
  },
  {
    id: 'IR7',
    label: '통화 표기 존재',
    severity: 'warning',
    documents: [CI],
    evaluate: (input) => {
      const ci = get(input, CI);
      if (!ci) return { status: 'skip', evidence: 'C/I가 없어 통화를 확인할 수 없습니다.' };
      const currency = (ci.currency ?? '').trim();
      if (currency !== '') return { status: 'pass', evidence: `통화 표기 있음: ${currency}.` };
      return { status: 'fail', evidence: 'C/I에 통화(USD 등) 표기가 없습니다 → 과세가격 환산 불가.' };
    },
  },
  {
    id: 'IR8',
    label: 'HS CODE 유효',
    severity: 'warning',
    documents: [CI],
    evaluate: (input) => {
      // HS 유효성은 "존재 + 형식" 완전성 검사. 수입신고에 HS가 필수이므로
      // 미기재는 확인불가(skip)가 아니라 경고(fail)로 다룬다. 단 대사할 C/I 자체가
      // 없으면 판단 근거가 없어 skip.
      const raw = [CI, PL, BL].map((type) => get(input, type)?.hsCode).find((v) => v && v.trim() !== '');
      if (raw) {
        const digits = raw.replace(/[^0-9]/g, '');
        if (digits.length >= 6) return { status: 'pass', evidence: `HS CODE 형식 유효: ${raw} (${digits.length}자리).` };
        return { status: 'fail', evidence: `HS CODE "${raw}"가 6자리 미만이라 검토가 필요합니다.` };
      }
      if (!get(input, CI)) return { status: 'skip', evidence: 'C/I가 없어 HS CODE를 확인할 수 없습니다.' };
      return { status: 'fail', evidence: 'HS CODE 미기재 — 수입신고를 위해 품목분류(6자리 이상)를 확인해야 합니다.' };
    },
  },
  {
    id: 'IR9',
    label: 'Incoterms 유효',
    severity: 'warning',
    documents: [CI],
    evaluate: (input) => {
      const raw = get(input, CI)?.incoterms;
      if (!raw || raw.trim() === '') return { status: 'skip', evidence: 'C/I에서 Incoterms를 확인하지 못했습니다.' };
      const code = raw.trim().toUpperCase().split(/\s+/)[0];
      if (STANDARD_INCOTERMS.has(code)) return { status: 'pass', evidence: `Incoterms 표준 조건: ${code}.` };
      return { status: 'fail', evidence: `Incoterms "${raw}"는 2020 표준 11종에 없습니다 → 조건 확인 필요.` };
    },
  },
  {
    id: 'IR10',
    label: '필수 서류 구비 (C/I·P/L·B/L)',
    severity: 'error',
    blocking: true, // 필수 서류 누락은 수입신고 자체 불가 → 사유로도 override 불가
    documents: [CI, PL, BL],
    evaluate: (input) => {
      const missing = [CI, PL, BL].filter((type) => !input[type]);
      if (missing.length === 0) return { status: 'pass', evidence: 'C/I·P/L·B/L 3종이 모두 구비되었습니다.' };
      return { status: 'fail', evidence: `필수 서류 누락: ${missing.map((type) => DOC_LABEL[type]).join(', ')}.` };
    },
  },
];
