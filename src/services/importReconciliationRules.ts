import type { ValidationSeverity } from '../types';
import type {
  ImportDocFields,
  ImportDocumentType,
  ImportReconciliationInput,
  ReconciliationStatus,
} from '../types/importTrade';

export const WEIGHT_TOLERANCE = { pct: 0.005, abs: 1 } as const;
export const AMOUNT_TOLERANCE = { pct: 0.01, abs: 1 } as const;
export const DESC_MIN_OVERLAP = 0.5;
export const STANDARD_INCOTERMS = new Set([
  'EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
]);

export function parseNumeric(value?: string): number | null {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function descTokens(value?: string): string[] {
  if (!value) return [];
  return value.toLowerCase().replace(/[^a-z0-9가-힣\s]/g, ' ').split(/\s+/).filter((token) => token.length >= 2);
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
}

const CI: ImportDocumentType = 'commercial_invoice';
const PL: ImportDocumentType = 'packing_list';
const BL: ImportDocumentType = 'bill_of_lading';
const DOC_LABEL: Partial<Record<ImportDocumentType, string>> = {
  commercial_invoice: 'C/I', packing_list: 'P/L', bill_of_lading: 'B/L',
};
const label = (type: ImportDocumentType) => DOC_LABEL[type] ?? type;
const formatNumber = (value: number) => value.toLocaleString();

export interface RuleOutcome {
  status: ReconciliationStatus;
  evidence: string;
}

export interface ReconciliationRule {
  id: string;
  label: string;
  severity: ValidationSeverity;
  blocking?: boolean;
  documents: ImportDocumentType[];
  evaluate: (input: ImportReconciliationInput) => RuleOutcome;
}

function get(input: ImportReconciliationInput, type: ImportDocumentType): ImportDocFields | undefined {
  return input[type];
}

export const IMPORT_RECONCILIATION_RULES: ReconciliationRule[] = [
  {
    id: 'IR1', label: '품명 일치', severity: 'warning', documents: [CI, PL, BL],
    evaluate: (input) => {
      const entries = [CI, PL, BL]
        .map((type) => ({ type, description: (get(input, type)?.productDescription ?? '').trim() }))
        .filter((entry) => entry.description);
      if (entries.length < 2) return { status: 'skip', evidence: '품명이 있는 서류가 2건 미만이라 대조할 수 없습니다.' };
      let minimumOverlap = 1;
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          minimumOverlap = Math.min(minimumOverlap, jaccard(descTokens(entries[i].description), descTokens(entries[j].description)));
        }
      }
      const values = entries.map((entry) => `${label(entry.type)} "${entry.description}"`).join(minimumOverlap >= DESC_MIN_OVERLAP ? ', ' : ' vs ');
      return minimumOverlap >= DESC_MIN_OVERLAP
        ? { status: 'pass', evidence: `품명 표기가 문서 간 일치합니다 (${values}).` }
        : { status: 'fail', evidence: `품명 표기 상이 - ${values} -> 동일 물품인지 확인 필요.` };
    },
  },
  {
    id: 'IR2', label: '수량 일치', severity: 'error', documents: [CI, PL],
    evaluate: (input) => {
      const ci = parseNumeric(get(input, CI)?.quantity);
      const pl = parseNumeric(get(input, PL)?.quantity);
      if (ci == null || pl == null) return { status: 'skip', evidence: 'C/I 또는 P/L 수량 값이 없어 대조할 수 없습니다.' };
      return ci === pl
        ? { status: 'pass', evidence: `수량 일치: C/I·P/L 모두 ${formatNumber(ci)}.` }
        : { status: 'fail', evidence: `C/I 수량 ${formatNumber(ci)} vs P/L 수량 ${formatNumber(pl)} -> ${formatNumber(Math.abs(ci - pl))} 차이.` };
    },
  },
  {
    id: 'IR3', label: '총중량 일치', severity: 'error', documents: [PL, BL],
    evaluate: (input) => {
      const pl = parseNumeric(get(input, PL)?.grossWeight);
      const bl = parseNumeric(get(input, BL)?.grossWeight);
      if (pl == null || bl == null) return { status: 'skip', evidence: 'P/L 또는 B/L 총중량 값이 없어 대조할 수 없습니다.' };
      const difference = Math.abs(pl - bl);
      const allowed = Math.max(WEIGHT_TOLERANCE.abs, WEIGHT_TOLERANCE.pct * Math.max(pl, bl));
      return difference <= allowed
        ? { status: 'pass', evidence: `총중량 일치: P/L ${formatNumber(pl)}kg, B/L ${formatNumber(bl)}kg.` }
        : { status: 'fail', evidence: `총중량 불일치: P/L ${formatNumber(pl)}kg vs B/L ${formatNumber(bl)}kg -> ${formatNumber(difference)}kg 차이.` };
    },
  },
  {
    id: 'IR4', label: '순중량 ≤ 총중량', severity: 'error', documents: [PL],
    evaluate: (input) => {
      const net = parseNumeric(get(input, PL)?.netWeight);
      const gross = parseNumeric(get(input, PL)?.grossWeight);
      if (net == null || gross == null) return { status: 'skip', evidence: 'P/L 순중량 또는 총중량 값이 없어 대조할 수 없습니다.' };
      return net <= gross
        ? { status: 'pass', evidence: `순중량(${formatNumber(net)}kg) ≤ 총중량(${formatNumber(gross)}kg).` }
        : { status: 'fail', evidence: `순중량 ${formatNumber(net)}kg이 총중량 ${formatNumber(gross)}kg보다 큽니다.` };
    },
  },
  {
    id: 'IR5', label: '포장 수량 일치', severity: 'error', documents: [PL, BL],
    evaluate: (input) => {
      const pl = parseNumeric(get(input, PL)?.packageCount);
      const bl = parseNumeric(get(input, BL)?.packageCount);
      if (pl == null || bl == null) return { status: 'skip', evidence: 'P/L 또는 B/L 포장 수량 값이 없어 대조할 수 없습니다.' };
      return pl === bl
        ? { status: 'pass', evidence: `포장 수량 일치: ${formatNumber(pl)}.` }
        : { status: 'fail', evidence: `포장 수량 불일치: P/L ${formatNumber(pl)} vs B/L ${formatNumber(bl)}.` };
    },
  },
  {
    id: 'IR6', label: '금액 정합 (단가×수량)', severity: 'error', documents: [CI],
    evaluate: (input) => {
      const ci = get(input, CI);
      const unitPrice = parseNumeric(ci?.unitPrice);
      const quantity = parseNumeric(ci?.quantity);
      const total = parseNumeric(ci?.totalAmount);
      if (unitPrice == null || quantity == null || total == null) return { status: 'skip', evidence: 'C/I 단가·수량·총액 중 값이 없어 대조할 수 없습니다.' };
      const expected = unitPrice * quantity;
      const allowed = Math.max(AMOUNT_TOLERANCE.abs, AMOUNT_TOLERANCE.pct * expected);
      return Math.abs(expected - total) <= allowed
        ? { status: 'pass', evidence: `금액 정합: 단가 ${formatNumber(unitPrice)} × 수량 ${formatNumber(quantity)} = ${formatNumber(expected)}.` }
        : { status: 'fail', evidence: `금액 불일치: 계산값 ${formatNumber(expected)}, 총액 ${formatNumber(total)}.` };
    },
  },
  {
    id: 'IR7', label: '통화 표기 존재', severity: 'warning', documents: [CI],
    evaluate: (input) => {
      const ci = get(input, CI);
      if (!ci) return { status: 'skip', evidence: 'C/I가 없어 통화를 확인할 수 없습니다.' };
      return ci.currency?.trim()
        ? { status: 'pass', evidence: `통화 표기 있음: ${ci.currency}.` }
        : { status: 'fail', evidence: 'C/I에 통화 표기가 없습니다.' };
    },
  },
  {
    id: 'IR8', label: 'HS CODE 유효', severity: 'warning', documents: [CI],
    evaluate: (input) => {
      const raw = [CI, PL, BL].map((type) => get(input, type)?.hsCode).find((value) => value?.trim());
      if (raw) {
        const digits = raw.replace(/[^0-9]/g, '');
        return digits.length >= 6
          ? { status: 'pass', evidence: `HS CODE 형식 유효: ${raw} (${digits.length}자리).` }
          : { status: 'fail', evidence: `HS CODE "${raw}"가 6자리 미만입니다.` };
      }
      return get(input, CI)
        ? { status: 'fail', evidence: 'HS CODE 미기재 - 6자리 이상 품목분류를 확인해야 합니다.' }
        : { status: 'skip', evidence: 'C/I가 없어 HS CODE를 확인할 수 없습니다.' };
    },
  },
  {
    id: 'IR9', label: 'Incoterms 유효', severity: 'warning', documents: [CI],
    evaluate: (input) => {
      const raw = get(input, CI)?.incoterms?.trim();
      if (!raw) return { status: 'skip', evidence: 'C/I에서 Incoterms를 확인하지 못했습니다.' };
      const code = raw.toUpperCase().split(/\s+/)[0];
      return STANDARD_INCOTERMS.has(code)
        ? { status: 'pass', evidence: `Incoterms 표준 조건: ${code}.` }
        : { status: 'fail', evidence: `Incoterms "${raw}"는 2020 표준 11종에 없습니다.` };
    },
  },
  {
    id: 'IR10', label: '필수 서류 구비 (C/I·P/L·B/L)', severity: 'error', blocking: true, documents: [CI, PL, BL],
    evaluate: (input) => {
      const missing = [CI, PL, BL].filter((type) => !input[type]);
      return missing.length
        ? { status: 'fail', evidence: `필수 서류 누락: ${missing.map(label).join(', ')}.` }
        : { status: 'pass', evidence: 'C/I·P/L·B/L 3종이 모두 구비되었습니다.' };
    },
  },
];
