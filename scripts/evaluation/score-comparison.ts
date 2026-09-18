/**
 * 문서 간 불일치 탐지 채점 (양성 = mismatch)
 *
 * npx tsx scripts/evaluation/score-comparison.ts \
 *   --gold evaluation/templates/comparisons.csv --pred <predictions.json> --out <summary.json>
 */
import { f1Score, isDirectRun, parseArgs, ratio, readCsvFile, readJson, requireColumns, requireOption, writeJson, type Ratio, type ScoreSummaryBase } from './lib';

export type ComparisonResult = 'match' | 'mismatch' | 'not_comparable';

export interface ComparisonPrediction {
  trade_id: string;
  field_key: string;
  predicted_result?: ComparisonResult | string | null;
}

export interface ComparisonPredictionFile {
  runId?: string;
  comparisons: ComparisonPrediction[];
}

export interface ComparisonSummary extends ScoreSummaryBase {
  confusion: { truePositive: number; falsePositive: number; falseNegative: number; trueNegative: number };
  metrics: {
    precision: Ratio;
    recall: Ratio;
    f1: number | null;
  };
  counts: {
    comparableGold: number;
    actualMismatch: number;
    actualMatch: number;
    /** 정답이 not_comparable 이라 분모에서 뺀 항목 */
    notComparableGold: number;
    /** 정답은 not_comparable 인데 mismatch 로 예측 */
    mismatchPredictedOnNotComparable: number;
    /** 정답은 비교 가능한데 not_comparable 로 예측 */
    notComparablePredictedOnComparable: number;
    /** 정답 행에 대응하는 예측이 없음 */
    missingPrediction: number;
    invalidGoldRows: number;
  };
  byField: Record<string, { truePositive: number; falsePositive: number; falseNegative: number; trueNegative: number; recall: Ratio }>;
}

const USAGE = 'score-comparison.ts --gold <comparisons.csv> --pred <pred.json> --out <summary.json>';

export function scoreComparison(
  gold: Array<Record<string, string>>,
  predictions: ComparisonPredictionFile,
  options: { runId?: string } = {},
): ComparisonSummary {
  requireColumns(gold, ['trade_id', 'field_key', 'expected_result'], 'comparisons.csv');
  const predicted = new Map(predictions.comparisons.map((p) => [`${p.trade_id}\u0000${p.field_key}`, p.predicted_result ?? null]));

  const confusion = { truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0 };
  const counts = {
    comparableGold: 0, actualMismatch: 0, actualMatch: 0, notComparableGold: 0,
    mismatchPredictedOnNotComparable: 0, notComparablePredictedOnComparable: 0, missingPrediction: 0, invalidGoldRows: 0,
  };
  const byField: Record<string, { truePositive: number; falsePositive: number; falseNegative: number; trueNegative: number }> = {};

  for (const row of gold) {
    const expected = row.expected_result as ComparisonResult;
    const prediction = predicted.get(`${row.trade_id}\u0000${row.field_key}`);
    if (prediction === undefined || prediction === null) counts.missingPrediction += 1;

    if (expected === 'not_comparable') {
      counts.notComparableGold += 1;
      if (prediction === 'mismatch') counts.mismatchPredictedOnNotComparable += 1;
      continue;
    }
    if (expected !== 'match' && expected !== 'mismatch') { counts.invalidGoldRows += 1; continue; }

    counts.comparableGold += 1;
    if (prediction === 'not_comparable') counts.notComparablePredictedOnComparable += 1;
    const field = (byField[row.field_key] ??= { truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0 });
    const predictedMismatch = prediction === 'mismatch';

    if (expected === 'mismatch') {
      counts.actualMismatch += 1;
      if (predictedMismatch) { confusion.truePositive += 1; field.truePositive += 1; } else { confusion.falseNegative += 1; field.falseNegative += 1; }
    } else {
      counts.actualMatch += 1;
      if (predictedMismatch) { confusion.falsePositive += 1; field.falsePositive += 1; } else { confusion.trueNegative += 1; field.trueNegative += 1; }
    }
  }

  const precision = ratio(confusion.truePositive, confusion.truePositive + confusion.falsePositive);
  const recall = ratio(confusion.truePositive, confusion.truePositive + confusion.falseNegative);
  return {
    scorer: 'comparison',
    runId: options.runId ?? predictions.runId ?? '',
    generatedAt: new Date().toISOString(),
    confusion,
    metrics: { precision, recall, f1: f1Score(precision.value, recall.value) },
    counts,
    byField: Object.fromEntries(Object.entries(byField).map(([key, c]) => [key, { ...c, recall: ratio(c.truePositive, c.truePositive + c.falseNegative) }])),
  };
}

if (isDirectRun(import.meta.url)) {
  const { options } = parseArgs(process.argv.slice(2));
  const goldPath = requireOption(options, 'gold', USAGE);
  const predPath = requireOption(options, 'pred', USAGE);
  const out = requireOption(options, 'out', USAGE);
  const gold = readCsvFile(goldPath);
  const pred = readJson<ComparisonPredictionFile>(predPath);
  writeJson(out, scoreComparison(gold, pred));
  console.log(`불일치 탐지 채점 완료 → ${out}`);
}
