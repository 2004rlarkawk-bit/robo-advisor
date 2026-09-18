/**
 * 반복 실행(예: 3회) 결과 집계 — 평균·최소·최대·실행별 분자/분모·실패 실행 수
 *
 * npx tsx scripts/evaluation/aggregate-runs.ts --out <aggregate.json> [--csv <aggregate.csv>] <summary1.json> <summary2.json> ...
 */
import { existsSync } from 'node:fs';
import { isDirectRun, parseArgs, readJson, toCsv, writeJson, writeText, type Ratio } from './lib';

export interface RunMetricPoint {
  runId: string;
  source: string;
  numerator: number | null;
  denominator: number | null;
  value: number | null;
}

export interface AggregatedMetric {
  mean: number | null;
  min: number | null;
  max: number | null;
  /** 값이 있는(분모>0) 실행 수 */
  runsWithValue: number;
  runs: RunMetricPoint[];
}

export interface AggregateResult {
  generatedAt: string;
  scorers: Record<string, { runCount: number; metrics: Record<string, AggregatedMetric> }>;
  failedRuns: Array<{ source: string; reason: string }>;
}

export interface SummaryInput {
  source: string;
  /** 읽지 못했거나 실행 실패로 표시된 경우 null */
  summary: { scorer?: string; runId?: string; status?: string; metrics?: Record<string, unknown> } | null;
  error?: string;
}

function isRatio(value: unknown): value is Ratio {
  return typeof value === 'object' && value !== null && 'numerator' in value && 'denominator' in value && 'value' in value;
}

export function aggregateRuns(inputs: SummaryInput[]): AggregateResult {
  const failedRuns: AggregateResult['failedRuns'] = [];
  const grouped: Record<string, { runCount: number; points: Record<string, RunMetricPoint[]> }> = {};

  for (const input of inputs) {
    const summary = input.summary;
    if (!summary || summary.status === 'failed' || !summary.scorer || !summary.metrics) {
      failedRuns.push({ source: input.source, reason: input.error ?? (summary?.status === 'failed' ? '실행 실패로 표시됨' : '요약 형식이 올바르지 않음') });
      continue;
    }
    const group = (grouped[summary.scorer] ??= { runCount: 0, points: {} });
    group.runCount += 1;
    for (const [name, metric] of Object.entries(summary.metrics)) {
      const point: RunMetricPoint = isRatio(metric)
        ? { runId: summary.runId ?? '', source: input.source, numerator: metric.numerator, denominator: metric.denominator, value: metric.value }
        : { runId: summary.runId ?? '', source: input.source, numerator: null, denominator: null, value: typeof metric === 'number' && Number.isFinite(metric) ? metric : null };
      (group.points[name] ??= []).push(point);
    }
  }

  const scorers: AggregateResult['scorers'] = {};
  for (const [scorer, group] of Object.entries(grouped)) {
    const metrics: Record<string, AggregatedMetric> = {};
    for (const [name, points] of Object.entries(group.points)) {
      const values = points.map((p) => p.value).filter((v): v is number => v !== null && Number.isFinite(v));
      metrics[name] = {
        mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
        runsWithValue: values.length,
        runs: points,
      };
    }
    scorers[scorer] = { runCount: group.runCount, metrics };
  }
  return { generatedAt: new Date().toISOString(), scorers, failedRuns };
}

export function aggregateToCsv(result: AggregateResult): string {
  const rows: Array<Record<string, string | number | null>> = [];
  for (const [scorer, { metrics }] of Object.entries(result.scorers)) {
    for (const [metric, agg] of Object.entries(metrics)) {
      for (const run of agg.runs) {
        rows.push({ scorer, metric, runId: run.runId, numerator: run.numerator, denominator: run.denominator, value: run.value, mean: agg.mean, min: agg.min, max: agg.max });
      }
    }
  }
  return toCsv(rows, ['scorer', 'metric', 'runId', 'numerator', 'denominator', 'value', 'mean', 'min', 'max']);
}

if (isDirectRun(import.meta.url)) {
  const { options, positional } = parseArgs(process.argv.slice(2));
  if (!positional.length || typeof options.out !== 'string') {
    console.error('사용법: aggregate-runs.ts --out <aggregate.json> [--csv <aggregate.csv>] <summary.json> ...');
    process.exit(2);
  }
  const inputs: SummaryInput[] = positional.map((source) => {
    if (!existsSync(source)) return { source, summary: null, error: '파일 없음' };
    try { return { source, summary: readJson(source) }; } catch (error) { return { source, summary: null, error: `JSON 읽기 실패: ${(error as Error).message}` }; }
  });
  const result = aggregateRuns(inputs);
  writeJson(options.out, result);
  if (typeof options.csv === 'string') writeText(options.csv, aggregateToCsv(result));
  console.log(`집계 완료 → ${options.out} (실패 실행 ${result.failedRuns.length}건)`);
}
