// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TradeAttachment } from '../types/tradeFormData';
import type { ForwarderDocumentConflict } from '../services/forwarderDocumentAnalysisService';
import type { ForwarderFormState } from '../utils/forwarderForm';

const { uploadMock, removeMock, classifyMock, analyzeMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  removeMock: vi.fn(),
  classifyMock: vi.fn(),
  analyzeMock: vi.fn(),
}));

vi.mock('../services/tradeAttachmentStorageService', () => ({
  uploadTradeAttachment: uploadMock,
  removeTradeAttachment: removeMock,
}));

vi.mock('../services/importDocumentAnalysisService', () => ({
  classifyImportDocument: classifyMock,
}));

vi.mock('../services/forwarderDocumentAnalysisService', () => ({
  analyzeForwarderAttachments: analyzeMock,
}));

import TradeAttachmentUploader from './TradeAttachmentUploader';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const persisted: TradeAttachment = {
  id: 'attachment-1',
  documentType: 'commercial_invoice',
  fileName: 'invoice.pdf',
  storageBucket: 'trade-documents',
  storagePath: 'user/trade/commercial_invoice/attachment-1-invoice.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  uploadedAt: '2026-07-30T03:00:00.000Z',
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderUploader(
  attachments: TradeAttachment[] = [],
  onApplyAnalysis: (
    values: Partial<ForwarderFormState>,
    sourceFiles: Record<string, string>,
  ) => ForwarderDocumentConflict[] = vi.fn(() => []),
) {
  const onChange = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <TradeAttachmentUploader
        userId="user"
        scopeId="draft-export-forwarder"
        attachments={attachments}
        onChange={onChange}
        onApplyAnalysis={onApplyAnalysis}
      />,
    );
  });
  return { onChange, onApplyAnalysis };
}

beforeEach(() => {
  classifyMock.mockResolvedValue('commercial_invoice');
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe('수출 포워더 첨부 uploader', () => {
  it('persisted metadata를 파일 input 없이도 업로드 완료로 표시한다', () => {
    renderUploader([persisted]);
    expect(container?.textContent).toContain('invoice.pdf');
    expect(container?.textContent).toContain('업로드 완료');
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it('PDF를 draft scope로 업로드하고 metadata만 onChange에 전달한다', async () => {
    uploadMock.mockResolvedValue(persisted);
    const { onChange } = renderUploader();
    const input = container!.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadMock).toHaveBeenCalledWith({
      userId: 'user',
      scopeId: 'draft-export-forwarder',
      documentType: 'commercial_invoice',
      file,
    });
    expect(onChange).toHaveBeenCalledWith([persisted]);
    expect(JSON.stringify(onChange.mock.calls[0][0])).not.toContain('[object File]');
  });

  it('여러 파일을 한 번에 분류·업로드하고 각 File은 컴포넌트 내부에만 유지한다', async () => {
    const second = {
      ...persisted,
      id: 'attachment-2',
      documentType: 'packing_list' as const,
      fileName: 'packing-list.pdf',
      storagePath: 'user/trade/packing_list/attachment-2-packing.pdf',
    };
    classifyMock
      .mockResolvedValueOnce('commercial_invoice')
      .mockResolvedValueOnce('packing_list');
    uploadMock
      .mockResolvedValueOnce(persisted)
      .mockResolvedValueOnce(second);
    const { onChange } = renderUploader();
    const input = container!.querySelector<HTMLInputElement>('input[type="file"]')!;
    const files = [
      new File(['invoice'], 'invoice.pdf', { type: 'application/pdf' }),
      new File(['packing'], 'packing-list.pdf', { type: 'application/pdf' }),
    ];
    Object.defineProperty(input, 'files', { configurable: true, value: files });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(uploadMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      documentType: 'packing_list',
      file: files[1],
    }));
    expect(onChange).toHaveBeenCalledWith([persisted, second]);
    expect(JSON.stringify(onChange.mock.calls[0][0])).not.toContain('[object File]');
  });

  it('drag-and-drop으로도 여러 파일 업로드 경로를 사용한다', async () => {
    uploadMock.mockResolvedValue(persisted);
    const { onChange } = renderUploader();
    const dropZone = container!.querySelector<HTMLDivElement>('.import-drop-zone')!;
    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
    const event = new Event('drop', { bubbles: true }) as Event & {
      dataTransfer: { files: File[] };
    };
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [file] },
    });

    await act(async () => {
      dropZone.dispatchEvent(event);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadMock).toHaveBeenCalledWith(expect.objectContaining({ file }));
    expect(onChange).toHaveBeenCalledWith([persisted]);
  });

  it('허용되지 않은 MIME은 Storage 요청 전에 차단한다', async () => {
    renderUploader();
    const input = container!.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['bad'], 'malware.exe', { type: 'application/octet-stream' })],
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(container?.textContent).toContain('PDF, PNG, JPEG');
  });

  it('Storage upload 실패 시 persisted metadata와 완료 UI를 만들지 않는다', async () => {
    uploadMock.mockRejectedValue(new Error('upload failed'));
    const { onChange } = renderUploader();
    const input = container!.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['pdf'], 'failed.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadMock).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(container?.textContent).toContain('업로드하지 못했습니다');
    expect(container?.textContent).not.toContain('failed.pdf 업로드 완료');
  });

  it('persisted 첨부 삭제 시 Storage 삭제 후 metadata를 제거한다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    removeMock.mockResolvedValue(undefined);
    const { onChange } = renderUploader([persisted]);
    const deleteButton = container!.querySelector<HTMLButtonElement>('[aria-label="invoice.pdf 삭제"]')!;
    await act(async () => {
      deleteButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(removeMock).toHaveBeenCalledWith({
      storageBucket: 'trade-documents',
      storagePath: persisted.storagePath,
    });
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('persisted metadata를 유지한 채 AI 분석 결과를 폼 adapter에 전달한다', async () => {
    analyzeMock.mockResolvedValue({
      values: { companyName: 'AI Exporter', itemName: 'Cotton shirts' },
      classifications: { 'attachment-1': 'commercial_invoice' },
      sourceFiles: { companyName: 'invoice.pdf', itemName: 'invoice.pdf' },
      documentConflicts: [],
      failures: [],
    });
    const onApplyAnalysis = vi.fn(() => []);
    renderUploader([persisted], onApplyAnalysis);
    const analyzeButton = Array.from(container!.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('AI 분석'))!;

    await act(async () => {
      analyzeButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(analyzeMock).toHaveBeenCalledWith([persisted], {}, 'user');
    expect(onApplyAnalysis).toHaveBeenCalledWith(
      { companyName: 'AI Exporter', itemName: 'Cotton shirts' },
      { companyName: 'invoice.pdf', itemName: 'invoice.pdf' },
    );
    expect(container?.textContent).toContain('자동 입력');
  });

  it('사용자 입력과 AI 값이 충돌하면 기존값을 유지했다는 상세를 표시한다', async () => {
    analyzeMock.mockResolvedValue({
      values: { companyName: 'AI Exporter' },
      classifications: {},
      sourceFiles: { companyName: 'invoice.pdf' },
      documentConflicts: [],
      failures: [],
    });
    const onApplyAnalysis = vi.fn(() => [{
      field: 'companyName' as const,
      currentValue: 'User Exporter',
      analyzedValue: 'AI Exporter',
      sourceFileName: 'invoice.pdf',
    }]);
    renderUploader([persisted], onApplyAnalysis);
    const analyzeButton = Array.from(container!.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes('AI 분석'))!;

    await act(async () => {
      analyzeButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container?.textContent).toContain('기존 입력을 유지');
    expect(container?.textContent).toContain('User Exporter');
    expect(container?.textContent).toContain('AI Exporter');
    expect(container?.textContent).toContain('invoice.pdf');
  });
});
