/**
 * 품목 설명 정규화 — 자연어(한글 가능) → 무역서류용 영문 품명.
 *
 * 예) "검정색 남자 가죽 재질의 재킷입니다"
 *   → baseName   "Men's Leather Jacket"  (품명: C/I·P/L·B/L·수출신고서 공통)
 *   → detail     "Black"                 (상세: C/I 품명 뒤, 수출신고서 규격란)
 *   → attributes { material: "leather", gender: "men" }  (HS 분류 추천 입력)
 *
 * 변환은 Edge Function(openai-assistant, action: normalize-goods-description)에서 하고,
 * 입력에 없는 사실은 만들지 않도록 프롬프트와 응답 검증으로 제한한다.
 */
import { supabase } from '../lib/supabase';
import type { HSCodeItemDetails } from '../types/hsCodeSuggestion';

export interface NormalizedGoodsDescription {
  baseName: string;
  detail: string;
  attributes: HSCodeItemDetails;
}

const HANGUL = /[가-힣]/;

/** Edge Function 오류 본문에서 사람이 읽을 수 있는 사유를 뽑는다. */
async function readEdgeErrorDetail(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (!context || typeof (context as Response).text !== 'function') return '';
  try {
    const body = await (context as Response).clone().text();
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : '';
  } catch {
    return '';
  }
}

export async function normalizeGoodsDescription(
  text: string,
  currentItemName?: string,
): Promise<NormalizedGoodsDescription> {
  const description = text.trim();
  if (!description && !currentItemName?.trim()) {
    throw new Error('품목 설명을 입력해 주세요.');
  }

  const { data, error } = await supabase.functions.invoke('openai-assistant', {
    body: {
      action: 'normalize-goods-description',
      text: description,
      currentItemName: currentItemName?.trim() ?? '',
    },
  });

  if (error) {
    const detail = await readEdgeErrorDetail(error);
    throw new Error(detail || '품명을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!data || data.success !== true || typeof data.baseName !== 'string') {
    throw new Error(
      typeof data?.error === 'string' ? data.error : '품명 정리 결과가 올바르지 않습니다.',
    );
  }

  const baseName = data.baseName.trim();
  const detail = typeof data.detail === 'string' ? data.detail.trim() : '';
  // 서버에서도 막지만, 서류에 한글이 섞이면 안 되므로 한 번 더 확인한다.
  if (!baseName || HANGUL.test(baseName) || HANGUL.test(detail)) {
    throw new Error('영문 품명을 만들지 못했습니다. 설명을 조금 더 구체적으로 적어 주세요.');
  }

  const attributes: HSCodeItemDetails = {};
  if (data.attributes && typeof data.attributes === 'object') {
    for (const [key, value] of Object.entries(data.attributes as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim() && !HANGUL.test(value)) {
        (attributes as Record<string, string>)[key] = value.trim();
      }
    }
  }

  return { baseName, detail, attributes };
}

/**
 * HS 재추천에 넘길 상세 입력.
 * 사용자가 적은 상세 문구는 specification 으로, 정규화에서 얻은 속성은 그대로 합친다.
 */
export function buildHSItemDetails(
  detail: string | undefined,
  attributes: HSCodeItemDetails = {},
): HSCodeItemDetails {
  const specification = (detail ?? '').trim();
  return {
    ...attributes,
    ...(specification ? { specification } : {}),
  };
}
