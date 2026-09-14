// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ForwarderDocumentThumbnail from './ForwarderDocumentThumbnail';
import { loadTradeAttachmentFile } from '../../services/tradeAttachmentStorageService';
import type { ImportDocumentMeta } from '../../types/importTrade';

vi.mock('../../services/tradeAttachmentStorageService', () => ({ loadTradeAttachmentFile: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const doc: ImportDocumentMeta = { id: 'ci', name: 'invoice.png', size: 100, mimeType: 'image/png', type: 'commercial_invoice', status: 'analyzed', storageBucket: 'docs', storagePath: 'invoice.png' };

describe('ForwarderDocumentThumbnail', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div'); root = createRoot(container);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:document-thumbnail');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => { act(() => root.unmount()); vi.restoreAllMocks(); vi.mocked(loadTradeAttachmentFile).mockReset(); });
  const render = async (document = doc) => act(async () => root.render(<ForwarderDocumentThumbnail document={document} userId="viewer" />));

  it('uses authenticated attachment loading and releases the real image URL on replacement', async () => {
    vi.mocked(loadTradeAttachmentFile).mockResolvedValue(new File(['image'], 'invoice.png', { type: 'image/png' }));
    await render();
    expect(loadTradeAttachmentFile).toHaveBeenCalledWith(expect.objectContaining({ storageBucket: 'docs', storagePath: 'invoice.png' }), 'viewer');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:document-thumbnail');
    expect(container.querySelector('img')?.alt).toContain('invoice.png');
    await render({ ...doc, id: 'docx', name: 'invoice.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:document-thumbnail');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('원본에서 미리보기');
  });

  it('does not fetch unsupported or oversized documents', async () => {
    await render({ ...doc, name: 'invoice.xlsx', mimeType: 'application/vnd.ms-excel' });
    expect(loadTradeAttachmentFile).not.toHaveBeenCalled();
    await render({ ...doc, size: 21 * 1024 * 1024 });
    expect(loadTradeAttachmentFile).not.toHaveBeenCalled();
    expect(container.textContent).toContain('큰 파일');
  });

  it('shows an honest fallback for denied storage access without displaying fake contents', async () => {
    vi.mocked(loadTradeAttachmentFile).mockRejectedValue(new Error('Access denied'));
    await render();
    expect(container.textContent).toContain('미리보기 불가');
    expect(container.querySelector('img')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('ignores a stale download after switching documents', async () => {
    let finish!: (file: File) => void;
    vi.mocked(loadTradeAttachmentFile).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render();
    await render({ ...doc, id: 'unsupported', name: 'other.docx', mimeType: 'application/docx' });
    await act(async () => finish(new File(['old'], 'invoice.png', { type: 'image/png' })));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector('img')).toBeNull();
  });
});
