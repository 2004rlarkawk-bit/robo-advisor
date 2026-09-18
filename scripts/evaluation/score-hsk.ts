/**
 * HSK 추천 채점 (Top-1 / Top-3)
 *
 * npx tsx scripts/evaluation/score-hsk.ts \
 *   --gold evaluation/templates/hsk_items.csv --pred <predictions.json> --out <summary.json> \
 *   [--hs-codes public/data/hsCodes.json]
 */
import { isDirectRun, loadOfficialHskSet, parseArgs, ratio, readCsvFile, readJson, requireColumns, requireOption, writeJson, type Ratio, type ScoreSummaryBase } from './lib';
import { hskMatches, normalizeHsk } from './normalize';

export interface HskPrediction {
  item_id: string;
  /** 추천 순서대로 */
  candidates?: string[] | null;
  error?: string | null;
}

export interface HskPredictionFile {
  runId?: string;
  items: HskPrediction[];
}

export interface HskSummary extends ScoreSummaryBase {
  split: string | null;
  metrics: { top1: Ratio; top3: Ratio };
  counts: {
    itemsWithReference: number;
    itemsWithoutReference: number;
    /** 추천 후보가 0개(또는 예측 없음·오류) */
    emptyRecommendation: number;
    /** 공식 HSK 사전에 없는 10자리 추천 코드 수(후보 단위). 사전을 못 읽으면 null */
    unofficialCandidateCodes: number | null;
    /** 10자리가 아닌 추천 코드 수(후보 단위) */
    nonTenDigitCandidateCodes: number;
    /** 참조 HSK가 10자리 미만이라 앞자리 일치로 채점한 품목 */
    prefixMatchedItems: number;
  };
  byReferenceSource: Record<string, { top1: Ratio; top3: Ratio }>;
}

const USAGE = 'score-hsk.ts --gold <hsk_items.csv> --pred <pred.json> --out <summary.json> [--hs-codes public/data/hsCodes.json] [--split test]';

export function scoreHsk(
  gold: Array<Record<string, string>>,
  predictions: HskPredictionFile,
  options: { officialCodes?: Set<string> | null; split?: string | null; runId?: string } = {},
): HskSummary {
  requireColumns(gold, ['item_id', 'reference_hsk', 'reference_source', 'dataset_split'], 'hsk_items.csv');
  const split = options.split ?? null;
  const official = options.officialCodes ?? null;
  const byId = new Map(predictions.items.map((item) => [item.item_id, item]));

  let top1 = 0;
  let top3 = 0;
  let withReference = 0;
  let withoutReference = 0;
  let empty = 0;
  let unofficial = 0;
  let nonTenDigit = 0;
  let prefix = 0;
  const bySource: Record<string, { t1: number; t3: number; d: number }> = {};

  for (const row of gold) {
    if (split && row.dataset_split !== split) continue;
    const prediction = byId.get(row.item_id);
    const candidates = prediction && !prediction.error ? (prediction.candidates ?? []).map(normalizeHsk).filter(Boolean) : [];
    if (candidates.length === 0) empty += 1;
    for (const code of candidates) {
      if (code.length !== 10) nonTenDigit += 1;
      else if (official && !official.has(code)) unofficial += 1;
    }

    const reference = normalizeHsk(row.reference_hsk);
    if (!reference) { withoutReference += 1; continue; }
    withReference += 1;
    if (reference.length < 10) prefix += 1;

    const hit1 = candidates.length > 0 && hskMatches(reference, candidates[0]);
    const hit3 = candidates.slice(0, 3).some((code) => hskMatches(reference, code));
    if (hit1) top1 += 1;
    if (hit3) top3 += 1;

    const source = row.reference_source || '(unspecified)';
    bySource[source] ??= { t1: 0, t3: 0, d: 0 };
    bySource[source].d += 1;
    if (hit1) bySource[source].t1 += 1;
    if (hit3) bySource[source].t3 += 1;
  }

  return {
    scorer: 'hsk',
    runId: options.runId ?? predictions.runId ?? '',
    generatedAt: new Date().toISOString(),
    split,
    metrics: { top1: ratio(top1, withReference), top3: ratio(top3, withReference) },
    counts: {
      itemsWithReference: withReference,
      itemsWithoutReference: withoutReference,
      emptyRecommendation: empty,
      unofficialCandidateCodes: official ? unofficial : null,
      nonTenDigitCandidateCodes: nonTenDigit,
      prefixMatchedItems: prefix,
    },
    byReferenceSource: Object.fromEntries(Object.entries(bySource).map(([key, c]) => [key, { top1: ratio(c.t1, c.d), top3: ratio(c.t3, c.d) }])),
  };
}

if (isDirectRun(import.meta.url)) {
  const { options } = parseArgs(process.argv.slice(2));
  const goldPath = requireOption(options, 'gold', USAGE);
  const predPath = requireOption(options, 'pred', USAGE);
  const out = requireOption(options, 'out', USAGE);
  const gold = readCsvFile(goldPath);
  const pred = readJson<HskPredictionFile>(predPath);
  const hsPath = typeof options['hs-codes'] === 'string' ? options['hs-codes'] : 'public/data/hsCodes.json';
  let officialCodes: Set<string> | null = null;
  try { officialCodes = loadOfficialHskSet(hsPath); } catch { console.warn(`공식 HSK 사전을 읽지 못했습니다(${hsPath}) — 비공식 코드 수는 null로 기록됩니다.`); }
  writeJson(out, scoreHsk(gold, pred, { officialCodes, split: typeof options.split === 'string' ? options.split : null }));
  console.log(`HSK 채점 완료 → ${out}`);
}
