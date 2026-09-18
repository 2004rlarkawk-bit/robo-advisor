/**
 * 문서 분류 채점
 *
 * npx tsx scripts/evaluation/score-document-classification.ts \
 *   --gold evaluation/templates/documents.csv --pred <predictions.json> --out <summary.json> [--split test]
 */
import { isDirectRun, parseArgs, ratio, readCsvFile, readJson, requireColumns, requireOption, writeJson, type Ratio, type ScoreSummaryBase } from './lib';

export interface ClassificationPrediction {
  document_id: string;
  predicted_type?: string | null;
  error?: string | null;
}

export interface ClassificationPredictionFile {
  runId?: string;
  documents: ClassificationPrediction[];
}

export interface ClassificationSummary extends ScoreSummaryBase {
  split: string | null;
  metrics: {
    classificationAccuracy: Ratio;
    processingSuccessRate: Ratio;
  };
  byExpectedType: Record<string, Ratio>;
  bySourceKind: Record<string, Ratio>;
  /** confusionMatrix[정답][예측] = 건수. 예측 실패는 '(error)', 예측 없음은 '(missing)' */
  confusionMatrix: Record<string, Record<string, number>>;
  unmatchedPredictionIds: string[];
}

const USAGE = 'score-document-classification.ts --gold <documents.csv> --pred <pred.json> --out <summary.json> [--split dev|test]';

export function scoreDocumentClassification(
  gold: Array<Record<string, string>>,
  predictions: ClassificationPredictionFile,
  options: { split?: string | null; runId?: string } = {},
): ClassificationSummary {
  requireColumns(gold, ['document_id', 'expected_type', 'dataset_split', 'source_kind'], 'documents.csv');
  const split = options.split ?? null;
  const rows = gold.filter((row) => !split || row.dataset_split === split);
  const byId = new Map(predictions.documents.map((prediction) => [prediction.document_id, prediction]));

  let correct = 0;
  let succeeded = 0;
  const typeCounts: Record<string, { n: number; d: number }> = {};
  const kindCounts: Record<string, { n: number; d: number }> = {};
  const confusion: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    const expected = row.expected_type;
    const prediction = byId.get(row.document_id);
    const failed = !prediction || Boolean(prediction.error);
    const predicted = !prediction ? '(missing)' : prediction.error ? '(error)' : (prediction.predicted_type || '(missing)');
    const ok = !failed && predicted === expected;
    if (!failed && predicted !== '(missing)') succeeded += 1;
    if (ok) correct += 1;

    typeCounts[expected] ??= { n: 0, d: 0 };
    typeCounts[expected].d += 1;
    if (ok) typeCounts[expected].n += 1;

    const kind = row.source_kind || '(unspecified)';
    kindCounts[kind] ??= { n: 0, d: 0 };
    kindCounts[kind].d += 1;
    if (ok) kindCounts[kind].n += 1;

    confusion[expected] ??= {};
    confusion[expected][predicted] = (confusion[expected][predicted] ?? 0) + 1;
  }

  const goldIds = new Set(rows.map((row) => row.document_id));
  return {
    scorer: 'document-classification',
    runId: options.runId ?? predictions.runId ?? '',
    generatedAt: new Date().toISOString(),
    split,
    metrics: {
      classificationAccuracy: ratio(correct, rows.length),
      processingSuccessRate: ratio(succeeded, rows.length),
    },
    byExpectedType: Object.fromEntries(Object.entries(typeCounts).map(([key, { n, d }]) => [key, ratio(n, d)])),
    bySourceKind: Object.fromEntries(Object.entries(kindCounts).map(([key, { n, d }]) => [key, ratio(n, d)])),
    confusionMatrix: confusion,
    unmatchedPredictionIds: predictions.documents.map((p) => p.document_id).filter((id) => !goldIds.has(id)),
  };
}

if (isDirectRun(import.meta.url)) {
  const { options } = parseArgs(process.argv.slice(2));
  const goldPath = requireOption(options, 'gold', USAGE);
  const predPath = requireOption(options, 'pred', USAGE);
  const out = requireOption(options, 'out', USAGE);
  const gold = readCsvFile(goldPath);
  const pred = readJson<ClassificationPredictionFile>(predPath);
  const summary = scoreDocumentClassification(gold, pred, { split: typeof options.split === 'string' ? options.split : null });
  writeJson(out, summary);
  console.log(`문서 분류 채점 완료 → ${out}`);
}
