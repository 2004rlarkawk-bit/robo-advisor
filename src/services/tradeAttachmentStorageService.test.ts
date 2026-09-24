// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSessionMock,
  getUserMock,
  downloadMock,
  moveMock,
  getPublicUrlMock,
  tradeQueryMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserMock: vi.fn(),
  downloadMock: vi.fn(),
  moveMock: vi.fn(),
  getPublicUrlMock: vi.fn(),
  // trades 조회 결과 — 배정 포워더 판단에 쓴다. { data, error } 를 돌려준다.
  tradeQueryMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: getSessionMock, getUser: getUserMock },
    // .from('trades').select(...).eq(...)[.maybeSingle()] 체인을 흉내낸다.
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.maybeSingle = () => tradeQueryMock();
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(tradeQueryMock()).then(resolve);
      return builder;
    }),
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
  normalizeStorageObjectPath,
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
  tradeQueryMock.mockReturnValue({ data: null, error: null });
  getSessionMock.mockResolvedValue({
    data: { session: { access_token: 'masked', user: { id: 'user-secret' } } },
    error: null,
  });
  getUserMock.mockResolvedValue({
    data: { user: { id: 'user-secret' } },
    error: null,
  });
});

describe('private trade attachment download', () => {
  it('인증 세션에서 private download를 사용해 Blob을 File로 변환하고 public URL은 사용하지 않는다', async () => {
    downloadMock.mockResolvedValue({
      data: new Blob(['pdf'], { type: 'application/pdf' }),
      error: null,
    });

    const file = await loadTradeAttachmentFile(attachment, 'user-secret');

    expect(getSessionMock).toHaveBeenCalledOnce();
    expect(getUserMock).not.toHaveBeenCalled();
    expect(downloadMock).toHaveBeenCalledWith(attachment.storagePath);
    expect(getPublicUrlMock).not.toHaveBeenCalled();
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('invoice.pdf');
    expect(file.type).toBe('application/pdf');
  });

  it('세션이 없으면 Storage 요청 전에 안전한 오류를 반환하고 사용자 ID를 마스킹한다', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth session missing' },
    });

    await expect(loadTradeAttachmentFile(attachment)).rejects.toMatchObject({
      name: 'TradeAttachmentDownloadError',
      code: 'AUTH_SESSION_REQUIRED',
      maskedStoragePath: '<user>/draft-export-forwarder/commercial_invoice/attachment-1.pdf',
      fileName: 'invoice.pdf',
    });
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('새로고침 직후 로컬 session 판독이 실패해도 getUser가 복원한 사용자로 download한다', async () => {
    getSessionMock.mockRejectedValue(new Error('session lock unavailable'));
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-secret' } },
      error: null,
    });
    downloadMock.mockResolvedValue({
      data: new Blob(['pdf'], { type: 'application/pdf' }),
      error: null,
    });

    const file = await loadTradeAttachmentFile(attachment, 'user-secret');

    expect(getUserMock).toHaveBeenCalledOnce();
    expect(downloadMock).toHaveBeenCalledWith(attachment.storagePath);
    expect(file.name).toBe(attachment.fileName);
  });

  it('현재 인증 사용자와 다른 첫 segment 경로는 Storage 요청 전에 차단한다', async () => {
    const otherUserAttachment = {
      ...attachment,
      storagePath: 'other-user/trade-1/commercial_invoice/attachment-1.pdf',
    };

    await expect(loadTradeAttachmentFile(
      otherUserAttachment,
      'user-secret',
    )).rejects.toMatchObject({
      code: 'STORAGE_PATH_USER_MISMATCH',
      maskedStoragePath: '<user>/trade-1/commercial_invoice/attachment-1.pdf',
    });
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('stale Storage 경로 오류에 파일 metadata와 마스킹 경로를 유지한다', async () => {
    downloadMock.mockResolvedValue({
      data: null,
      error: {
        error: 'NoSuchKey',
        message: 'Object not found',
        statusCode: '404',
      },
    });

    const error = await loadTradeAttachmentFile(attachment).catch((caught) => caught);

    expect(error).toBeInstanceOf(TradeAttachmentDownloadError);
    expect(error).toMatchObject({
      code: 'NoSuchKey',
      status: '404',
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

  it('bucket과 object path를 분리하고 선행 slash만 정규화한다', () => {
    expect(normalizeStorageObjectPath(
      'trade-documents',
      '/user-secret/draft-import-forwarder/commercial_invoice/한글 파일 (1).pdf',
    )).toBe(
      'user-secret/draft-import-forwarder/commercial_invoice/한글 파일 (1).pdf',
    );
    expect(() => normalizeStorageObjectPath(
      'trade-documents',
      'trade-documents/user-secret/file.pdf',
    )).toThrow('bucket 내부 상대 경로');
    expect(() => normalizeStorageObjectPath(
      'trade-documents',
      'https://example.test/storage/object.pdf',
    )).toThrow('bucket 내부 상대 경로');
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

/**
 * 화주가 올린 원본 파일을 누가 열 수 있는지 — 올린 화주 본인과
 * 그 거래에 배정된 포워더만 통과해야 한다(최종 차단은 Storage RLS).
 */
describe('배정 포워더의 화주 업로드 파일 열람', () => {
  const shipperFile: TradeAttachment = {
    ...attachment,
    storagePath: 'shipper-uid/2f1c4b2e-3a5d-4f6a-8b7c-9d0e1f2a3b4c/commercial_invoice/ci.pdf',
  };
  const forwarderSession = () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'masked', user: { id: 'forwarder-uid' } } },
      error: null,
    });
  };

  it('Case A — 화주 본인은 자기 파일을 그대로 연다 (거래 조회 없이)', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'masked', user: { id: 'shipper-uid' } } },
      error: null,
    });
    downloadMock.mockResolvedValue({ data: new Blob(['pdf'], { type: 'application/pdf' }), error: null });

    const file = await loadTradeAttachmentFile(shipperFile, 'shipper-uid');

    expect(file.name).toBe('invoice.pdf');
    expect(tradeQueryMock).not.toHaveBeenCalled();
  });

  it('Case B — 아직 수락하지 않아 배정이 안 된 포워더는 열 수 없다', async () => {
    forwarderSession();
    // 미배정 거래는 RLS로 조회되지 않는다 → data 없음
    tradeQueryMock.mockReturnValue({ data: null, error: null });

    await expect(loadTradeAttachmentFile(shipperFile, 'forwarder-uid')).rejects.toMatchObject({
      code: 'STORAGE_PATH_USER_MISMATCH',
    });
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('Case C — 수락해 배정된 포워더는 그 거래 파일을 연다', async () => {
    forwarderSession();
    tradeQueryMock.mockReturnValue({ data: { forwarder_user_id: 'forwarder-uid' }, error: null });
    downloadMock.mockResolvedValue({ data: new Blob(['pdf'], { type: 'application/pdf' }), error: null });

    const file = await loadTradeAttachmentFile(shipperFile, 'forwarder-uid');

    expect(file).toBeInstanceOf(File);
    expect(downloadMock).toHaveBeenCalledWith(shipperFile.storagePath);
  });

  it('Case D — 다른 포워더가 배정된 거래의 파일은 열 수 없다', async () => {
    forwarderSession();
    tradeQueryMock.mockReturnValue({ data: { forwarder_user_id: 'another-forwarder' }, error: null });

    await expect(loadTradeAttachmentFile(shipperFile, 'forwarder-uid')).rejects.toMatchObject({
      code: 'STORAGE_PATH_USER_MISMATCH',
    });
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('Case E — 배정이 해제되면 기존 포워더도 더 이상 열 수 없다', async () => {
    forwarderSession();
    tradeQueryMock.mockReturnValue({ data: { forwarder_user_id: null }, error: null });

    await expect(loadTradeAttachmentFile(shipperFile, 'forwarder-uid')).rejects.toMatchObject({
      code: 'STORAGE_PATH_USER_MISMATCH',
    });
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('거래 저장 전(draft) 경로는 배정받은 거래의 첨부 목록에 있을 때만 연다', async () => {
    forwarderSession();
    const draftFile: TradeAttachment = {
      ...attachment,
      storagePath: 'shipper-uid/draft/commercial_invoice/ci.pdf',
    };
    tradeQueryMock.mockReturnValue({
      data: [{ form_data: { attachments: [{ storagePath: draftFile.storagePath }] } }],
      error: null,
    });
    downloadMock.mockResolvedValue({ data: new Blob(['pdf'], { type: 'application/pdf' }), error: null });

    await expect(loadTradeAttachmentFile(draftFile, 'forwarder-uid')).resolves.toBeInstanceOf(File);

    tradeQueryMock.mockReturnValue({ data: [{ form_data: { attachments: [] } }], error: null });
    await expect(loadTradeAttachmentFile(draftFile, 'forwarder-uid')).rejects.toMatchObject({
      code: 'STORAGE_PATH_USER_MISMATCH',
    });
  });
});
