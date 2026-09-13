// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportDocumentMeta } from '../../types/importTrade';

vi.mock('../../services/importDocumentAnalysisService', () => ({
  classifyImportDocument: vi.fn().mockResolvedValue('commercial_invoice'),
  IMPORT_DOCUMENT_TYPE_LABELS: {
    commercial_invoice: '상업송장',
    packing_list: '포장명세서',
    bill_of_lading: '선하증권',
    certificate_of_origin: '원산지증명서',
    other: '기타서류',
    unknown: '기타서류',
  },
}));

import ImportDocumentUploader from './ImportDocumentUploader';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const persisted: ImportDocumentMeta = {
  id: 'persisted',
  name: 'invoice.pdf',
  size: 100,
  mimeType: 'application/pdf',
  type: 'commercial_invoice',
  status: 'ready',
  uploadStatus: 'uploaded',
  analysisStatus: 'pending',
  storageBucket: 'trade-documents',
  storagePath: 'user/trade/commercial_invoice/invoice.pdf',
  uploadedAt: '2026-07-30T05:00:00.000Z',
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe('수입 persisted 첨부 표시', () => {
  it('새로고침 후 metadata 파일명과 업로드 완료 상태를 표시한다', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <ImportDocumentUploader
          documents={[persisted]}
          onChange={vi.fn()}
          onFilesAdded={vi.fn()}
          onFileRemoved={vi.fn()}
          description="수입 서류"
        />,
      );
    });
    expect(container.textContent).toContain('invoice.pdf');
    expect(container.textContent).toContain('상업송장');
    expect(container.textContent).toContain('업로드 완료');
  });

  it('동일한 persisted 파일을 다시 선택해도 중복 추가하지 않는다', async () => {
    const onChange = vi.fn();
    const onFilesAdded = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <ImportDocumentUploader
          documents={[persisted]}
          onChange={onChange}
          onFilesAdded={onFilesAdded}
          onFileRemoved={vi.fn()}
          description="수입 서류"
        />,
      );
    });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['x'.repeat(100)], 'invoice.pdf', { type: 'application/pdf' })],
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(onFilesAdded).toHaveBeenCalledWith([]);
    expect(onChange).toHaveBeenCalledWith([persisted]);
  });

  it('persisted 문서 종류를 변경해도 Storage metadata를 보존한다', () => {
    const onChange = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <ImportDocumentUploader
          documents={[persisted]}
          onChange={onChange}
          onFilesAdded={vi.fn()}
          onFileRemoved={vi.fn()}
          description="수입 서류"
        />,
      );
    });

    const select = container.querySelector<HTMLSelectElement>('select')!;
    act(() => {
      select.value = 'packing_list';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: persisted.id,
        type: 'packing_list',
        storageBucket: persisted.storageBucket,
        storagePath: persisted.storagePath,
        uploadedAt: persisted.uploadedAt,
        mimeType: persisted.mimeType,
        size: persisted.size,
      }),
    ]);
  });
});
