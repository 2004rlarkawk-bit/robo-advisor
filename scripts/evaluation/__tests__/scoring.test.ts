import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPORT_RECONCILIATION_RULES } from '../../../src/services/importReconciliationRules';
import { portKey } from '../../../src/services/portLocodeService';
import { aggregateRuns } from '../aggregate-runs';
import { buildReport, SYNTHETIC_EXAMPLE_NOTICE } from '../generate-report';
import { f1Score, formatPercent, formatRatio, parseCsv, ratio } from '../lib';
import { scoreComparison } from '../score-comparison';
import { scoreDocumentClassification } from '../score-document-classification';
import { scoreFieldExtraction } from '../score-field-extraction';
import { scoreHsk } from '../score-hsk';
import { NORMALIZATION_VERSION } from '../normalize';

describe('CSV·지표 유틸', () => {
  it('따옴표 안 쉼표와 "" 이스케이프를 읽는다', () => {
    const rows = parseCsv('a,b\n"x, y","{""k"":""v""}"\n');
    expect(rows).toEqual([{ a: 'x, y', b: '{"k":"v"}' }]);
  });

  it('분모가 0이면 value 는 null 이고 표시는 N/A (NaN 없음)', () => {
    expect(ratio(0, 0)).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(formatRatio(ratio(0, 0))).toBe('N/A (0/0)');
    expect(formatPercent(Number.NaN)).toBe('N/A');
    expect(f1Score(null, 0.5)).toBeNull();
    expect(f1Score(0, 0)).toBeNull();
  });
});

describe('불일치 탐지 채점', () => {
  const gold = [
    { trade_id: 'T1', field_key: 'quantity', expected_result: 'match' },
    { trade_id: 'T1', field_key: 'grossWeight', expected_result: 'match' },
    { trade_id: 'T1', field_key: 'insuredAmount', expected_result: 'not_comparable' },
  ];

  it('실제 불일치가 없는 데이터 — Recall 분모 0, Precision 은 예측이 있을 때만', () => {
    const noPositivePredictions = scoreComparison(gold, { comparisons: [
      { trade_id: 'T1', field_key: 'quantity', predicted_result: 'match' },
      { trade_id: 'T1', field_key: 'grossWeight', predicted_result: 'match' },
    ] });
    expect(noPositivePredictions.metrics.recall).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(noPositivePredictions.metrics.precision.value).toBeNull();
    expect(noPositivePredictions.metrics.f1).toBeNull();
    expect(noPositivePredictions.confusion.trueNegative).toBe(2);
    expect(noPositivePredictions.counts.notComparableGold).toBe(1);

    const falseAlarm = scoreComparison(gold, { comparisons: [{ trade_id: 'T1', field_key: 'quantity', predicted_result: 'mismatch' }] });
    expect(falseAlarm.metrics.precision).toEqual({ numerator: 0, denominator: 1, value: 0 });
    expect(falseAlarm.confusion.falsePositive).toBe(1);
  });

  it('예측이 하나도 없으면 — 실제 불일치는 FN, 지표는 NaN 없이 계산', () => {
    const summary = scoreComparison(
      [...gold, { trade_id: 'T1', field_key: 'packageCount', expected_result: 'mismatch' }],
      { comparisons: [] },
    );
    expect(summary.confusion).toEqual({ truePositive: 0, falsePositive: 0, falseNegative: 1, trueNegative: 2 });
    expect(summary.metrics.precision.value).toBeNull();
    expect(summary.metrics.recall).toEqual({ numerator: 0, denominator: 1, value: 0 });
    expect(summary.metrics.f1).toBeNull();
    expect(summary.counts.missingPrediction).toBe(4);
    expect(JSON.stringify(summary)).not.toContain('NaN');
  });

  it('정답 not_comparable 에 mismatch 예측은 분모에서 빼고 따로 센다', () => {
    const summary = scoreComparison(gold, { comparisons: [{ trade_id: 'T1', field_key: 'insuredAmount', predicted_result: 'mismatch' }] });
    expect(summary.counts.mismatchPredictedOnNotComparable).toBe(1);
    expect(summary.confusion.falsePositive).toBe(0);
  });
});

describe('HSK 채점', () => {
  const gold = [
    { item_id: 'I1', reference_hsk: '6105100000', reference_source: 'team_reference', dataset_split: 'dev' },
  ];

  it('Top-3 안에 정답이 있으면 Top-3 적중, 1순위가 아니면 Top-1 미적중', () => {
    const summary = scoreHsk(gold, { items: [{ item_id: 'I1', candidates: ['6105900000', '6109.10-0000', '6105.10-0000'] }] });
    expect(summary.metrics.top1).toEqual({ numerator: 0, denominator: 1, value: 0 });
    expect(summary.metrics.top3).toEqual({ numerator: 1, denominator: 1, value: 1 });
  });

  it('4순위에만 있으면 Top-3 미적중', () => {
    const summary = scoreHsk(gold, { items: [{ item_id: 'I1', candidates: ['1', '2', '3', '6105100000'] }] });
    expect(summary.metrics.top3.value).toBe(0);
  });

  it('추천 결과가 비어 있으면 미적중으로 세고 추천 없음 건수에 포함', () => {
    const empty = scoreHsk(gold, { items: [{ item_id: 'I1', candidates: [] }] });
    expect(empty.metrics.top1.value).toBe(0);
    expect(empty.metrics.top3.value).toBe(0);
    expect(empty.counts.emptyRecommendation).toBe(1);

    const noPrediction = scoreHsk(gold, { items: [] });
    expect(noPrediction.counts.emptyRecommendation).toBe(1);
  });

  it('공식 사전에 없는 10자리 추천 코드를 센다, 사전이 없으면 null', () => {
    const official = new Set(['6105100000']);
    const summary = scoreHsk(gold, { items: [{ item_id: 'I1', candidates: ['6105100000', '6105999999'] }] }, { officialCodes: official });
    expect(summary.counts.unofficialCandidateCodes).toBe(1);
    expect(scoreHsk(gold, { items: [] }).counts.unofficialCandidateCodes).toBeNull();
  });

  it('참조가 6자리면 앞자리 일치로 채점하고 표시', () => {
    const summary = scoreHsk([{ ...gold[0], reference_hsk: '6105.10' }], { items: [{ item_id: 'I1', candidates: ['6105100000'] }] });
    expect(summary.metrics.top1.value).toBe(1);
    expect(summary.counts.prefixMatchedItems).toBe(1);
  });

  it('참조 HSK가 없는 품목은 분모에서 뺀다', () => {
    const summary = scoreHsk([{ ...gold[0], reference_hsk: '' }], { items: [] });
    expect(summary.metrics.top1).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(summary.counts.itemsWithoutReference).toBe(1);
  });
});

describe('필드 추출 채점', () => {
  it('is_applicable=false 는 분모에서 빼고, 값이 나오면 따로 센다', () => {
    const summary = scoreFieldExtraction([
      { document_id: 'trade:T1', field_key: 'quantity', expected_value: '1500', expected_unit: '', evaluation_mode: 'numeric', is_applicable: 'true' },
      { document_id: 'trade:T1', field_key: 'insuredAmount', expected_value: '', expected_unit: '', evaluation_mode: 'numeric', is_applicable: 'false' },
    ], { fields: [
      { document_id: 'trade:T1', field_key: 'quantity', predicted_value: '1,500' },
      { document_id: 'trade:T1', field_key: 'insuredAmount', predicted_value: '100' },
    ] });
    expect(summary.metrics.normalizedFieldAccuracy).toEqual({ numerator: 1, denominator: 1, value: 1 });
    expect(summary.metrics.strictFieldAccuracy.value).toBe(0);
    expect(summary.counts.notApplicableFields).toBe(1);
    expect(summary.counts.valueOnNotApplicable).toBe(1);
  });

  it('누락과 오추출을 구분하고 회사명 strict/relaxed 를 함께 계산', () => {
    const summary = scoreFieldExtraction([
      { document_id: 'trade:T1', field_key: 'exporter', expected_value: 'ABC CO., LTD.', expected_unit: '', evaluation_mode: 'company_relaxed', is_applicable: 'true' },
      { document_id: 'trade:T1', field_key: 'blNo', expected_value: 'BL1', expected_unit: '', evaluation_mode: 'strict', is_applicable: 'true' },
      { document_id: 'trade:T1', field_key: 'invoiceNo', expected_value: 'INV1', expected_unit: '', evaluation_mode: 'strict', is_applicable: 'true' },
    ], { fields: [
      { document_id: 'trade:T1', field_key: 'exporter', predicted_value: 'ABC CO LTD' },
      { document_id: 'trade:T1', field_key: 'invoiceNo', predicted_value: 'INV2' },
    ] });
    expect(summary.counts.missing).toBe(1);
    expect(summary.counts.wrongExtraction).toBe(1);
    expect(summary.company.strict.value).toBe(0);
    expect(summary.company.relaxed.value).toBe(1);
  });

  it('평가 가능 필드가 0개여도 NaN 이 나오지 않는다', () => {
    const summary = scoreFieldExtraction([], { fields: [] });
    expect(summary.metrics.normalizedFieldAccuracy.value).toBeNull();
    expect(JSON.stringify(summary)).not.toContain('NaN');
  });
});

describe('문서 분류 채점', () => {
  it('정확도·처리 성공률·혼동행렬, 오류는 (error) 로 기록', () => {
    const summary = scoreDocumentClassification([
      { document_id: 'D1', expected_type: 'commercial_invoice', dataset_split: 'test', source_kind: 'synthetic-normal' },
      { document_id: 'D2', expected_type: 'packing_list', dataset_split: 'test', source_kind: 'synthetic-normal' },
      { document_id: 'D3', expected_type: 'bill_of_lading', dataset_split: 'dev', source_kind: 'synthetic-normal' },
    ], { documents: [
      { document_id: 'D1', predicted_type: 'commercial_invoice' },
      { document_id: 'D2', predicted_type: null, error: 'TIMEOUT' },
      { document_id: 'D3', predicted_type: 'packing_list' },
    ] }, { split: 'test' });
    expect(summary.metrics.classificationAccuracy).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(summary.metrics.processingSuccessRate).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(summary.confusionMatrix.packing_list).toEqual({ '(error)': 1 });
  });
});

describe('집계·보고서', () => {
  it('3회 결과의 평균·최소·최대, 값 없는 실행과 실패 실행 처리', () => {
    const run = (runId: string, n: number, d: number) => ({ source: runId, summary: { scorer: 'hsk', runId, metrics: { top1: ratio(n, d) } } });
    const result = aggregateRuns([run('r1', 1, 2), run('r2', 2, 2), run('r3', 0, 0), { source: 'broken.json', summary: null, error: 'JSON 읽기 실패' }]);
    const top1 = result.scorers.hsk.metrics.top1;
    expect(top1.mean).toBe(0.75);
    expect(top1.min).toBe(0.5);
    expect(top1.max).toBe(1);
    expect(top1.runsWithValue).toBe(2);
    expect(result.failedRuns).toHaveLength(1);
  });

  it('합성 예제 보고서 상단에 실제 성능이 아니라는 주의 문구가 들어간다', () => {
    const report = buildReport({ summaries: [], syntheticExample: true });
    for (const line of SYNTHETIC_EXAMPLE_NOTICE.split('\n')) expect(report).toContain(line);
    expect(report.indexOf('주의')).toBeLessThan(report.indexOf('## 채점 결과'));
    expect(report).not.toContain('NaN');
  });
});

describe('port_locode 채점 연결', () => {
  // 앱의 항구 사전(public/data/unlocodePorts.json)과 같은 형식의 최소 사전.
  const ports = [
    { locode: 'KRPUS', country: 'KR', name: 'Busan', key: portKey('Busan') },
    { locode: 'KRPUS', country: 'KR', name: 'Busan Port', key: portKey('Busan Port') },
    { locode: 'USLAX', country: 'US', name: 'Los Angeles', key: portKey('Los Angeles') },
  ];
  const goldRow = (expected: string) => ([{
    document_id: 'trade:T1', field_key: 'portOfLoading', expected_value: expected,
    expected_unit: '', evaluation_mode: 'port_locode', is_applicable: 'true',
  }]);
  const score = (expected: string, predicted: string) => scoreFieldExtraction(
    goldRow(expected),
    { fields: [{ document_id: 'trade:T1', field_key: 'portOfLoading', predicted_value: predicted }] },
    { ports },
  );

  it('Busan · Busan Port · KRPUS 는 같은 항구로 정답 처리한다', () => {
    for (const [expected, predicted] of [
      ['Busan', 'Busan Port'], ['Busan Port', 'KRPUS'], ['KRPUS', 'Busan'], ['Busan', 'KRPUS'],
    ]) {
      const summary = score(expected, predicted);
      expect(`${expected} → ${predicted}: ${summary.metrics.normalizedFieldAccuracy.value}`)
        .toBe(`${expected} → ${predicted}: 1`);
    }
  });

  it('표기가 달라 strict 로는 틀리지만 정규화 후에는 맞는다', () => {
    const summary = score('Busan', 'KRPUS');
    expect(summary.metrics.strictFieldAccuracy.value).toBe(0);
    expect(summary.byMode.port_locode.normalized.value).toBe(1);
  });

  it('다른 항구는 정규화해도 오답이고, 사전이 없으면 정확히 같은 문자열만 맞는다', () => {
    expect(score('Busan', 'Los Angeles').metrics.normalizedFieldAccuracy.value).toBe(0);

    const noDictionary = scoreFieldExtraction(
      goldRow('Busan'),
      { fields: [{ document_id: 'trade:T1', field_key: 'portOfLoading', predicted_value: 'KRPUS' }] },
      { ports: null },
    );
    expect(noDictionary.metrics.normalizedFieldAccuracy.value).toBe(0);
    expect(noDictionary.counts.wrongExtraction).toBe(1);
  });
});

describe('버전 표기 일치', () => {
  it('manifest 템플릿의 버전이 실제 코드와 같다', () => {
    const manifest = JSON.parse(readFileSync('evaluation/templates/manifest.json', 'utf8')) as {
      normalizationVersion: string; ruleVersion: string;
    };
    expect(manifest.normalizationVersion).toBe(NORMALIZATION_VERSION);

    // 배열 순서가 아니라 규칙 번호의 최소·최대로 범위를 만든다(코드에서는 IR10 뒤에 IR11~IR14가 오지 않는다).
    const numbers = IMPORT_RECONCILIATION_RULES.map((rule) => Number(rule.id.replace('IR', ''))).sort((a, b) => a - b);
    expect(manifest.ruleVersion).toBe(`IR${numbers[0]}-IR${numbers[numbers.length - 1]}`);
    expect(numbers).toHaveLength(14);
    expect(new Set(numbers).size).toBe(14);
  });
});
