/**
 * Claude API 서비스
 * 
 * 프로토타입 버전: 사용자가 Settings 페이지에서 API 키를 입력하면
 * 클라이언트에서 직접 Claude API를 호출합니다.
 * 
 * CORS 제한 때문에 브라우저에서 직접 호출이 불가할 수 있으므로,
 * 프록시 서버를 통하거나, 데모용 시뮬레이션 모드를 제공합니다.
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

function getApiKey(): string | null {
  return localStorage.getItem('portai_claude_api_key');
}

export function setApiKey(key: string): void {
  localStorage.setItem('portai_claude_api_key', key);
}

export function hasApiKey(): boolean {
  const key = getApiKey();
  return !!key && key.length > 10;
}

export function clearApiKey(): void {
  localStorage.removeItem('portai_claude_api_key');
}

/** Claude API 직접 호출 (프록시 필요 시 URL 교체) */
async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다. 설정 페이지에서 Claude API 키를 입력해 주세요.');
  }

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Claude API 오류 (${response.status}): ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '응답을 받지 못했습니다.';
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      // CORS or network error - fall back to simulation
      console.warn('Claude API 직접 호출 실패 (CORS). 시뮬레이션 모드로 전환합니다.');
      throw new Error('CORS_ERROR');
    }
    throw error;
  }
}

// ===== HS Code 추천 =====
export interface HSCodeSuggestion {
  code: string;
  description: string;
  confidence: string;
  reasoning: string;
}

export async function suggestHSCode(itemName: string): Promise<HSCodeSuggestion[]> {
  const systemPrompt = `당신은 한국 관세청의 HS CODE(관세·통계통합품목분류표) 전문가입니다.
사용자가 입력한 품목명을 분석하여 가장 적합한 HS CODE 후보 3개를 추천해 주세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
[
  {
    "code": "8479.89.9090",
    "description": "기계류 - 기타 기계와 기계적 장치",
    "confidence": "높음",
    "reasoning": "산업용 부품이 포함되는 일반 기계류 분류"
  }
]`;

  const userMessage = `품목명: "${itemName}"

위 품목에 적합한 HS CODE 후보 3개를 추천해 주세요.`;

  try {
    const response = await callClaude(systemPrompt, userMessage);
    const parsed = JSON.parse(response);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error instanceof Error && error.message === 'CORS_ERROR') {
      return getSimulatedHSCodeSuggestions(itemName);
    }
    // JSON 파싱 실패 시에도 시뮬레이션
    console.warn('HS Code 추천 응답 파싱 실패, 시뮬레이션 모드 사용');
    return getSimulatedHSCodeSuggestions(itemName);
  }
}

// ===== 자연어 맥락 피드백 생성 =====
export async function generateContextualFeedback(
  profile: { tradeType: string; itemName: string; incoterms: string; loadPort: string; dischargePort: string },
  issueMessages: string[]
): Promise<string> {
  const systemPrompt = `당신은 수출입 통관 전문 컨설턴트입니다.
사용자의 거래 정보와 발견된 문제점을 분석하여, 실무적이고 구체적인 자연어 피드백을 제공하세요.
전문 용어를 사용하되, 비전문가도 이해할 수 있도록 친절하게 설명하세요.
200자 이내로 간결하게 작성하세요.`;

  const userMessage = `거래 정보:
- 유형: ${profile.tradeType === 'export' ? '수출' : '수입'}
- 품목: ${profile.itemName}
- 거래조건: ${profile.incoterms}
- 경로: ${profile.loadPort} → ${profile.dischargePort}

발견된 문제:
${issueMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}

위 문제들에 대해 실무적 관점에서 종합적인 피드백을 제공해 주세요.`;

  try {
    return await callClaude(systemPrompt, userMessage);
  } catch (error) {
    if (error instanceof Error && error.message === 'CORS_ERROR') {
      return getSimulatedFeedback(profile, issueMessages);
    }
    return getSimulatedFeedback(profile, issueMessages);
  }
}

// ===== 문서 필드 자동 채움 =====
export async function autoFillDocumentFields(
  profile: { itemName: string; companyName: string; tradeType: string }
): Promise<{ itemDescription: string; paymentTerms: string; currency: string }> {
  const systemPrompt = `당신은 국제 무역 문서 작성 전문가입니다.
주어진 품목명과 업체 정보를 바탕으로, 상업송장에 들어갈 영문 품목 설명, 결제 조건, 통화를 추천해 주세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "itemDescription": "Industrial mechanical parts for manufacturing equipment",
  "paymentTerms": "T/T 30 days after B/L date",
  "currency": "USD"
}`;

  const userMessage = `품목명: ${profile.itemName}
업체명: ${profile.companyName}
거래유형: ${profile.tradeType === 'export' ? '수출' : '수입'}`;

  try {
    const response = await callClaude(systemPrompt, userMessage);
    return JSON.parse(response);
  } catch {
    return {
      itemDescription: `${profile.itemName} (commercial goods)`,
      paymentTerms: 'T/T in advance',
      currency: 'USD'
    };
  }
}

// ===== 시뮬레이션 폴백 (API 키 없거나 CORS 실패 시) =====

function getSimulatedHSCodeSuggestions(itemName: string): HSCodeSuggestion[] {
  const lowerName = itemName.toLowerCase();
  
  if (lowerName.includes('부품') || lowerName.includes('기계') || lowerName.includes('산업')) {
    return [
      { code: '8479.89.9090', description: '기계류 - 기타 기계와 기계적 장치', confidence: '높음', reasoning: '산업용 부품이 포함되는 일반 기계류 분류' },
      { code: '8483.40.9000', description: '기어·기어장치 등의 부분품', confidence: '보통', reasoning: '기계부품 중 동력전달 부품에 해당할 경우' },
      { code: '7326.90.9000', description: '철강 제품 - 기타 제품', confidence: '낮음', reasoning: '금속 재질의 일반 산업용 부품일 경우' }
    ];
  }
  
  if (lowerName.includes('it') || lowerName.includes('전자') || lowerName.includes('원자재')) {
    return [
      { code: '8517.62.0000', description: '통신기기용 기기 - 수신·변환·송신용', confidence: '높음', reasoning: 'IT/통신 장비 및 관련 원자재' },
      { code: '8542.31.0000', description: '전자집적회로 - 프로세서 및 컨트롤러', confidence: '보통', reasoning: '반도체/IC 부품일 경우' },
      { code: '8534.00.0000', description: '인쇄회로', confidence: '낮음', reasoning: 'PCB 또는 회로기판 원자재일 경우' }
    ];
  }

  return [
    { code: '9999.99.0000', description: '일반 상품 - 분류 미확정', confidence: '낮음', reasoning: '정확한 분류를 위해 더 구체적인 품목 정보가 필요합니다' },
    { code: '8479.89.9090', description: '기계류 - 기타 기계와 기계적 장치', confidence: '낮음', reasoning: '일반적인 산업용 물품 분류' },
    { code: '3926.90.9000', description: '플라스틱 제품 - 기타', confidence: '낮음', reasoning: '플라스틱 재질의 물품일 경우' }
  ];
}

function getSimulatedFeedback(
  profile: { tradeType: string; itemName: string; incoterms: string; loadPort: string; dischargePort: string },
  issueMessages: string[]
): string {
  const tradeTypeText = profile.tradeType === 'export' ? '수출' : '수입';
  const parts: string[] = [];

  parts.push(`${profile.itemName}을(를) ${profile.incoterms || '미지정'} 조건으로 ${profile.loadPort || '미지정항'}에서 ${tradeTypeText}하시는 건에 대한 분석 결과입니다.`);
  
  for (const msg of issueMessages) {
    if (msg.includes('중량')) {
      parts.push(`통관 시 패킹리스트에 총중량(Gross Weight)과 순중량(Net Weight)이 반드시 기재되어야 합니다. 세관에서 반려될 수 있으니 kg 단위로 정확히 입력해 주세요.`);
    } else if (msg.includes('HS CODE') || msg.includes('HS Code')) {
      parts.push(`HS CODE는 최소 6자리 이상의 숫자여야 하며, 관세율 및 규제 요건을 결정하는 핵심 정보입니다. 관세청 품목분류 조회 서비스에서 정확한 코드를 확인하시길 권합니다.`);
    } else if (msg.includes('원산지')) {
      parts.push(`${tradeTypeText} 거래 시 원산지증명서(C/O)가 필요합니다. FTA 협정세율 적용을 위해서는 원산지 기준 충족 여부를 반드시 확인해 주세요.`);
    } else if (msg.includes('선적항') || msg.includes('항구')) {
      parts.push(`선하증권(B/L) 발급을 위해 선적항과 도착항 정보가 필수입니다.`);
    }
  }

  return parts.join('\n\n');
}
