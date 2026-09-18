/**
 * 필드 추출 채점
 *
 * npx tsx scripts/evaluation/score-field-extraction.ts \
 *   --gold evaluation/templates/fields.csv --pred <predictions.json> --out <summary.json> \
 *   [--ports public/data/unlocodePorts.json]
 */
import type { PortEntry } from '../../src/services/portLocodeService';
import {
  isDirectRun, loadPortEntries, parseArgs, parseBoolean, ratio, readCsvFile, readJson, requireColumns, requireOption, writeJson,
  type Ratio, type ScoreSummaryBase,
} from './lib';
import {
  NORMALIZATION_VERSION, companyRelaxedEqual, isEvaluationMode, isMissingValue, judgeField, strictEqual,
  type EvaluationMode,
} from './normalize';

export interface FieldPrediction {
  document_id: string;
  field_key: string;
  predicted_value?: string | null;
}

export interface FieldPredictionFile {
  runId?: string;
  fields: FieldPrediction[];
}

interface Counter { strict: number; normalized: number; missing: number; wrong: number; total: number }

const emptyCounter = (): Counter => ({ strict: 0, normalized: 0, missing: 0, wrong: 0, total: 0 });

export interface FieldExtractionSummary extends ScoreSummaryBase {
  metrics: {
    strictFieldAccuracy: Ratio;
    normalizedFieldAccuracy: Ratio;
    missingRate: Ratio;
    wrongExtractionRate: Ratio;
  };
  counts: {
    evaluableFields: number;
    notApplicableFields: number;
    /** is_applicable=false 인데 예측값이 있음 */
    valueOnNotApplicable: number;
    missing: number;
    wrongExtraction: number;
    unknownModeRows: number;
  };
  byField: Record<string, { strict: Ratio; normalized: Ratio; missing: number; wrong: number }>;
  byMode: Record<string, { strict: Ratio; normalized: Ratio }>;
  /** company_* 행에 대해 strict·relaxed를 둘 다 계산 */
  company: { rows: number; strict: Ratio; relaxed: Ratio };
}

const USAGE = 'score-field-extraction.ts --gold <fields.csv> --pred <pred.json> --out <summary.json> [--ports public/data/unlocodePorts.json]';

export function scoreFieldExtraction(
  gold: Array<Record<string, string>>,
  predictions: FieldPredictionFile,
  context: { ports?: PortEntry[] | null; runId?: string } = {},
): FieldExtractionSummary {
  requireColumns(gold, ['document_id', 'field_key', 'expected_value', 'expected_unit', 'evaluation_mode', 'is_applicable'], 'fields.csv');
  const predicted = new Map(predictions.fields.map((p) => [`${p.document_id}\u0000${p.field_key}`, p.predicted_value ?? null]));

  const overall = emptyCounter();
  const byField: Record<string, Counter> = {};
  const byMode: Record<string, Counter> = {};
  const company = { rows: 0, strict: 0, relaxed: 0 };
  let notApplicable = 0;
  let valueOnNotApplicable = 0;
  let unknownMode = 0;

  for (const row of gold) {
    const value = predicted.get(`${row.document_id}\u0000${row.field_key}`);
    if (!parseBoolean(row.is_applicable, true)) {
      notApplicable += 1;
      if (!isMissingValue(value)) valueOnNotApplicable += 1;
      continue;
    }
    const mode = row.evaluation_mode;
    if (!isEvaluationMode(mode)) { unknownMode += 1; continue; }

    const judgement = judgeField(mode as EvaluationMode, row.expected_value, row.expected_unit, value, { ports: context.ports ?? null });
    const bumps = [overall, (byField[row.field_key] ??= emptyCounter()), (byMode[mode] ??= emptyCounter())];
    for (const counter of bumps) {
      counter.total += 1;
      if (judgement.strict) counter.strict += 1;
      if (judgement.normalized) counter.normalized += 1;
      if (judgement.missing) counter.missing += 1;
      else if (!judgement.normalized) counter.wrong += 1;
    }

    if (mode === 'company_strict' || mode === 'company_relaxed') {
      company.rows += 1;
      if (!isMissingValue(value) && strictEqual(row.expected_value, value)) company.strict += 1;
      if (!isMissingValue(value) && companyRelaxedEqual(row.expected_value, value)) company.relaxed += 1;
    }
  }

  return {
    scorer: 'field-extraction',
    runId: context.runId ?? predictions.runId ?? '',
    normalizationVersion: NORMALIZATION_VERSION,
    generatedAt: new Date().toISOString(),
    metrics: {
      strictFieldAccuracy: ratio(overall.strict, overall.total),
      normalizedFieldAccuracy: ratio(overall.normalized, overall.total),
      missingRate: ratio(overall.missing, overall.total),
      wrongExtractionRate: ratio(overall.wrong, overall.total),
    },
    counts: {
      evaluableFields: overall.total,
      notApplicableFields: notApplicable,
      valueOnNotApplicable,
      missing: overall.missing,
      wrongExtraction: overall.wrong,
      unknownModeRows: unknownMode,
    },
    byField: Object.fromEntries(Object.entries(byField).map(([key, c]) => [key, {
      strict: ratio(c.strict, c.total), normalized: ratio(c.normalized, c.total), missing: c.missing, wrong: c.wrong,
    }])),
    byMode: Object.fromEntries(Object.entries(byMode).map(([key, c]) => [key, { strict: ratio(c.strict, c.total), normalized: ratio(c.normalized, c.total) }])),
    company: { rows: company.rows, strict: ratio(company.strict, company.rows), relaxed: ratio(company.relaxed, company.rows) },
  };
}

if (isDirectRun(import.meta.url)) {
  const { options } = parseArgs(process.argv.slice(2));
  const goldPath = requireOption(options, 'gold', USAGE);
  const predPath = requireOption(options, 'pred', USAGE);
  const out = requireOption(options, 'out', USAGE);
  const gold = readCsvFile(goldPath);
  const pred = readJson<FieldPredictionFile>(predPath);
  const portsPath = typeof options.ports === 'string' ? options.ports : 'public/data/unlocodePorts.json';
  let ports: PortEntry[] | null = null;
  try { ports = loadPortEntries(portsPath); } catch { console.warn(`항구 사전을 읽지 못했습니다(${portsPath}) — port_locode 행은 모두 불일치로 처리됩니다.`); }
  writeJson(out, scoreFieldExtraction(gold, pred, { ports }));
  console.log(`필드 추출 채점 완료 → ${out}`);
}
