import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './index';

const openAIFetchMock = vi.fn();
/** Auth API(/auth/v1/user) 응답 — 기본은 로그인한 사용자. 테스트에서 바꿔 401을 흉내낸다. */
let authResponse: Response;

/** 함수가 인증 확인(fetch)과 OpenAI 호출(fetch)을 모두 하므로 URL로 갈라 준다. */
function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/auth/v1/user')) return Promise.resolve(authResponse.clone());
  return openAIFetchMock(input, init) as Promise<Response>;
}

const ENV: Record<string, string> = {
  OPENAI_API_KEY: 'test-key',
  SUPABASE_URL: 'http://supabase.test',
  SUPABASE_ANON_KEY: 'anon-key',
};

/** 로그인한 사용자의 요청 — Authorization 헤더가 붙는다. */
function authedRequest(body: unknown): Request {
  return new Request('http://local.test', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-token' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  openAIFetchMock.mockReset();
  authResponse = new Response(JSON.stringify({ id: 'user-1', email: 'shipper@example.com' }), { status: 200 });
  vi.stubGlobal('fetch', routedFetch);
  vi.stubGlobal('Deno', {
    env: { get: (key: string) => ENV[key] },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function openAIResponse(output: unknown): Response {
  return new Response(JSON.stringify({
    status: 'completed',
    output_text: JSON.stringify(output),
  }), { status: 200 });
}

describe('openai-assistant suggest-hs-code 하위 호환', () => {
  it('candidateCodes가 없으면 기존 배열형 OpenAI 응답을 유지한다', async () => {
    openAIFetchMock.mockResolvedValue(openAIResponse([{
      code: '8471.30.0000',
      description: '휴대용 자동자료처리기계',
      confidence: '높음',
      reasoning: '휴대용 컴퓨터',
    }]));

    const response = await handler.fetch(authedRequest({
        action: 'suggest-hs-code',
        itemName: '노트북',
      }));
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.suggestions).toEqual([{
      code: '8471.30.0000',
      description: '휴대용 자동자료처리기계',
      confidence: '높음',
      reasoning: '휴대용 컴퓨터',
    }]);
    expect(body.additionalInformationRequired).toBeUndefined();
  });

  it('방향 탐색 모드는 기존 액션 안에서 6자리와 4자리 fallback만 반환한다', async () => {
    openAIFetchMock.mockResolvedValue(openAIResponse({
      suggestedPrefixes: ['8471.30', '8215', '8471300000', 'invalid'],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    }));

    const response = await handler.fetch(authedRequest({
        action: 'suggest-hs-code',
        itemName: 'Laptop computer',
        candidateCodes: [],
        discoveryMode: true,
      }));
    const body = await response.json();

    expect(body.suggestedPrefixes).toEqual(['847130', '8215']);
    expect(body.suggestions).toBeUndefined();
    expect(body.additionalInformationRequired).toBe(false);
  });

  it('candidateCodes가 있으면 후보 밖 코드를 제거하고 판단 보류를 반환한다', async () => {
    openAIFetchMock.mockResolvedValue(openAIResponse({
      suggestions: [{
        code: '9999999999',
        description: '후보 밖 코드',
        confidence: '높음',
        reasoning: '잘못된 추천',
      }],
      additionalInformationRequired: false,
      requiredAdditionalInfo: ['재질'],
    }));

    const response = await handler.fetch(authedRequest({
        action: 'suggest-hs-code',
        itemName: '산업용 제품',
        candidateCodes: [{
          code: '8471300000',
          koreanName: '휴대용 자동자료처리기계',
          englishName: 'Portable automatic data processing machines',
        }],
      }));
    const body = await response.json();

    expect(body.suggestions).toEqual([]);
    expect(body.additionalInformationRequired).toBe(true);
    expect(body.requiredAdditionalInfo).toEqual(['재질']);
  });

  it('후보 기반 판단에서는 높은 근거의 제공 후보만 반환한다', async () => {
    openAIFetchMock.mockResolvedValue(openAIResponse({
      suggestions: [{
        code: '8471.30-0000',
        description: '휴대용 자동자료처리기계',
        confidence: '높음',
        reasoning: '품목 설명과 후보가 일치',
      }],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    }));

    const response = await handler.fetch(authedRequest({
        action: 'suggest-hs-code',
        itemName: '휴대용 노트북 컴퓨터',
        candidateCodes: [{
          code: '8471300000',
          koreanName: '휴대용 자동자료처리기계',
          englishName: 'Portable automatic data processing machines',
        }],
      }));
    const body = await response.json();

    expect(body.suggestions).toEqual([{
      code: '8471300000',
      description: '휴대용 자동자료처리기계',
      confidence: '높음',
      reasoning: '품목 설명과 후보가 일치',
      distinguishingFactors: [],
      missingInformation: [],
    }]);
    expect(body.additionalInformationRequired).toBe(false);
  });

  it('같은 설명이나 근거를 반복한 후보는 제거하고 확정 필요정보는 유지한다', async () => {
    openAIFetchMock.mockResolvedValue(openAIResponse({
      suggestions: [
        {
          code: '6201201000',
          description: '직물제 오버코트',
          confidence: '높음',
          reasoning: '오버코트에 해당',
        },
        {
          code: '6201301000',
          description: '직물제 오버코트',
          confidence: '높음',
          reasoning: '면 소재 후보지만 겉감 확인 필요',
        },
        {
          code: '6201401010',
          description: '합성섬유제 오버코트',
          confidence: '높음',
          reasoning: '오버코트에 해당',
        },
      ],
      additionalInformationRequired: false,
      requiredAdditionalInfo: ['겉감의 섬유 조성 및 함량'],
    }));

    const candidateCodes = [
      '6201201000',
      '6201301000',
      '6201401010',
    ].map((code) => ({
      code,
      koreanName: '오버코트와 이와 유사한 의류',
      englishName: 'Overcoats and similar articles',
      classificationName: '(직물제 의류)',
    }));

    const response = await handler.fetch(authedRequest({
        action: 'suggest-hs-code',
        itemName: "Women's woven cashmere overcoat",
        candidateCodes,
      }));
    const body = await response.json();

    expect(body.suggestions).toEqual([{
      code: '6201201000',
      description: '직물제 오버코트',
      confidence: '높음',
      reasoning: '오버코트에 해당',
      distinguishingFactors: [],
      missingInformation: [],
    }]);
    expect(body.additionalInformationRequired).toBe(true);
    expect(body.requiredAdditionalInfo).toEqual([
      '겉감의 섬유 조성 및 함량',
    ]);
  });

  it('보통 후보를 추가정보 필요 상태와 함께 반환한다', async () => {
    openAIFetchMock.mockResolvedValue(openAIResponse({
      suggestions: [{
        code: '6109101000',
        description: '면으로 만든 편물제 티셔츠',
        confidence: '보통',
        reasoning: '면 편물 티셔츠와 관련 있으나 연령 구분 확인 필요',
        distinguishingFactors: ['면 소재', '편물제 티셔츠'],
        missingInformation: ['성인용 또는 아동용 여부'],
      }],
      additionalInformationRequired: true,
      requiredAdditionalInfo: ['성인용 또는 아동용 여부'],
    }));

    const response = await handler.fetch(authedRequest({
        action: 'suggest-hs-code',
        itemName: "Men's cotton knitted T-shirt",
        candidateCodes: [{
          code: '6109101000',
          koreanName: '면으로 만든 것',
          englishName: 'Of cotton',
          classificationName: '(티셔츠)',
        }],
      }));
    const body = await response.json();

    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].confidence).toBe('보통');
    expect(body.additionalInformationRequired).toBe(true);
    expect(body.requiredAdditionalInfo).toEqual([
      '성인용 또는 아동용 여부',
      '주된 겉감의 재질인지와 정확한 섬유 조성비',
    ]);
  });
});

describe('openai-assistant 인증', () => {
  const body = { action: 'suggest-hs-code', itemName: '노트북' };

  it('Authorization 헤더가 없으면 401이고 OpenAI를 부르지 않는다', async () => {
    const response = await handler.fetch(new Request('http://local.test', {
      method: 'POST',
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(401);
    expect((await response.json()).error).toContain('로그인');
    expect(openAIFetchMock).not.toHaveBeenCalled();
  });

  it('사용자 토큰이 아니면(anon 키 등) 401이고 OpenAI를 부르지 않는다', async () => {
    // Auth API는 anon 키로 물으면 사용자를 돌려주지 않는다.
    authResponse = new Response(JSON.stringify({ message: 'invalid claim' }), { status: 401 });

    const response = await handler.fetch(authedRequest(body));

    expect(response.status).toBe(401);
    expect(openAIFetchMock).not.toHaveBeenCalled();
  });

  it('로그인한 사용자는 평소처럼 통과한다', async () => {
    openAIFetchMock.mockResolvedValue(openAIResponse([{
      code: '8471.30.0000', description: '휴대용 자동자료처리기계', confidence: '높음', reasoning: '휴대용 컴퓨터',
    }]));

    const response = await handler.fetch(authedRequest(body));

    expect(response.status).toBe(200);
    expect(openAIFetchMock).toHaveBeenCalled();
  });
});
