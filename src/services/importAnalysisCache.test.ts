import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportDocumentAnalysisResponse, ImportDocumentMeta } from '../types/importTrade';
import {
  computeImportAnalysisCacheKey,
  loadImportAnalysisCache,
  saveImportAnalysisCache,
} from './importAnalysisCache';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

const doc = (id: string) => ({ id, name: `${id}.pdf`, type: 'commercial_invoice' }) as unknown as ImportDocumentMeta;
const file = (text: string) => new File([text], 'f.pdf', { type: 'application/pdf' });

const result = (docId: string) => ({
  analysis: {
    extracted: { items: [{ id: 'item-1', description: 'GREEN COFFEE BEAN', sourceDocumentIds: [docId] }] },
    validations: [],
    comparison: [],
  },
  classifications: [{ id: docId, type: 'commercial_invoice', confidence: 0.99 }],
  source: 'openai',
  model: 'test',
}) as unknown as ImportDocumentAnalysisResponse;

describe('수입 서류 분석 캐시', () => {
  it('같은 파일이면 업로드 순서·문서 id가 달라도 같은 키를 만든다', async () => {
    const a = await computeImportAnalysisCacheKey([doc('d1'), doc('d2')], { d1: file('CI'), d2: file('PL') }, 'shipper');
    const b = await computeImportAnalysisCacheKey([doc('x2'), doc('x1')], { x2: file('PL'), x1: file('CI') }, 'shipper');
    const c = await computeImportAnalysisCacheKey([doc('d1'), doc('d2')], { d1: file('CI'), d2: file('PL v2') }, 'shipper');
    expect(a?.key).toBe(b?.key);
    expect(a?.key).not.toBe(c?.key);
  });

  it('저장한 실제 분석 결과를 이번 업로드의 문서 id로 바꿔 돌려준다', async () => {
    const first = (await computeImportAnalysisCacheKey([doc('old-doc')], { 'old-doc': file('CI') }, 'shipper'))!;
    saveImportAnalysisCache(first.key, first.hashById, result('old-doc'), [{ itemId: 'item-1', code: '0901110000', description: '', reasoning: '', confidence: 0.9 }]);

    const again = (await computeImportAnalysisCacheKey([doc('new-doc')], { 'new-doc': file('CI') }, 'shipper'))!;
    const loaded = loadImportAnalysisCache(again.key, again.hashById);
    expect(loaded?.result.classifications[0].id).toBe('new-doc');
    expect(loaded?.result.analysis.extracted.items[0].sourceDocumentIds).toEqual(['new-doc']);
    expect(loaded?.suggestions[0].code).toBe('0901110000');
  });

  it('처음 보는 파일이면 캐시가 없다', async () => {
    const key = (await computeImportAnalysisCacheKey([doc('d1')], { d1: file('new') }, 'shipper'))!;
    expect(loadImportAnalysisCache(key.key, key.hashById)).toBeNull();
  });
});
