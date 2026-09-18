// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeImportAnalysisResult } from '../../services/importDocumentAnalysisService';
import type { ImportDocumentMeta } from '../../types/importTrade';
import ImportAnalysisSummary from './ImportAnalysisSummary';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const documents: ImportDocumentMeta[] = [
  { id: '2f1c9a10-6b7d-4f3e-9a21-0c8d5e4b7a11', name: 'invoice.pdf', size: 1, mimeType: 'application/pdf', type: 'commercial_invoice', status: 'analyzed' },
  { id: '7d4e8b22-1c5a-4e6f-b930-2a7c6f1d8e33', name: 'packing-list.pdf', size: 1, mimeType: 'application/pdf', type: 'packing_list', status: 'analyzed' },
  // Edge Function이 자체 sourceId를 돌려주는 경우 — id가 아니라 sourceId로 맞춰야 한다.
  { id: 'a91b3c44-2d6e-4f70-8b12-3c9d7e5f2a44', sourceId: 'bl-source-1', name: 'bill-of-lading.pdf', size: 1, mimeType: 'application/pdf', type: 'bill_of_lading', status: 'analyzed' },
];

const analysisWith = (sourceDocumentIds: string[]) => normalizeImportAnalysisResult({
  extracted: {
    items: [{ id: 'item-1', description: 'CASHMERE COATS', sourceDocumentIds }],
  },
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const render = (sourceDocumentIds: string[], docs: ImportDocumentMeta[] = documents) => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ImportAnalysisSummary analysis={analysisWith(sourceDocumentIds)} documents={docs} onChange={vi.fn()} />,
    );
  });
  return container.querySelector('.import-item-source')!;
};

beforeEach(() => { root = null; container = null; });

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
});

describe('품목정보 참조 문서 표기', () => {
  it('UUID 대신 문서 유형 약칭과 파일명을 보여준다', () => {
    const source = render([documents[0].id, documents[1].id]);
    expect(source.textContent).toBe('품목정보 참조 문서: C/I · invoice.pdf, P/L · packing-list.pdf');
    expect(source.textContent).not.toMatch(UUID_PATTERN);
  });

  it('id로 못 찾으면 sourceId로 찾는다', () => {
    expect(render(['bl-source-1']).textContent).toBe('품목정보 참조 문서: B/L · bill-of-lading.pdf');
  });

  it('같은 문서가 여러 번 들어와도 한 번만 표시한다', () => {
    const source = render([documents[0].id, documents[0].id, documents[0].sourceId ?? documents[0].id]);
    expect(source.textContent).toBe('품목정보 참조 문서: C/I · invoice.pdf');
  });

  it('매칭되는 문서가 없으면 식별값을 노출하지 않고 확인 불가 문구로 표시한다', () => {
    const source = render(['4c2f8e90-5a3b-4d71-9e02-6f8a1b3c5d77']);
    expect(source.textContent).toBe('품목정보 참조 문서: 참조 문서를 확인할 수 없습니다');
    expect(source.textContent).not.toMatch(UUID_PATTERN);
  });

  it('출처 id 자체가 없으면 확인 불가 문구를 쓴다', () => {
    expect(render([]).textContent).toBe('품목정보 참조 문서: 참조 문서 정보가 없습니다');
  });
});
