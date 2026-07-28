/**
 * OpenAI 기능 서비스.
 *
 * 프론트엔드는 Supabase Edge Function인 openai-assistant를 호출합니다.
 * OpenAI API 키와 실제 프롬프트는 Supabase Secret 및 Edge Function에서 관리합니다.
 *
 * 파일명은 기존 코드의 import 경로 호환을 위해 claudeService.ts로 유지합니다.
 */

import { supabase } from '../lib/supabase';

/**
 * unknown 타입의 값이 일반 객체인지 확인합니다.
 */
function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Supabase openai-assistant Edge Function을 호출합니다.
 *
 * Edge Function의 공통 응답 형식:
 *
 * {
 *   success: true,
 *   ...
 * }
 */
async function invokeOpenAIAssistant(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data, error } =
    await supabase.functions.invoke(
      'openai-assistant',
      {
        body,
      }
    );

  if (error) {
    // 원본 에러 객체를 그대로 호출측에 전달한다(참조 보존). Error가 아닌 값만 메시지로 감싼다.
    throw error instanceof Error
      ? error
      : new Error(
          (isRecord(error) && typeof error.message === 'string' && error.message) ||
            'OpenAI Assistant Edge Function 요청에 실패했습니다.'
        );
  }

  if (
    !isRecord(data) ||
    data.success !== true
  ) {
    const errorMessage =
      isRecord(data) &&
      typeof data.error === 'string'
        ? data.error
        : 'OpenAI Assistant Edge Function 호출에 실패했습니다.';

    throw new Error(errorMessage);
  }

  return data;
}

/**
 * LLM 응답 문자열에서 JSON 본문만 추출합니다.
 *
 * 기존 코드 또는 테스트에서 사용하는 공개 유틸리티이므로 유지합니다.
 */
export function extractJson(
  text: string
): string {
  const fenced = text.match(
    /```(?:json)?\s*([\s\S]*?)```/
  );

  return (
    fenced
      ? fenced[1]
      : text
  ).trim();
}

/**
 * HS Code 추천 결과
 */
export interface HSCodeSuggestion {
  code: string;
  description: string;
  confidence: string;
  reasoning: string;
}

/**
 * 품목명을 바탕으로 HS Code 후보를 추천합니다.
 *
 * 실제 OpenAI 호출은 Supabase Edge Function 내부에서 수행합니다.
 *
 * 응답 형식이 잘못된 경우 빈 배열을 반환하여
 * HSCodeAgent가 관세청 사전 검색으로 계속 폴백할 수 있도록 합니다.
 */
export async function suggestHSCode(
  itemName: string
): Promise<HSCodeSuggestion[]> {
  const normalizedItemName =
    itemName.trim();

  if (!normalizedItemName) {
    return [];
  }

  const data =
    await invokeOpenAIAssistant({
      action: 'suggest-hs-code',
      itemName: normalizedItemName,
    });

  if (
    data.action !== 'suggest-hs-code' ||
    data.source !== 'openai' ||
    !Array.isArray(data.suggestions)
  ) {
    console.warn(
      '[OpenAI HS Code] Edge Function 응답 형식이 올바르지 않아 관세청 사전 검색으로 폴백합니다.'
    );

    return [];
  }

  const suggestions: HSCodeSuggestion[] =
    [];

  for (const value of data.suggestions) {
    if (
      !isRecord(value) ||
      typeof value.code !== 'string' ||
      typeof value.description !==
        'string' ||
      typeof value.confidence !==
        'string' ||
      typeof value.reasoning !== 'string'
    ) {
      console.warn(
        '[OpenAI HS Code] 후보 데이터 형식이 올바르지 않아 관세청 사전 검색으로 폴백합니다.'
      );

      return [];
    }

    const code = value.code.trim();

    /*
     * 코드가 없는 후보는 실제 HS Code 추천값으로 사용할 수 없으므로
     * 결과에서 제외합니다.
     */
    if (!code) {
      continue;
    }

    suggestions.push({
      code,
      description:
        value.description.trim(),
      confidence:
        value.confidence.trim(),
      reasoning:
        value.reasoning.trim(),
    });
  }

  return suggestions;
}

/**
 * 자연어 기반 검증 피드백을 생성합니다.
 */
export async function generateContextualFeedback(
  profile: {
    tradeType: string;
    itemName: string;
    incoterms: string;
    loadPort: string;
    dischargePort: string;
  },
  issueMessages: string[]
): Promise<string> {
  const data =
    await invokeOpenAIAssistant({
      action: 'generate-feedback',
      profile,
      issueMessages,
    });

  if (
    data.action !==
      'generate-feedback' ||
    data.source !== 'openai' ||
    typeof data.feedback !== 'string'
  ) {
    throw new Error(
      '자연어 피드백 Edge Function 응답 형식이 올바르지 않습니다.'
    );
  }

  const feedback = data.feedback.trim();

  if (!feedback) {
    throw new Error(
      'OpenAI가 빈 피드백을 반환했습니다.'
    );
  }

  return feedback;
}

/**
 * 문서 작성에 필요한 선택 필드를 자동 추천합니다.
 *
 * API 호출 실패 또는 응답 형식 오류는 호출 측인 DocumentAgent로 전달합니다.
 * DocumentAgent에서 필요한 기본값 처리와 오류 로그를 담당합니다.
 */
export async function autoFillDocumentFields(
  profile: {
    itemName: string;
    companyName: string;
    tradeType: string;
  }
): Promise<{
  itemDescription: string;
  paymentTerms: string;
  currency: string;
}> {
  const data =
    await invokeOpenAIAssistant({
      action: 'auto-fill-document',
      profile,
    });

  const fields = data.fields;

  if (
    data.action !==
      'auto-fill-document' ||
    data.source !== 'openai' ||
    !isRecord(fields) ||
    typeof fields.itemDescription !==
      'string' ||
    typeof fields.paymentTerms !==
      'string' ||
    typeof fields.currency !== 'string'
  ) {
    throw new Error(
      '문서 자동 채움 Edge Function 응답 형식이 올바르지 않습니다.'
    );
  }

  const itemDescription =
    fields.itemDescription.trim();

  const paymentTerms =
    fields.paymentTerms.trim();

  const currency =
    fields.currency.trim();

  if (
    !itemDescription ||
    !paymentTerms ||
    !currency
  ) {
    throw new Error(
      '문서 자동 채움 Edge Function이 빈 필드를 반환했습니다.'
    );
  }

  return {
    itemDescription,
    paymentTerms,
    currency,
  };
}