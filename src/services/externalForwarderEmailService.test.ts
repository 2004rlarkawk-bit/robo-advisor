// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedTrade } from '../types';

const { invokeMock, getSessionMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: getSessionMock },
    functions: { invoke: invokeMock },
  },
}));

vi.mock('./invoiceDocxService', () => ({
  buildInvoiceDocx: vi.fn(async () => new Blob(['invoice'], { type: 'application/octet-stream' })),
}));
vi.mock('./packingListDocxService', () => ({
  buildPackingListDocx: vi.fn(async () => new Blob(['packing'], { type: 'application/octet-stream' })),
}));
vi.mock('./billOfLadingDocxService', () => ({
  buildBillOfLadingDocx: vi.fn(async () => new Blob(['bl'], { type: 'application/octet-stream' })),
}));
vi.mock('./transportRequestDocxService', () => ({
  buildTransportRequestDocx: vi.fn(async () => new Blob(['sr'], { type: 'application/octet-stream' })),
}));

import { getAttachableDocumentTypes, sendExternalForwarderEmail, sendForwarderDocumentEmail } from './externalForwarderEmailService';

function makeTrade(generatedDocs: SavedTrade['generatedDocs']): SavedTrade {
  return {
    id: 'trade-1',
    profile: { tradeType: 'export' } as SavedTrade['profile'],
    documents: [],
    issues: [],
    generatedDocs,
    createdAt: '2026-09-13T00:00:00.000Z',
  } as SavedTrade;
}

describe('getAttachableDocumentTypes', () => {
  it('실제 존재하는 문서만 반환한다', () => {
    const trade = makeTrade({ invoice: {} as never, packingList: {} as never });
    expect(getAttachableDocumentTypes(trade)).toEqual(['invoice', 'packing_list']);
  });

  it('Certificate of Origin은 존재해도 절대 포함하지 않는다 (파일 생성기가 없음)', () => {
    const trade = makeTrade({
      invoice: {} as never,
      certificateOfOrigin: {} as never,
    });
    expect(getAttachableDocumentTypes(trade)).toEqual(['invoice']);
  });

  it('B/L이 없는 거래에서는 bill_of_lading을 제외한다', () => {
    const trade = makeTrade({ transportRequest: {} as never });
    expect(getAttachableDocumentTypes(trade)).toEqual(['transport_request']);
  });

  it('생성된 문서가 전혀 없으면 빈 배열을 반환한다', () => {
    expect(getAttachableDocumentTypes(makeTrade(undefined))).toEqual([]);
  });
});

describe('sendExternalForwarderEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
      error: null,
    });
  });

  it('Edge Function 오류 시 원문 대신 고정된 한국어 안내 메시지를 던진다', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Internal secret leak detail' } });
    const trade = makeTrade({ invoice: {} as never });

    await expect(
      sendExternalForwarderEmail({
        trade,
        recipientEmail: 'forwarder@example.com',
        recipientCompany: 'ABC',
        recipientName: '홍길동',
        message: '메시지',
        documentTypes: ['invoice'],
      }),
    ).rejects.toThrow('이메일 전송에 실패했습니다. 이메일 주소 또는 네트워크 상태를 확인한 후 다시 시도해 주세요.');
  });

  it('성공 시 base64 data_url을 포함한 문서 배열을 Edge Function에 전달한다', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    const trade = makeTrade({ invoice: {} as never });

    await sendExternalForwarderEmail({
      trade,
      recipientEmail: 'forwarder@example.com',
      recipientCompany: 'ABC',
      recipientName: '홍길동',
      message: '메시지',
      documentTypes: ['invoice'],
    });

    expect(invokeMock).toHaveBeenCalledWith(
      'send-forwarder-request-email',
      expect.objectContaining({
        body: expect.objectContaining({
          trade_id: 'trade-1',
          recipient_email: 'forwarder@example.com',
          documents: [
            expect.objectContaining({ document_type: 'invoice', file_name: expect.stringMatching(/^PortAI_commercial\.invoice_\d{2}\.\d{2}\.docx$/) }),
          ],
        }),
        headers: { Authorization: 'Bearer token-123' },
      }),
    );
  });

  it('수출 포워더 선적완료 알림은 운송의뢰와 다른 메일 종류로 보낸다', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    const trade = makeTrade({ billOfLading: {} as never });
    await sendForwarderDocumentEmail({
      trade, deliveryKind: 'shipment_notice', recipientEmail: 'shipper@example.com',
      recipientCompany: '화주', recipientName: '', message: '선적 완료', documentTypes: ['bill_of_lading'],
    });
    expect(invokeMock).toHaveBeenCalledWith('send-forwarder-request-email', expect.objectContaining({
      body: expect.objectContaining({ delivery_kind: 'shipment_notice', recipient_email: 'shipper@example.com' }),
    }));
  });

  it('문서를 하나도 선택하지 않으면 Edge Function을 호출하지 않고 에러를 던진다', async () => {
    const trade = makeTrade({ invoice: {} as never });
    await expect(
      sendExternalForwarderEmail({
        trade,
        recipientEmail: 'forwarder@example.com',
        recipientCompany: 'ABC',
        recipientName: '홍길동',
        message: '메시지',
        documentTypes: [],
      }),
    ).rejects.toThrow('보낼 문서를 하나 이상 선택해 주세요.');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
