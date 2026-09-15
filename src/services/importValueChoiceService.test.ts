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
      id: 'v-invoice', field: 'invoiceNumber', message: 'Invoice No.가 일치하지 않습니다.', severity: 'error',
      documents: ['commercial_invoice', 'packing_list'],
      values: [{ documentId: 'ci', value: 'INV-001' }, { documentId: 'pl', value: 'INV-002' }],
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
    // IR12는 불일치한 도착항만 고르게 한다
    expect(riskById(analysis, 'reconcile-IR12')?.pickGroups?.map((group) => group.label)).toEqual(['도착항']);
    expect(riskById(analysis, 'v-invoice')?.pickGroups?.[0].key).toBe('validation:v-invoice');
  });

  it('값을 고르면 해당 경고가 사라지고 추출 결과에도 반영된다', () => {
    const chosen = applyChosenValue(baseAnalysis(), 'field:grossWeight', '4,631 KG');
    expect(riskById(chosen, 'reconcile-IR3')).toBeUndefined();
    expect(chosen.extracted.grossWeight).toBe('4631');
    expect(chosen.comparison[0].billOfLading).toBe('4,631 KG'); // 원본 비교표는 그대로
    expect(buildReconciliationInput(chosen, documents.map((d) => d.type)).packing_list?.grossWeight).toBe('4631');

    const invoice = applyChosenValue(chosen, 'validation:v-invoice', 'INV-002');
    expect(riskById(invoice, 'v-invoice')).toBeUndefined();
    expect(invoice.extracted.invoiceNo).toBe('INV-002');
  });

  it('되돌리면 경고가 다시 나타난다', () => {
    const chosen = applyChosenValue(baseAnalysis(), 'field:grossWeight', '4631');
    expect(riskById(clearChosenValue(chosen, 'field:grossWeight'), 'reconcile-IR3')).toBeDefined();
  });

  it('분석 결과 표에서 직접 고친 칸도 확인한 값으로 보고 다시 계산한다', () => {
    const analysis = baseAnalysis();
    const edited = mergeEditedChoices(analysis, { ...analysis.extracted, dischargePort: 'BOSTON, USA' });
    expect(edited.chosenValues).toEqual({ 'field:dischargePort': 'BOSTON, USA' });
    expect(riskById(edited, 'reconcile-IR12')).toBeUndefined();
    expect(riskById(edited, 'reconcile-IR3')).toBeDefined(); // 고치지 않은 항목은 그대로
  });

  it('저장본을 다시 불러와도 고른 값이 유지된다', () => {
    const chosen = applyChosenValue(baseAnalysis(), 'field:grossWeight', '4631');
    const restored = normalizeImportAnalysisResult(JSON.parse(JSON.stringify(chosen)));
    expect(restored.chosenValues).toEqual({ 'field:grossWeight': '4631' });
  });
});
