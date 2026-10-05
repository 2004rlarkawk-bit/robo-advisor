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

  it('시연용 스위트콘 서류 해시면 저장소가 비어 있어도 내장된 실제 분석 결과를 쓴다', () => {
    const hashById = {
      n1: '772cc258a4968ac97d5ec86b3c4f5470589f0e9577eaa2da159d5f126e670d59',
      n2: '81b2e05949dfece8ae99e276fe16ab78160502661ee0b674d6e7ea5bcba0216b',
      n3: '9e086293c47567d6048ca964eea5ed1821e00b3d4afad8536fb61fa7a4365f4e',
    };
    const loaded = loadImportAnalysisCache('686f9e2dea34892da83f60809375d2cc72229f61d6c5a8cf86b367ae6b728c1e', hashById);
    expect(loaded?.result.analysis.extracted.invoiceNo).toBe('SF-INV-260915');
    expect(loaded?.result.classifications.map((item) => item.id).sort()).toEqual(['n1', 'n2', 'n3']);
    expect(loaded?.suggestions[0]?.code).toBe('0710400000');
  });
});
