/**
 * 채점 요약 JSON(과 집계 JSON·CSV)을 읽어 Markdown 보고서를 만든다.
 *
 * npx tsx scripts/evaluation/generate-report.ts <요약 디렉터리> --out <report.md> [--manifest <manifest.json>] [--synthetic-example]
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AggregateResult } from './aggregate-runs';
import type { ClassificationSummary } from './score-document-classification';
import type { ComparisonSummary } from './score-comparison';
import type { FieldExtractionSummary } from './score-field-extraction';
import type { HskSummary } from './score-hsk';
import { formatPercent, formatRatio, isDirectRun, parseArgs, parseCsv, readJson, readText, writeText } from './lib';

export const SYNTHETIC_EXAMPLE_NOTICE =
  '주의: 아래 값은 합성 예제를 이용해 평가 스크립트의 동작을 확인한 결과이며,\nPortAI의 실제 성능 수치가 아닙니다.';

export const PILOT_NOTICE =
  '이 결과는 제한된 내부 파일럿 데이터셋에 대한 측정값이며, 제품 전체 성능을 대표하거나 정확도를 보장하지 않습니다.';

type AnySummary = ClassificationSummary | FieldExtractionSummary | ComparisonSummary | HskSummary;

export interface ReportInput {
  summaries: AnySummary[];
  aggregate?: AggregateResult | null;
  manifest?: Record<string, unknown> | null;
  csvTables?: Array<{ name: string; rows: Array<Record<string, string>> }>;
  syntheticExample: boolean;
}

const cell = (value: unknown) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(headers: string[], rows: Array<Array<unknown>>): string {
  return [
    `| ${headers.map(cell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

function section(summary: AnySummary): string {
  const run = summary.runId ? ` (run: ${summary.runId})` : '';
  switch (summary.scorer) {
    case 'document-classification': {
      const s = summary as ClassificationSummary;
      return [
        `### 문서 분류${run}`, '',
        table(['지표', '값 (분자/분모)'], [
          ['Classification Accuracy', formatRatio(s.metrics.classificationAccuracy)],
          ['Processing Success Rate', formatRatio(s.metrics.processingSuccessRate)],
        ]),
        '',
        '문서 유형별', '',
        table(['정답 유형', '정확도'], Object.entries(s.byExpectedType).map(([type, r]) => [type, formatRatio(r)])),
        '',
        '데이터 구분별', '',
        table(['source_kind', '정확도'], Object.entries(s.bySourceKind).map(([kind, r]) => [kind, formatRatio(r)])),
      ].join('\n');
    }
    case 'field-extraction': {
      const s = summary as FieldExtractionSummary;
      return [
        `### 필드 추출${run}`, '',
        table(['지표', '값 (분자/분모)'], [
          ['Strict Field Accuracy', formatRatio(s.metrics.strictFieldAccuracy)],
          ['Normalized Field Accuracy', formatRatio(s.metrics.normalizedFieldAccuracy)],
          ['Missing Rate', formatRatio(s.metrics.missingRate)],
          ['Wrong Extraction Rate', formatRatio(s.metrics.wrongExtractionRate)],
          ['회사명 strict', formatRatio(s.company.strict)],
          ['회사명 relaxed', formatRatio(s.company.relaxed)],
        ]),
        '',
        `평가 가능 필드 ${s.counts.evaluableFields}개 · 해당 없음(분모 제외) ${s.counts.notApplicableFields}개 · 해당 없는 필드에 값 생성 ${s.counts.valueOnNotApplicable}개 · 누락 ${s.counts.missing}개 · 오추출 ${s.counts.wrongExtraction}개 · 정규화 ${s.normalizationVersion ?? ''}`,
        '',
        table(['필드', 'strict', 'normalized', '누락', '오추출'], Object.entries(s.byField).map(([field, r]) => [field, formatRatio(r.strict), formatRatio(r.normalized), r.missing, r.wrong])),
      ].join('\n');
    }
    case 'comparison': {
      const s = summary as ComparisonSummary;
      return [
        `### 불일치 탐지${run}`, '',
        table(['지표', '값'], [
          ['Mismatch Precision', formatRatio(s.metrics.precision)],
          ['Mismatch Recall', formatRatio(s.metrics.recall)],
          ['Mismatch F1', formatPercent(s.metrics.f1)],
        ]),
        '',
        table(['TP', 'FP', 'FN', 'TN', '비교 불가(정답)', '비교 불가인데 불일치 예측', '예측 없음'], [[
          s.confusion.truePositive, s.confusion.falsePositive, s.confusion.falseNegative, s.confusion.trueNegative,
          s.counts.notComparableGold, s.counts.mismatchPredictedOnNotComparable, s.counts.missingPrediction,
        ]]),
      ].join('\n');
    }
    case 'hsk': {
      const s = summary as HskSummary;
      return [
        `### HSK 추천${run}`, '',
        table(['지표', '값 (분자/분모)'], [
          ['HSK Top-1', formatRatio(s.metrics.top1)],
          ['HSK Top-3', formatRatio(s.metrics.top3)],
        ]),
        '',
        `추천 없음 ${s.counts.emptyRecommendation}건 · 공식 사전에 없는 추천 코드 ${s.counts.unofficialCandidateCodes ?? 'N/A'}개 · 10자리 아닌 추천 코드 ${s.counts.nonTenDigitCandidateCodes}개 · 앞자리 일치 채점 ${s.counts.prefixMatchedItems}건`,
        '',
        table(['reference_source', 'Top-1', 'Top-3'], Object.entries(s.byReferenceSource).map(([source, r]) => [source, formatRatio(r.top1), formatRatio(r.top3)])),
      ].join('\n');
    }
    default:
      return `### 알 수 없는 채점 결과 (${(summary as { scorer?: string }).scorer ?? '?'})`;
  }
}

export function buildReport(input: ReportInput): string {
  const lines: string[] = ['# PortAI 평가 보고서', ''];
  if (input.syntheticExample) lines.push(...SYNTHETIC_EXAMPLE_NOTICE.split('\n').map((line) => `> **${line}**`), '');
  else lines.push(`> ${PILOT_NOTICE}`, '');

  if (input.manifest) {
    lines.push('## 실행 정보', '', table(['항목', '값'], Object.entries(input.manifest).map(([key, value]) => [key, value === '' || value === null ? '(미기록)' : value])), '');
  }

  lines.push('## 채점 결과', '');
  if (input.summaries.length === 0) lines.push('채점 요약 파일이 없습니다.', '');
  for (const summary of input.summaries) lines.push(section(summary), '');

  if (input.aggregate) {
    lines.push('## 반복 실행 집계', '');
    for (const [scorer, { runCount, metrics }] of Object.entries(input.aggregate.scorers)) {
      lines.push(`### ${scorer} (${runCount}회)`, '', table(['지표', '평균', '최소', '최대', '실행별 분자/분모'], Object.entries(metrics).map(([name, m]) => [
        name, formatPercent(m.mean), formatPercent(m.min), formatPercent(m.max),
        m.runs.map((r) => (r.denominator === null ? formatPercent(r.value) : `${r.numerator}/${r.denominator}`)).join(', '),
      ])), '');
    }
    lines.push(`실패한 실행: ${input.aggregate.failedRuns.length}건`, '');
  }

  for (const csv of input.csvTables ?? []) {
    if (!csv.rows.length) continue;
    const headers = Object.keys(csv.rows[0]);
    lines.push(`## ${csv.name}`, '', table(headers, csv.rows.map((row) => headers.map((h) => row[h]))), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

if (isDirectRun(import.meta.url)) {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const dir = positional[0];
  if (!dir || typeof options.out !== 'string' || !existsSync(dir)) {
    console.error('사용법: generate-report.ts <요약 디렉터리> --out <report.md> [--manifest <manifest.json>] [--synthetic-example]');
    process.exit(2);
  }
  const summaries: AnySummary[] = [];
  let aggregate: AggregateResult | null = null;
  const csvTables: ReportInput['csvTables'] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (name.endsWith('.csv')) { csvTables.push({ name, rows: parseCsv(readText(path)) }); continue; }
    if (!name.endsWith('.json')) continue;
    const data = readJson<Record<string, unknown>>(path);
    if ('scorers' in data && 'failedRuns' in data) aggregate = data as unknown as AggregateResult;
    else if (typeof data.scorer === 'string') summaries.push(data as unknown as AnySummary);
  }
  const manifest = typeof options.manifest === 'string' ? readJson<Record<string, unknown>>(options.manifest) : null;
  writeText(options.out, buildReport({ summaries, aggregate, manifest, csvTables, syntheticExample: options['synthetic-example'] === true }));
  console.log(`보고서 생성 → ${options.out}`);
}
