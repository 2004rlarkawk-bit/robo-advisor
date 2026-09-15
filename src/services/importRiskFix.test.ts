import { describe, expect, it } from 'vitest';
import { normalizeImportAnalysisResult } from './importDocumentAnalysisService';
import { resolveImportRisks } from './importRiskService';
import { applyRiskFix } from './importValueChoiceService';
import type { ImportDocumentMeta, ImportDocumentType } from '../types/importTrade';

const doc = (id: string, type: ImportDocumentType): ImportDocumentMeta => ({ id, type, name: `${type}.pdf` } as ImportDocumentMeta);
const documents = [doc('ci-uuid', 'commercial_invoice'), doc('pl-uuid', 'packing_list'), doc('bl-uuid', 'bill_of_lading')];

const analysis = () => normalizeImportAnalysisResult({
  extracted: {
    importerDetails: { name: 'ABC IMPORT' },
    currency: 'USD',
    items: [{ id: 'i1', description: 'EARPHONE', quantity: '10', originCountry: '', confirmedHSCode: '', sourceDocumentIds: ['ci-uuid', 'pl-uuid'] }],
  },
  comparison: [{ field: 'Incoterms', invoice: 'F.O.B. HO CHI MINH', packingList: '', billOfLading: '', matches: true, detail: '' }],
  validations: [],
});
const risks = (value = analysis()) => resolveImportRisks(documents, value, [], '', 'PORTAI KOREA');
const byId = (list: ReturnType<typeof risks>, id: string) => list.find((risk) => risk.id === id);

describe('수입 경고 카드 — 카드 안에서 고치기', () => {
  it('카드마다 고칠 방법이 붙고, HS 카드 배지에는 서류 ID 대신 서류 이름이 나온다', () => {
    const list = risks();
    expect(byId(list, 'reconcile-IR9')?.fixes?.[0]).toMatchObject({ kind: 'value', options: expect.arrayContaining(['FOB', 'CIF']) });
    expect(byId(list, 'importer-profile-mismatch')?.fixes?.[0]).toMatchObject({ kind: 'value', target: { type: 'importer' } });
    expect(byId(list, 'origin-i1')?.fixes?.[0]).toMatchObject({ target: { type: 'itemOrigin', itemId: 'i1' } });
    expect(byId(list, 'hs-i1')?.fixes).toEqual([{ kind: 'hs', itemId: 'i1' }]);
    expect(byId(list, 'hs-i1')?.relatedDocuments).toEqual(['Commercial Invoice', 'Packing List']);
    expect(byId(list, 'missing-co')?.fixes).toEqual([{ kind: 'upload' }]);
  });

  it('카드에서 값을 고치면 해당 경고가 사라진다', () => {
    let value = applyRiskFix(analysis(), { type: 'choice', key: 'field:incoterms' }, 'fob');
    expect(value.extracted.incoterms).toBe('FOB');
    value = applyRiskFix(value, { type: 'importer' }, 'PORTAI KOREA');
    value = applyRiskFix(value, { type: 'itemOrigin', itemId: 'i1' }, 'VIETNAM');
    const list = risks(value);
    expect(byId(list, 'reconcile-IR9')).toBeUndefined();
    expect(byId(list, 'importer-profile-mismatch')).toBeUndefined();
    expect(byId(list, 'origin-i1')).toBeUndefined();
  });

  it('C/I에 없던 통화를 채우면 통화 표기 경고가 사라진다', () => {
    const noCurrency = normalizeImportAnalysisResult({ ...analysis(), extracted: { ...analysis().extracted, currency: '' } });
    expect(byId(risks(noCurrency), 'reconcile-IR7')?.fixes?.[0]).toMatchObject({ label: '통화 입력' });
    const fixed = applyRiskFix(noCurrency, { type: 'choice', key: 'field:currency' }, 'usd');
    expect(byId(risks(fixed), 'reconcile-IR7')).toBeUndefined();
  });
});
