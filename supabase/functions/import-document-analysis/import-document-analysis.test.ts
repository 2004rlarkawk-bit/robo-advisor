import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './index';

const openAIFetchMock = vi.fn();

beforeEach(() => {
  openAIFetchMock.mockReset();
  vi.stubGlobal('fetch', openAIFetchMock);
  vi.stubGlobal('Deno', {
    env: {
      get: (key: string) => key === 'OPENAI_API_KEY' ? 'test-key' : undefined,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function request(documentType: string, fileName = 'random-name.pdf') {
  return new Request('http://local.test', {
    method: 'POST',
    body: JSON.stringify({
      documents: [{
        id: 'document-1',
        fileName,
        mimeType: 'application/pdf',
        documentType,
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
      }],
    }),
  });
}

function openAIResponse(output: unknown): Response {
  return new Response(JSON.stringify({
    status: 'completed',
    output_text: JSON.stringify(output),
    usage: { input_tokens: 10, output_tokens: 20 },
  }), { status: 200 });
}

describe('import-document-analysis 문서 타입 경계', () => {
  it.each(['commercial_invoice', 'packing_list', 'transport_request', 'other'])(
    '%s 타입을 요청 검증에서 허용한다',
    async (documentType) => {
      openAIFetchMock.mockResolvedValue(openAIResponse({
        classifications: [{
          id: 'document-1', type: documentType, confidence: 0.9, summary: 'classified', sourceId: 'document-1',
        }],
        analysis: {
          extracted: { loadPort: '', dischargePort: '' },
          validations: [],
          comparison: [],
        },
      }));

      const response = await handler.fetch(request(documentType));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(openAIFetchMock).toHaveBeenCalledOnce();
    },
  );

  it('수출운송의뢰서의 일부 필드만 있어도 결과를 반환한다', async () => {
    openAIFetchMock.mockResolvedValue(openAIResponse({
      classifications: [{
        id: 'document-1', type: 'transport_request', confidence: 0.98,
        summary: '수출운송의뢰서', sourceId: 'document-1',
      }],
      analysis: {
        extracted: { loadPort: 'BUSAN', dischargePort: 'TOKYO' },
        validations: [],
        comparison: [],
      },
    }));

    const response = await handler.fetch(request('transport_request', '수출운송의뢰서.pdf'));
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.analysis.extracted).toEqual({ loadPort: 'BUSAN', dischargePort: 'TOKYO' });
    const openAIRequest = JSON.parse(openAIFetchMock.mock.calls[0][1].body as string);
    const prompt = openAIRequest.input[0].content[0].text as string;
    expect(prompt).toContain('SHIPPING INSTRUCTION');
    expect(prompt).toContain('일부 필드가 없다는 이유로 분석을 실패시키지 마세요');
    expect(prompt).toContain('TOTAL, GRAND TOTAL');
    expect(prompt).toContain('계산·추정·균등분배하지 말고');
    expect(openAIRequest.text.format.schema.properties.analysis.properties.extracted.properties.items.items.properties)
      .toHaveProperty('grossWeight');
    expect(openAIRequest.text.format.schema.properties.analysis.properties.extracted.properties)
      .toHaveProperty('cargoTotals');
  });

  it('알 수 없는 canonical type은 OpenAI 호출 전에 거절한다', async () => {
    const response = await handler.fetch(request('shipping_request'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain('문서 종류가 올바르지 않습니다');
    expect(openAIFetchMock).not.toHaveBeenCalled();
  });
});
