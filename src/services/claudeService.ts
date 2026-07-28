/**
 * OpenAI 기능 서비스.
 *
 * 프론트는 Supabase Edge Function openai-assistant를 호출하며,
 * OpenAI API 키와 프롬프트는 서버 Secret 및 Edge Function에서 관리된다.
 * 파일명은 기존 import 호환을 위해 유지한다.
 */

import { supabase } from '../lib/supabase';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function invokeOpenAIAssistant(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('openai-assistant', { body });

  if (error) throw error;
  if (!isRecord(data) || data.success !== true) {
    throw new Error(
      isRecord(data) && typeof data.error === 'string'
        ? data.error
        : 'OpenAI Assistant Edge Function 호출에 실패했습니다.'
    );
  }

  return data;
}

/** LLM 문자열에서 JSON 본문을 추출하는 기존 공개 유틸리티. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export interface HSCodeSuggestion {
  code: string;
  description: string;
  confidence: string;
  reasoning: string;
}

export async function suggestHSCode(itemName: string): Promise<HSCodeSuggestion[]> {
  const data = await invokeOpenAIAssistant({
    action: 'suggest-hs-code',
    itemName,
  });

  if (data.action !== 'suggest-hs-code' || data.source !== 'openai' || !Array.isArray(data.suggestions)) {
    console.warn('HS Code 추천 Edge Function 응답 형식이 올바르지 않아 사전 검색으로 폴백합니다.');
    return [];
  }

  const suggestions: HSCodeSuggestion[] = [];
  for (const value of data.suggestions) {
    if (
      !isRecord(value) ||
      typeof value.code !== 'string' ||
      typeof value.description !== 'string' ||
      typeof value.confidence !== 'string' ||
      typeof value.reasoning !== 'string'
    ) {
      console.warn('HS Code 추천 Edge Function 후보 형식이 올바르지 않아 사전 검색으로 폴백합니다.');
      return [];
    }
    suggestions.push({
      code: value.code,
      description: value.description,
      confidence: value.confidence,
      reasoning: value.reasoning,
    });
  }

  return suggestions;
}

export async function generateContextualFeedback(
  profile: { tradeType: string; itemName: string; incoterms: string; loadPort: string; dischargePort: string },
  issueMessages: string[]
): Promise<string> {
  const data = await invokeOpenAIAssistant({
    action: 'generate-feedback',
    profile,
    issueMessages,
  });

  if (
    data.action !== 'generate-feedback' ||
    data.source !== 'openai' ||
    typeof data.feedback !== 'string'
  ) {
    throw new Error('자연어 피드백 Edge Function 응답 형식이 올바르지 않습니다.');
  }

  return data.feedback;
}

export async function autoFillDocumentFields(
  profile: { itemName: string; companyName: string; tradeType: string }
): Promise<{ itemDescription: string; paymentTerms: string; currency: string }> {
  const data = await invokeOpenAIAssistant({
    action: 'auto-fill-document',
    profile,
  });
  const fields = data.fields;

  if (
    data.action !== 'auto-fill-document' ||
    data.source !== 'openai' ||
    !isRecord(fields) ||
    typeof fields.itemDescription !== 'string' ||
    typeof fields.paymentTerms !== 'string' ||
    typeof fields.currency !== 'string'
  ) {
    throw new Error('문서 자동 채움 Edge Function 응답 형식이 올바르지 않습니다.');
  }

  return {
    itemDescription: fields.itemDescription,
    paymentTerms: fields.paymentTerms,
    currency: fields.currency,
  };
}
