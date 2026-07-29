// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TradeAttachment } from '../types/tradeFormData';

const { uploadMock, removeMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock('../services/tradeAttachmentStorageService', () => ({
  uploadTradeAttachment: uploadMock,
  removeTradeAttachment: removeMock,
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

function renderUploader(attachments: TradeAttachment[] = []) {
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
      />,
    );
  });
  return { onChange };
}

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
});
