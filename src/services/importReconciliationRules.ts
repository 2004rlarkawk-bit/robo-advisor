import type { ValidationSeverity } from '../types';
import type {
  ImportDocFields,
  ImportDocumentType,
  ImportReconciliationInput,
  ReconciliationStatus,
} from '../types/importTrade';
import { parseTradeNumber } from '../utils/number';

export const WEIGHT_TOLERANCE = { pct: 0.005, abs: 1 } as const;
export const AMOUNT_TOLERANCE = { pct: 0.01, abs: 1 } as const;
export const DESC_MIN_OVERLAP = 0.5;
export const STANDARD_INCOTERMS = new Set([
  'EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
]);

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
const CO: ImportDocumentType = 'certificate_of_origin';
const INS: ImportDocumentType = 'insurance_policy';
const DOC_LABEL: Partial<Record<ImportDocumentType, string>> = {
  commercial_invoice: 'C/I', packing_list: 'P/L', bill_of_lading: 'B/L',
  certificate_of_origin: 'C/O', insurance_policy: '보험증권',
};
/** CIF·CIP 조건의 관행적 최소 보험금액 = 송장금액 × 110% (Incoterms 2020 A5, UCP 600 제28조 f항 ii). */
export const INSURANCE_COVERAGE_RATIO = 1.1;

/** 국가명 표기 차이("KOREA" / "Republic of Korea" / "KR" / "대한민국")를 흡수하는 비교 키. */
const COUNTRY_KEYS: Array<[RegExp, string]> = [
  [/korea|한국|대한민국|\bkr\b/i, 'KR'], [/japan|일본|\bjp\b/i, 'JP'], [/china|중국|\bcn\b/i, 'CN'],
  [/united states|u\.?s\.?a\.?|america|미국|\bus\b/i, 'US'], [/viet ?nam|베트남|\bvn\b/i, 'VN'],
  [/thailand|태국|\bth\b/i, 'TH'], [/taiwan|대만|\btw\b/i, 'TW'], [/germany|독일|\bde\b/i, 'DE'],
  [/italy|이탈리아|\bit\b/i, 'IT'], [/france|프랑스|\bfr\b/i, 'FR'], [/india|인도(?!네시아)|\bin\b/i, 'IN'],
  [/indonesia|인도네시아|\bid\b/i, 'ID'], [/malaysia|말레이시아|\bmy\b/i, 'MY'], [/singapore|싱가포르|\bsg\b/i, 'SG'],
];
export function countryKey(value?: string): string {
  const text = (value ?? '').trim();
  if (!text) return '';
  for (const [pattern, code] of COUNTRY_KEYS) if (pattern.test(text)) return code;
  return text.toLowerCase().replace(/[^a-z가-힣]/g, '');
}
/** 항구명 비교 키 — "BUSAN, KOREA" / "Busan Port" / "KRPUS Busan" 를 같은 항구로 본다. */
export function portComparisonKey(value?: string): string {
  return (value ?? '')
    .normalize('NFKC').toLowerCase()
    .replace(/\b(sea ?port|port of|port|harbou?r|terminal|pt)\b/g, ' ')
    .replace(/\b[a-z]{2}[a-z2-9]{3}\b/g, ' ')            // LOCODE 제거
    .replace(/,.*$/, '')                                  // ", KOREA" 등 국가 접미 제거
    .replace(/[^a-z0-9가-힣]/g, '');
}
/** 회사명 비교 키 — 법인 접미(CO., LTD / INC / CORP)와 구두점 차이를 무시한다. */
export function partyKey(value?: string): string {
  return (value ?? '')
    .normalize('NFKC').toLowerCase()
    .replace(/\b(co|ltd|limited|inc|corp|corporation|company|llc|gmbh|plc|pte|kk|주식회사|㈜)\b\.?/g, ' ')
    .replace(/[^a-z0-9가-힣]/g, '');
}
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
      const ci = parseTradeNumber(get(input, CI)?.quantity);
      const pl = parseTradeNumber(get(input, PL)?.quantity);
      if (ci == null || pl == null) return { status: 'skip', evidence: 'C/I 또는 P/L 수량 값이 없어 대조할 수 없습니다.' };
      return ci === pl
        ? { status: 'pass', evidence: `수량 일치: C/I·P/L 모두 ${formatNumber(ci)}.` }
        : { status: 'fail', evidence: `C/I 수량 ${formatNumber(ci)} vs P/L 수량 ${formatNumber(pl)} -> ${formatNumber(Math.abs(ci - pl))} 차이.` };
    },
  },
  {
    id: 'IR3', label: '총중량 일치', severity: 'error', documents: [PL, BL],
    evaluate: (input) => {
      const pl = parseTradeNumber(get(input, PL)?.grossWeight);
      const bl = parseTradeNumber(get(input, BL)?.grossWeight);
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
      const net = parseTradeNumber(get(input, PL)?.netWeight);
      const gross = parseTradeNumber(get(input, PL)?.grossWeight);
      if (net == null || gross == null) return { status: 'skip', evidence: 'P/L 순중량 또는 총중량 값이 없어 대조할 수 없습니다.' };
      return net <= gross
        ? { status: 'pass', evidence: `순중량(${formatNumber(net)}kg) ≤ 총중량(${formatNumber(gross)}kg).` }
        : { status: 'fail', evidence: `순중량 ${formatNumber(net)}kg이 총중량 ${formatNumber(gross)}kg보다 큽니다.` };
    },
  },
  {
    id: 'IR5', label: '포장 수량 일치', severity: 'error', documents: [PL, BL],
    evaluate: (input) => {
      const pl = parseTradeNumber(get(input, PL)?.packageCount);
      const bl = parseTradeNumber(get(input, BL)?.packageCount);
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
      const unitPrice = parseTradeNumber(ci?.unitPrice);
      const quantity = parseTradeNumber(ci?.quantity);
      const total = parseTradeNumber(ci?.totalAmount);
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
    id: 'IR11', label: '원산지 일치 (C/O ↔ C/I)', severity: 'error', documents: [CO, CI],
    evaluate: (input) => {
      const co = get(input, CO)?.originCountry?.trim();
      const ci = get(input, CI)?.originCountry?.trim();
      if (!co || !ci) return { status: 'skip', evidence: 'C/O 또는 C/I에 원산지 표기가 없어 대조할 수 없습니다.' };
      return countryKey(co) === countryKey(ci)
        ? { status: 'pass', evidence: `원산지 일치: C/O "${co}", C/I "${ci}".` }
        : { status: 'fail', evidence: `원산지 불일치: C/O "${co}" vs C/I "${ci}" -> 협정세율(FTA) 적용이 거부될 수 있습니다.` };
    },
  },
  {
    id: 'IR12', label: '선적항·도착항 일치 (B/L ↔ C/I)', severity: 'error', documents: [BL, CI],
    evaluate: (input) => {
      const bl = get(input, BL); const ci = get(input, CI);
      const pairs: Array<[string, string | undefined, string | undefined]> = [
        ['선적항', bl?.loadPort, ci?.loadPort], ['도착항', bl?.dischargePort, ci?.dischargePort],
      ];
      const comparable = pairs.filter(([, a, b]) => a?.trim() && b?.trim());
      if (!comparable.length) return { status: 'skip', evidence: 'B/L과 C/I 양쪽에 항구 표기가 있는 항목이 없어 대조할 수 없습니다.' };
      const mismatched = comparable.filter(([, a, b]) => portComparisonKey(a) !== portComparisonKey(b));
      return mismatched.length
        ? { status: 'fail', evidence: mismatched.map(([name, a, b]) => `${name} 불일치: B/L "${a}" vs C/I "${b}"`).join('; ') + '.' }
        : { status: 'pass', evidence: comparable.map(([name, a]) => `${name} 일치: ${a}`).join(', ') + '.' };
    },
  },
  {
    id: 'IR13', label: 'Consignee 일치 (B/L ↔ C/I)', severity: 'warning', documents: [BL, CI],
    evaluate: (input) => {
      const bl = get(input, BL)?.consignee?.trim();
      const ci = get(input, CI)?.consignee?.trim();
      if (!bl || !ci) return { status: 'skip', evidence: 'B/L 또는 C/I에 Consignee 표기가 없어 대조할 수 없습니다.' };
      const a = partyKey(bl), b = partyKey(ci);
      const same = a === b || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a)));
      return same
        ? { status: 'pass', evidence: `Consignee 일치: "${bl}".` }
        : { status: 'fail', evidence: `Consignee 불일치: B/L "${bl}" vs C/I "${ci}" -> 화물 인수 주체가 달라 통관·화물 인도에서 문제가 됩니다.` };
    },
  },
  {
    id: 'IR14', label: '보험금액 담보 (보험증권 ↔ C/I)', severity: 'warning', documents: [INS, CI],
    evaluate: (input) => {
      const ins = get(input, INS); const ci = get(input, CI);
      const insured = parseTradeNumber(ins?.insuredAmount);
      const invoice = parseTradeNumber(ci?.totalAmount);
      if (insured == null || invoice == null) return { status: 'skip', evidence: '보험증권 보험금액 또는 C/I 총액이 없어 담보 범위를 확인할 수 없습니다.' };
      const insCur = (ins?.insuredCurrency ?? '').trim().toUpperCase();
      const ciCur = (ci?.currency ?? '').trim().toUpperCase();
      if (insCur && ciCur && insCur !== ciCur) {
        return { status: 'fail', evidence: `보험금액 통화(${insCur})가 송장 통화(${ciCur})와 달라 담보 범위를 비교할 수 없습니다.` };
      }
      const required = invoice * INSURANCE_COVERAGE_RATIO;
      return insured + 0.005 >= required
        ? { status: 'pass', evidence: `보험금액 ${formatNumber(insured)} ≥ 송장금액 ${formatNumber(invoice)} × 110% = ${formatNumber(Math.round(required * 100) / 100)}.` }
        : { status: 'fail', evidence: `보험금액 ${formatNumber(insured)}이 송장금액 × 110% (${formatNumber(Math.round(required * 100) / 100)})에 미달합니다. CIF·CIP 관행상 담보 부족.` };
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
