import { describe, it, expect } from 'vitest';
import {
  parseSendRequest,
  findMissingDocumentTypes,
  DOCX_MIME_TYPE,
} from './validation';

const VALID_TRADE_ID = '11111111-1111-1111-1111-111111111111';

function validDocument(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    document_type: 'invoice',
    file_name: 'Commercial_Invoice.docx',
    mime_type: DOCX_MIME_TYPE,
    data_url: `data:${DOCX_MIME_TYPE};base64,QUJD`,
    ...overrides,
  };
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    trade_id: VALID_TRADE_ID,
    recipient_email: 'forwarder@example.com',
    recipient_company: 'ABC Logistics',
    recipient_name: '홍길동',
    message: '안녕하세요.',
    documents: [validDocument()],
    ...overrides,
  };
}

describe('parseSendRequest', () => {
  it('유효한 요청을 정상적으로 파싱한다', () => {
    const parsed = parseSendRequest(validBody());
    expect(parsed.tradeId).toBe(VALID_TRADE_ID);
    expect(parsed.recipientEmail).toBe('forwarder@example.com');
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0].documentType).toBe('invoice');
  });

  it('trade_id가 uuid 형식이 아니면 거부한다', () => {
    expect(() => parseSendRequest(validBody({ trade_id: 'not-a-uuid' }))).toThrow();
  });

  it('이메일 형식이 올바르지 않으면 거부한다', () => {
    expect(() => parseSendRequest(validBody({ recipient_email: 'not-an-email' }))).toThrow();
  });

  it('문서타입 enum에 없는 값이면 거부한다', () => {
    expect(() =>
      parseSendRequest(validBody({ documents: [validDocument({ document_type: 'certificate_of_origin' })] })),
    ).toThrow();
  });

  it('mime_type이 mismatch면 거부한다', () => {
    expect(() =>
      parseSendRequest(
        validBody({
          documents: [
            validDocument({
              mime_type: DOCX_MIME_TYPE,
              data_url: 'data:application/pdf;base64,QUJD',
            }),
          ],
        }),
      ),
    ).toThrow();
  });

  it('base64가 아닌 데이터면 거부한다', () => {
    expect(() =>
      parseSendRequest(
        validBody({ documents: [validDocument({ data_url: `data:${DOCX_MIME_TYPE};base64,not base64!!` })] }),
      ),
    ).toThrow();
  });

  it('문서를 하나도 선택하지 않으면 거부한다', () => {
    expect(() => parseSendRequest(validBody({ documents: [] }))).toThrow();
  });

  it('같은 문서 종류가 중복되면 거부한다', () => {
    expect(() =>
      parseSendRequest(validBody({ documents: [validDocument(), validDocument()] })),
    ).toThrow();
  });

  it('선적 안내는 H/B/L 첨부가 있어야 하며 종류를 구분한다', () => {
    expect(() => parseSendRequest(validBody({ delivery_kind: 'shipment_notice' }))).toThrow('H/B/L');
    const parsed = parseSendRequest(validBody({
      delivery_kind: 'shipping_advice',
      documents: [validDocument({ document_type: 'bill_of_lading' })],
    }));
    expect(parsed.deliveryKind).toBe('shipping_advice');
    expect(() => parseSendRequest(validBody({ delivery_kind: 'unknown' }))).toThrow('지원하지 않는 이메일 종류');
  });
});

describe('findMissingDocumentTypes', () => {
  it('실제 거래에 존재하는 문서만 통과시킨다', () => {
    const documents = [
      { documentType: 'invoice' as const, fileName: 'a.docx', mimeType: DOCX_MIME_TYPE, dataUrl: '' },
    ];
    expect(findMissingDocumentTypes(documents, { invoice: {} })).toEqual([]);
  });

  it('거래에 없는 문서 타입을 요청하면 missing으로 반환한다', () => {
    const documents = [
      { documentType: 'bill_of_lading' as const, fileName: 'a.docx', mimeType: DOCX_MIME_TYPE, dataUrl: '' },
    ];
    expect(findMissingDocumentTypes(documents, { invoice: {} })).toEqual(['bill_of_lading']);
  });

  it('generatedDocuments 자체가 없으면 모두 missing으로 반환한다', () => {
    const documents = [
      { documentType: 'invoice' as const, fileName: 'a.docx', mimeType: DOCX_MIME_TYPE, dataUrl: '' },
    ];
    expect(findMissingDocumentTypes(documents, null)).toEqual(['invoice']);
  });
});
