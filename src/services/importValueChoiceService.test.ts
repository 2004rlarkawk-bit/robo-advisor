import { describe, expect, it } from 'vitest';
import { normalizeImportAnalysisResult } from './importDocumentAnalysisService';
import { buildReconciliationInput } from './importReconciliationEngine';
import { resolveImportRisks } from './importRiskService';
import { applyChosenValue, clearChosenValue, mergeEditedChoices } from './importValueChoiceService';
import type { ImportDocumentMeta, ImportDocumentType } from '../types/importTrade';

const doc = (id: string, type: ImportDocumentType): ImportDocumentMeta => ({ id, type, name: `${type}.pdf` } as ImportDocumentMeta);
const documents = [
  doc('ci', 'commercial_invoice'),
  doc('pl', 'packing_list'),
  doc('bl', 'bill_of_lading'),
  doc('co', 'certificate_of_origin'),
];

const baseAnalysis = () => normalizeImportAnalysisResult({
  extracted: {
    grossWeight: '1,317',
    consigneeDetails: { name: 'INCHEON SOUND KOREA INC.' },
    items: [{ id: 'i1', description: 'WIRELESS EARPHONE', quantity: '1020', originCountry: 'VIETNAM', confirmedHSCode: '8518300000' }],
    incoterms: 'FOB',
  },
  comparison: [
    { field: '총중량', invoice: '', packingList: '1,317 KG', billOfLading: '4,631 KG', matches: false, detail: '' },
    { field: '도착항', invoice: 'DETROIT, U.S.A', packingList: '', billOfLading: 'BOSTON, USA', matches: false, detail: '' },
  ],
  validations: [
    {
      id: 'v-total', field: 'invoiceTotal', message: 'Invoice 총금액이 일치하지 않습니다.', severity: 'error',
      documents: ['commercial_invoice', 'packing_list'],
      values: [{ documentId: 'ci', value: '8,000' }, { documentId: 'pl', value: '8,500' }],
    },
  ],
});

const riskById = (analysis: ReturnType<typeof baseAnalysis>, id: string) =>
  resolveImportRisks(documents, analysis).find((risk) => risk.id === id);

describe('수입 불일치 — 맞는 값 고르기', () => {
  it('서류별 값으로 고를 수 있는 선택지를 만든다', () => {
    const analysis = baseAnalysis();
    expect(riskById(analysis, 'reconcile-IR3')?.pickGroups).toEqual([
      { key: 'field:grossWeight', label: '총중량', choices: [{ source: 'P/L', value: '1,317 KG' }, { source: 'B/L', value: '4,631 KG' }] },
    ]);
    // 신고 금액·세액과 무관한 항구 불일치(IR12)는 화주 확인 목록에 넣지 않는다
    expect(riskById(analysis, 'reconcile-IR12')).toBeUndefined();
    expect(riskById(analysis, 'v-total')?.pickGroups?.[0].key).toBe('validation:v-total');
  });

  it('값을 고르면 카드는 남아 해결됨으로 바뀌고, 고른 값이 표시되며 추출 결과에도 반영된다', () => {
    const chosen = applyChosenValue(baseAnalysis(), 'field:grossWeight', '4,631 KG');
    const ir3 = riskById(chosen, 'reconcile-IR3');
    expect(ir3).toMatchObject({ status: 'resolved', chosen: true });
    // 선택지는 고르기 전 서류별 원본 값 그대로
    expect(ir3?.pickGroups?.[0].choices).toEqual([{ source: 'P/L', value: '1,317 KG' }, { source: 'B/L', value: '4,631 KG' }]);
    expect(ir3?.pickGroups?.[0].selected).toBeTruthy();
    expect(chosen.extracted.grossWeight).toBe('4631');
    expect(chosen.comparison[0].billOfLading).toBe('4,631 KG'); // 원본 비교표는 그대로
    expect(buildReconciliationInput(chosen, documents.map((d) => d.type)).packing_list?.grossWeight).toBe('4631');

    const total = applyChosenValue(chosen, 'validation:v-total', '8,500');
    expect(riskById(total, 'v-total')).toMatchObject({ status: 'resolved', chosen: true });
    expect(riskById(total, 'v-total')?.pickGroups?.[0].selected).toBe('8,500');
    expect(total.extracted.totalAmount).toBe('8,500');
  });

  it('되돌리면 경고가 다시 나타난다', () => {
    const chosen = applyChosenValue(baseAnalysis(), 'field:grossWeight', '4631');
    expect(riskById(clearChosenValue(chosen, 'field:grossWeight'), 'reconcile-IR3')).toMatchObject({ status: 'unresolved' });
    expect(riskById(clearChosenValue(chosen, 'field:grossWeight'), 'reconcile-IR3')?.chosen).toBeUndefined();
  });

  it('분석 결과 표에서 직접 고친 칸도 확인한 값으로 보고 다시 계산한다', () => {
    const analysis = baseAnalysis();
    const edited = mergeEditedChoices(analysis, { ...analysis.extracted, grossWeight: '4,631' });
    expect(edited.chosenValues).toEqual({ 'field:grossWeight': '4631' });
    expect(riskById(edited, 'reconcile-IR3')).toMatchObject({ status: 'resolved', chosen: true });
    expect(riskById(edited, 'reconcile-IR1')).toBeUndefined(); // 고치지 않은 다른 항목에는 영향이 없다
  });

  it('저장본을 다시 불러와도 고른 값이 유지된다', () => {
    const chosen = applyChosenValue(baseAnalysis(), 'field:grossWeight', '4631');
    const restored = normalizeImportAnalysisResult(JSON.parse(JSON.stringify(chosen)));
    expect(restored.chosenValues).toEqual({ 'field:grossWeight': '4631' });
  });
});
