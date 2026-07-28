/**
 * 수입 서류 대사(對査) 엔진 — 결정론적 룰 실행기.
 *
 * runImportReconciliation: 문서별 추출필드 입력 → IR1~IR10 실행 → 결과 배열.
 * buildReconciliationInput: 실 OCR(엣지함수 analysis)에서 문서별 입력을 복원하는
 *   어댑터. analysis.extracted는 머지 객체라 교차검증 불가하므로, 문서별 값이 남아있는
 *   analysis.comparison 행을 파싱해 per-doc 구조로 되돌린다(best-effort). 데모
 *   픽스처는 이 어댑터 없이 ImportReconciliationInput을 직접 주입하면 된다.
 */
import type {
  ImportAnalysisResult,
  ImportDocFields,
  ImportDocumentType,
  ImportReconciliationInput,
  ReconciliationRuleResult,
} from '../types/importTrade';
import { IMPORT_RECONCILIATION_RULES } from './importReconciliationRules';

/** 룰 전체를 순서대로 실행. 항상 10건(대사 체크리스트 전체)을 반환한다. */
export function runImportReconciliation(input: ImportReconciliationInput): ReconciliationRuleResult[] {
  return IMPORT_RECONCILIATION_RULES.map((rule) => {
    const outcome = rule.evaluate(input);
    return {
      ruleId: rule.id,
      label: rule.label,
      severity: rule.severity,
      status: outcome.status,
      passed: outcome.status === 'pass',
      evidence: outcome.evidence,
      documents: rule.documents,
    };
  });
}

/** 대사 요약: 미해결(error·fail) 개수 등 — 상위 차단 판단용 */
export function summarizeReconciliation(results: ReconciliationRuleResult[]) {
  const failed = results.filter((r) => r.status === 'fail');
  return {
    total: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    skipped: results.filter((r) => r.status === 'skip').length,
    failed: failed.length,
    blocking: failed.filter((r) => r.severity === 'error').length,
    warnings: failed.filter((r) => r.severity === 'warning').length,
  };
}

// ===== 실 OCR analysis → per-doc 입력 어댑터 =====

const CI: ImportDocumentType = 'commercial_invoice';
const PL: ImportDocumentType = 'packing_list';
const BL: ImportDocumentType = 'bill_of_lading';

/** comparison 행의 자유서식 라벨을 ImportDocFields 키로 매핑 */
const FIELD_ALIASES: Array<[keyof ImportDocFields, RegExp]> = [
  ['productDescription', /(품\s*명|상품|물품|품목|description|item|goods|commodity)/i],
  ['packageCount', /(포장|package|pkg|ctns?|carton|박스|case)/i],
  ['grossWeight', /(총\s*중량|gross|g\.?\s*w)/i],
  ['netWeight', /(순\s*중량|net|n\.?\s*w)/i],
  ['unitPrice', /(단\s*가|unit\s*price)/i],
  ['totalAmount', /(금\s*액|총\s*액|amount|value|total)/i],
  ['quantity', /(수\s*량|q'?ty|quantity|qty)/i],
  ['currency', /(통\s*화|currency)/i],
  ['incoterms', /(incoterms|인코텀|거래\s*조건|price\s*term)/i],
  ['hsCode', /\bhs\b/i],
];

const ABSENT_VALUES = new Set(['', '-', 'n/a', 'na', '없음', '미기재', '해당없음', 'unknown', 'null']);

function meaningful(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  if (ABSENT_VALUES.has(trimmed.toLowerCase())) return undefined;
  return trimmed === '' ? undefined : trimmed;
}

function fieldKeyFor(label: string): keyof ImportDocFields | null {
  return FIELD_ALIASES.find(([, re]) => re.test(label))?.[0] ?? null;
}

/**
 * 엣지함수 analysis + 업로드된 문서 종류 목록 → 대사 입력.
 * presentTypes에 있는 문서만 키를 세팅(IR10 필수서류 판정 근거).
 */
export function buildReconciliationInput(
  analysis: ImportAnalysisResult,
  presentTypes: ImportDocumentType[],
): ImportReconciliationInput {
  const input: ImportReconciliationInput = {};
  const present = new Set(presentTypes.filter((t) => t === CI || t === PL || t === BL));
  // 존재하는 서류는 빈 객체라도 키를 만들어 둔다(누락 판정용).
  present.forEach((type) => { input[type] = {}; });

  const assign = (type: ImportDocumentType, key: keyof ImportDocFields, value?: string) => {
    if (!present.has(type)) return;
    const v = meaningful(value);
    if (v === undefined) return;
    const bucket = input[type] ?? (input[type] = {});
    if (bucket[key] === undefined) bucket[key] = v;
  };

  for (const row of analysis.comparison ?? []) {
    const key = fieldKeyFor(row.field ?? '');
    if (!key) continue;
    assign(CI, key, row.invoice);
    assign(PL, key, row.packingList);
    assign(BL, key, row.billOfLading);
  }

  // 머지 extracted에서 문서 구분이 자명한 단일값을 C/I 보강(통화는 C/I 기준).
  if (present.has(CI)) {
    assign(CI, 'currency', analysis.extracted?.currency);
    assign(CI, 'totalAmount', analysis.extracted?.totalAmount);
  }

  return input;
}

/** 실 OCR analysis를 바로 대사 결과로 변환하는 편의 함수 */
export function reconcileFromAnalysis(
  analysis: ImportAnalysisResult,
  presentTypes: ImportDocumentType[],
): ReconciliationRuleResult[] {
  return runImportReconciliation(buildReconciliationInput(analysis, presentTypes));
}
