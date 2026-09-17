/**
 * 합성 예제로 채점 → 집계 → 보고서 전체 흐름을 한 번 돌린다 (npm run eval:example).
 * 결과는 PortAI 실제 성능이 아니며, 보고서 상단에 그 사실을 표시한다.
 */
import { join } from 'node:path';
import { aggregateRuns, aggregateToCsv } from './aggregate-runs';
import { buildReport } from './generate-report';
import { loadOfficialHskSet, loadPortEntries, readCsvFile, readJson, writeJson, writeText } from './lib';
import { scoreComparison, type ComparisonPredictionFile } from './score-comparison';
import { scoreDocumentClassification, type ClassificationPredictionFile } from './score-document-classification';
import { scoreFieldExtraction, type FieldPredictionFile } from './score-field-extraction';
import { scoreHsk, type HskPredictionFile } from './score-hsk';

const GOLD = 'evaluation/fixtures/synthetic';
const PRED = 'evaluation/examples/predictions';
const OUT = 'evaluation/examples/reports';

const ports = loadPortEntries('public/data/unlocodePorts.json');
const officialCodes = loadOfficialHskSet('public/data/hsCodes.json');
const gold = {
  documents: readCsvFile(join(GOLD, 'documents.csv')),
  fields: readCsvFile(join(GOLD, 'fields.csv')),
  comparisons: readCsvFile(join(GOLD, 'comparisons.csv')),
  hsk: readCsvFile(join(GOLD, 'hsk_items.csv')),
};

const summaryPaths: string[] = [];
const lastRun: Parameters<typeof buildReport>[0]['summaries'] = [];
for (const run of [1, 2, 3]) {
  const dir = join(PRED, `run-${run}`);
  const summaries = [
    scoreDocumentClassification(gold.documents, readJson<ClassificationPredictionFile>(join(dir, 'classification.json'))),
    scoreFieldExtraction(gold.fields, readJson<FieldPredictionFile>(join(dir, 'fields.json')), { ports }),
    scoreComparison(gold.comparisons, readJson<ComparisonPredictionFile>(join(dir, 'comparisons.json'))),
    scoreHsk(gold.hsk, readJson<HskPredictionFile>(join(dir, 'hsk.json')), { officialCodes }),
  ];
  for (const summary of summaries) {
    const path = join(OUT, 'summary', `run-${run}.${summary.scorer}.json`);
    writeJson(path, summary);
    summaryPaths.push(path);
  }
  if (run === 3) lastRun.push(...summaries);
}

const aggregate = aggregateRuns(summaryPaths.map((source) => ({ source, summary: readJson(source) })));
writeJson(join(OUT, 'aggregate.json'), aggregate);
writeText(join(OUT, 'aggregate.csv'), aggregateToCsv(aggregate));

const manifest = readJson<Record<string, unknown>>('evaluation/templates/manifest.json');
const report = buildReport({
  summaries: lastRun,
  aggregate,
  manifest: { ...manifest, runId: 'example-run-3', datasetVersion: 'synthetic-example', notes: '합성 예제 — 실제 측정 아님' },
  syntheticExample: true,
});
writeText(join(OUT, 'example-report.md'), report);
console.log(`합성 예제 채점 완료 → ${OUT}/example-report.md (실제 PortAI 성능 수치 아님)`);
