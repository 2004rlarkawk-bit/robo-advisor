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
    expect(byId(list, 'missing-co')?.fixes).toEqual([{ kind: 'fta' }, { kind: 'upload' }]);
    expect(byId(list, 'missing-co')).toMatchObject({ level: 'medium', item: '원산지증명서 누락 (FTA 적용 여부 확인 필요)' });
  });

  it('C/O 없음 카드의 FTA 선택: 적용 안 함은 선택 표시만(검토 완료는 직접), 미확인은 확인 안내, 적용 요청은 C/O 제출 안내(반드시 수정)', () => {
    const none = risks(applyRiskFix(analysis(), { type: 'fta' }, 'FTA 적용 안 함'));
    expect(byId(none, 'missing-co')).toMatchObject({ level: 'medium', status: 'unresolved', ftaChoice: 'FTA 적용 안 함' });
    expect(byId(none, 'missing-co')?.chosen).toBeUndefined();
    const requested = risks(applyRiskFix(analysis(), { type: 'fta' }, 'FTA 적용 요청'));
    expect(byId(requested, 'missing-co')).toMatchObject({ level: 'medium', status: 'unresolved', ftaChoice: 'FTA 적용 요청' });
    expect(byId(requested, 'missing-co')?.cause).toContain('원산지증명서가 필요합니다');
    const unknown = risks(applyRiskFix(analysis(), { type: 'fta' }, '적용 여부 미확인'));
    expect(byId(unknown, 'missing-co')).toMatchObject({ level: 'medium', status: 'unresolved' });
    expect(byId(unknown, 'missing-co')?.cause).toContain('FTA 적용 여부를 확인해 주세요');
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

  it('서류에 HS CODE가 없어도 HSK를 확정하면 HS CODE 카드가 회색(해결)으로 남는다', () => {
    const before = byId(risks(), 'reconcile-IR8');
    expect(before?.status).toBe('unresolved');
    const base = analysis();
    const confirmed = { ...base, extracted: { ...base.extracted, items: base.extracted.items.map((item) => ({ ...item, confirmedHSCode: '8518301000' })) } };
    expect(byId(risks(confirmed), 'reconcile-IR8')).toMatchObject({ status: 'resolved', autoResolved: true, cause: '대한민국 HSK 확정: 8518301000' });
  });

  it('C/I에 없던 통화를 채우면 통화 표기 경고가 사라진다', () => {
    const noCurrency = normalizeImportAnalysisResult({ ...analysis(), extracted: { ...analysis().extracted, currency: '' } });
    expect(byId(risks(noCurrency), 'reconcile-IR7')?.fixes?.[0]).toMatchObject({ label: '통화 입력' });
    const fixed = applyRiskFix(noCurrency, { type: 'choice', key: 'field:currency' }, 'usd');
    expect(byId(risks(fixed), 'reconcile-IR7')).toBeUndefined();
  });
});
