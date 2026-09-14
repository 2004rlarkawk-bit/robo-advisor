/**
 * 자유 텍스트 입력값 이상치 탐지 (LLM 보조 검증).
 *
 * 회사명·주소·품명은 룰(정규식·사전)로 "말이 되는 값인지"를 판정하기 어렵다.
 * Edge Function(openai-assistant, action: flag-field-anomalies)에 값 목록을 보내
 * 임시값(test/asdf)·필드 뒤바뀜(회사명 칸에 주소)·잘린 값만 골라 받는다.
 *
 * 결과는 "AI 참고" 보완 권장으로만 쓴다 — 생성을 막지 않고, 실패하면 조용히 건너뛴다.
 */
import { supabase } from '../lib/supabase';

export interface AnomalyField {
  field: string;
  label: string;
  value: string;
}
export interface FieldAnomaly {
  field: string;
  reason: string;
}

const DEFAULT_TIMEOUT_MS = 8000;

export async function flagFieldAnomalies(
  fields: AnomalyField[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FieldAnomaly[]> {
  const payload = fields.filter((entry) => entry.value.trim());
  if (!payload.length) return [];

  const request = supabase.functions.invoke('openai-assistant', {
    body: { action: 'flag-field-anomalies', fields: payload },
  });
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`이상치 판정이 ${timeoutMs / 1000}초 안에 끝나지 않았습니다.`)), timeoutMs);
  });

  const { data, error } = await Promise.race([request, timeout]);
  if (error) throw new Error(error.message || '이상치 판정 요청에 실패했습니다.');
  if (!data || data.success !== true || !Array.isArray(data.anomalies)) {
    throw new Error(typeof data?.error === 'string' ? data.error : '이상치 판정 결과가 올바르지 않습니다.');
  }

  const known = new Set(payload.map((entry) => entry.field));
  return (data.anomalies as unknown[])
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      field: typeof entry.field === 'string' ? entry.field : '',
      reason: typeof entry.reason === 'string' ? entry.reason.trim() : '',
    }))
    .filter((entry) => known.has(entry.field) && entry.reason);
}

/** 검증에 보낼 자유 텍스트 필드 목록. 빈 값은 보내지 않는다. */
export function collectAnomalyFields(profile: {
  companyName?: string; companyAddress?: string;
  partnerName?: string; partnerAddress?: string;
  buyerName?: string; buyerAddress?: string;
  itemName?: string; vesselOrFlight?: string;
  shipperItems?: Array<{ itemName?: string }>;
}): AnomalyField[] {
  const fields: AnomalyField[] = [
    { field: 'companyName', label: '수출자 회사명', value: profile.companyName ?? '' },
    { field: 'companyAddress', label: '수출자 주소', value: profile.companyAddress ?? '' },
    { field: 'partnerName', label: '거래처(수입자) 회사명', value: profile.partnerName ?? '' },
    { field: 'partnerAddress', label: '거래처 주소', value: profile.partnerAddress ?? '' },
    { field: 'buyerName', label: 'Buyer 회사명', value: profile.buyerName ?? '' },
    { field: 'buyerAddress', label: 'Buyer 주소', value: profile.buyerAddress ?? '' },
    { field: 'itemName', label: '품명(Goods Description)', value: profile.itemName ?? '' },
    { field: 'vesselOrFlight', label: '선박명/항차', value: profile.vesselOrFlight ?? '' },
  ];
  // 다품목은 첫 품목이 itemName 과 같으므로 두 번째부터 추가한다.
  (profile.shipperItems ?? []).slice(1).forEach((item, index) => {
    fields.push({ field: `shipperItems.${index + 1}.itemName`, label: `품명 ${index + 2}`, value: item.itemName ?? '' });
  });
  return fields.filter((entry) => entry.value.trim());
}
