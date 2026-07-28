import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  autoFillDocumentFields,
  generateContextualFeedback,
  suggestHSCode,
} from './claudeService';

beforeEach(() => {
  invokeMock.mockReset();
});

describe('openai-assistant Edge Function 서비스', () => {
  it('HS Code 추천 body를 전달하고 suggestions를 매핑한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        action: 'suggest-hs-code',
        itemName: '노트북',
        suggestions: [{
          code: '8471.30.0000',
          description: '휴대용 자동자료처리기계',
          confidence: '높음',
          reasoning: '휴대용 컴퓨터에 해당',
        }],
        source: 'openai',
      },
      error: null,
    });

    const result = await suggestHSCode('노트북');

    expect(invokeMock).toHaveBeenCalledWith('openai-assistant', {
      body: { action: 'suggest-hs-code', itemName: '노트북' },
    });
    expect(result).toEqual([{
      code: '8471.30.0000',
      description: '휴대용 자동자료처리기계',
      confidence: '높음',
      reasoning: '휴대용 컴퓨터에 해당',
    }]);
  });

  it('잘못된 suggestions 응답은 빈 배열로 처리해 호출측 사전 폴백을 허용한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        action: 'suggest-hs-code',
        suggestions: [{ code: '8471', description: 123 }],
        source: 'openai',
      },
      error: null,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(suggestHSCode('노트북')).resolves.toEqual([]);
  });

  it('자연어 피드백 body를 그대로 전달하고 문자열을 반환한다', async () => {
    const profile = {
      tradeType: 'export', itemName: '반도체', incoterms: 'FOB',
      loadPort: '부산', dischargePort: 'LA',
    };
    const issueMessages = ['중량을 입력하세요.'];
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        action: 'generate-feedback',
        feedback: '중량 정보를 보완하세요.',
        source: 'openai',
      },
      error: null,
    });

    await expect(generateContextualFeedback(profile, issueMessages))
      .resolves.toBe('중량 정보를 보완하세요.');
    expect(invokeMock).toHaveBeenCalledWith('openai-assistant', {
      body: { action: 'generate-feedback', profile, issueMessages },
    });
  });

  it('문서 자동 채움 body를 전달하고 기존 반환 타입으로 매핑한다', async () => {
    const profile = { itemName: '기계 부품', companyName: '테스트상사', tradeType: 'export' };
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        action: 'auto-fill-document',
        fields: {
          itemDescription: 'Industrial machine parts',
          paymentTerms: 'T/T in advance',
          currency: 'USD',
        },
        source: 'openai',
      },
      error: null,
    });

    const result = await autoFillDocumentFields(profile);

    expect(invokeMock).toHaveBeenCalledWith('openai-assistant', {
      body: { action: 'auto-fill-document', profile },
    });
    expect(result).toEqual({
      itemDescription: 'Industrial machine parts',
      paymentTerms: 'T/T in advance',
      currency: 'USD',
    });
  });

  it('functions.invoke error를 호출측에 전달한다', async () => {
    const edgeError = new Error('network');
    invokeMock.mockResolvedValue({ data: null, error: edgeError });

    await expect(suggestHSCode('노트북')).rejects.toBe(edgeError);
  });

  it('success:false의 서버 오류 메시지를 호출측에 전달한다', async () => {
    invokeMock.mockResolvedValue({
      data: { success: false, error: 'OpenAI quota exceeded' },
      error: null,
    });

    await expect(generateContextualFeedback({
      tradeType: 'import', itemName: '원자재', incoterms: 'CIF',
      loadPort: '상하이', dischargePort: '부산',
    }, ['검토 필요'])).rejects.toThrow('OpenAI quota exceeded');
  });

  it('잘못된 feedback과 fields 응답을 예외로 전달한다', async () => {
    invokeMock
      .mockResolvedValueOnce({
        data: { success: true, action: 'generate-feedback', feedback: 123, source: 'openai' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          action: 'auto-fill-document',
          fields: { itemDescription: 'Goods', paymentTerms: null, currency: 'USD' },
          source: 'openai',
        },
        error: null,
      });

    await expect(generateContextualFeedback({
      tradeType: 'export', itemName: '상품', incoterms: 'FOB',
      loadPort: '부산', dischargePort: '도쿄',
    }, [])).rejects.toThrow('응답 형식');
    await expect(autoFillDocumentFields({
      itemName: '상품', companyName: '회사', tradeType: 'export',
    })).rejects.toThrow('응답 형식');
  });
});
