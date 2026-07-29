// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSessionMock,
  downloadMock,
  moveMock,
  getPublicUrlMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  downloadMock: vi.fn(),
  moveMock: vi.fn(),
  getPublicUrlMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: getSessionMock },
    storage: {
      from: vi.fn(() => ({
        download: downloadMock,
        move: moveMock,
        getPublicUrl: getPublicUrlMock,
      })),
    },
  },
}));

import {
  loadTradeAttachmentFile,
  maskStoragePath,
  moveTradeAttachmentsToScope,
  TradeAttachmentDownloadError,
} from './tradeAttachmentStorageService';
import type { TradeAttachment } from '../types/tradeFormData';

const attachment: TradeAttachment = {
  id: 'attachment-1',
  documentType: 'commercial_invoice',
  fileName: 'invoice.pdf',
  storageBucket: 'trade-documents',
  storagePath: 'user-secret/draft-export-forwarder/commercial_invoice/attachment-1.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 3,
  uploadedAt: '2026-07-30T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: 'masked' } }, error: null });
});

describe('private trade attachment download', () => {
  it('인증 세션에서 private download를 사용해 Blob을 File로 변환하고 public URL은 사용하지 않는다', async () => {
    downloadMock.mockResolvedValue({
      data: new Blob(['pdf'], { type: 'application/pdf' }),
      error: null,
    });

    const file = await loadTradeAttachmentFile(attachment);

    expect(getSessionMock).toHaveBeenCalledOnce();
    expect(downloadMock).toHaveBeenCalledWith(attachment.storagePath);
    expect(getPublicUrlMock).not.toHaveBeenCalled();
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('invoice.pdf');
    expect(file.type).toBe('application/pdf');
  });

  it('세션이 없으면 Storage 요청 전에 안전한 오류를 반환하고 사용자 ID를 마스킹한다', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });

    await expect(loadTradeAttachmentFile(attachment)).rejects.toMatchObject({
      name: 'TradeAttachmentDownloadError',
      code: 'AUTH_SESSION_REQUIRED',
      maskedStoragePath: '<user>/draft-export-forwarder/commercial_invoice/attachment-1.pdf',
      fileName: 'invoice.pdf',
    });
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('stale Storage 경로 오류에 파일 metadata와 마스킹 경로를 유지한다', async () => {
    downloadMock.mockResolvedValue({
      data: null,
      error: { code: '404', message: 'Object not found' },
    });

    const error = await loadTradeAttachmentFile(attachment).catch((caught) => caught);

    expect(error).toBeInstanceOf(TradeAttachmentDownloadError);
    expect(error).toMatchObject({
      code: '404',
      fileName: 'invoice.pdf',
      bucket: 'trade-documents',
      maskedStoragePath: '<user>/draft-export-forwarder/commercial_invoice/attachment-1.pdf',
    });
    expect(String(error.message)).toContain('파일 정보는 유지');
  });

  it('Storage 경로 첫 segment만 마스킹한다', () => {
    expect(maskStoragePath('user-id/trade-id/other/file.pdf'))
      .toBe('<user>/trade-id/other/file.pdf');
  });
});

describe('draft → trade attachment move', () => {
  it('이동 성공 후 반환 metadata를 새 trade scope로 갱신한다', async () => {
    moveMock.mockResolvedValue({ error: null });

    const [moved] = await moveTradeAttachmentsToScope({
      userId: 'user-secret',
      scopeId: 'trade-1',
      attachments: [attachment],
    });

    expect(moved.storagePath).toBe(
      'user-secret/trade-1/commercial_invoice/attachment-1.pdf',
    );
    expect(moveMock).toHaveBeenCalledWith(
      attachment.storagePath,
      moved.storagePath,
    );
  });

  it('다중 이동 중 실패하면 앞서 이동한 객체를 draft 경로로 복구한다', async () => {
    const second = {
      ...attachment,
      id: 'attachment-2',
      documentType: 'packing_list' as const,
      fileName: 'packing.pdf',
      storagePath: 'user-secret/draft-export-forwarder/packing_list/attachment-2.pdf',
    };
    moveMock
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'move failed' } })
      .mockResolvedValueOnce({ error: null });

    await expect(moveTradeAttachmentsToScope({
      userId: 'user-secret',
      scopeId: 'trade-1',
      attachments: [attachment, second],
    })).rejects.toMatchObject({ message: 'move failed' });

    expect(moveMock).toHaveBeenNthCalledWith(
      3,
      'user-secret/trade-1/commercial_invoice/attachment-1.pdf',
      attachment.storagePath,
    );
  });
});
