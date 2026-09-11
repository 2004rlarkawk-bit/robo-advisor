import type {
  ImportAnalysisResult,
  ImportDocFields,
  ImportDocumentType,
  ImportReconciliationInput,
  ReconciliationRuleResult,
} from '../types/importTrade';
import { IMPORT_RECONCILIATION_RULES } from './importReconciliationRules';
import { isAbsentTradeValue } from '../utils/tradeValueNormalization';

export function runImportReconciliation(input: ImportReconciliationInput): ReconciliationRuleResult[] {
  return IMPORT_RECONCILIATION_RULES.map((rule) => {
    const outcome = rule.evaluate(input);
    return {
      ruleId: rule.id,
      label: rule.label,
      severity: rule.severity,
      status: outcome.status,
      passed: outcome.status === 'pass',
      blocking: rule.blocking ?? false,
      evidence: outcome.evidence,
      documents: rule.documents,
    };
  });
}

export function summarizeReconciliation(results: ReconciliationRuleResult[]) {
  const failed = results.filter((result) => result.status === 'fail');
  return {
    total: results.length,
    passed: results.filter((result) => result.status === 'pass').length,
    skipped: results.filter((result) => result.status === 'skip').length,
    failed: failed.length,
    errors: failed.filter((result) => result.severity === 'error').length,
    warnings: failed.filter((result) => result.severity === 'warning').length,
  };
}

const CI: ImportDocumentType = 'commercial_invoice';
const PL: ImportDocumentType = 'packing_list';
const BL: ImportDocumentType = 'bill_of_lading';
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
function meaningful(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return isAbsentTradeValue(trimmed) ? undefined : trimmed;
}

export function buildReconciliationInput(
  analysis: ImportAnalysisResult,
  presentTypes: ImportDocumentType[],
): ImportReconciliationInput {
  const input: ImportReconciliationInput = {};
  const present = new Set(presentTypes.filter((type) => type === CI || type === PL || type === BL));
  present.forEach((type) => { input[type] = {}; });
  const assign = (type: ImportDocumentType, key: keyof ImportDocFields, value?: string) => {
    const normalized = meaningful(value);
    if (!present.has(type) || normalized === undefined) return;
    const bucket = input[type] ?? (input[type] = {});
    if (bucket[key] === undefined) bucket[key] = normalized;
  };
  for (const row of analysis.comparison ?? []) {
    const key = FIELD_ALIASES.find(([, pattern]) => pattern.test(row.field ?? ''))?.[0];
    if (!key) continue;
    assign(CI, key, row.invoice);
    assign(PL, key, row.packingList);
    assign(BL, key, row.billOfLading);
  }
  if (present.has(CI)) {
    assign(CI, 'currency', analysis.extracted.currency);
    assign(CI, 'totalAmount', analysis.extracted.totalAmount);
    assign(CI, 'incoterms', analysis.extracted.incoterms);
  }
  return input;
}

export function reconcileFromAnalysis(
  analysis: ImportAnalysisResult,
  presentTypes: ImportDocumentType[],
): ReconciliationRuleResult[] {
  return runImportReconciliation(buildReconciliationInput(analysis, presentTypes));
}
