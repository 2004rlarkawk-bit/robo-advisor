/**
 * 법제처 국가법령정보 서비스
 *
 * 프론트는 Supabase Edge Function law-search를 호출한다.
 * 법제처 OC는 서버 Secret에서 관리되며 프론트에는 노출되지 않는다.
 * Edge Function 호출 실패 시 시뮬레이션 데이터로 폴백한다.
 *
 * 활용처:
 *  - 검증 이슈에 근거 법령 링크 (예: HS 오류 → 관세법 제241조)
 *  - UNI-PASS 요건승인의 관련법령(relaLwor) → 조문 연결
 *  - 8월 RAG(법령 질의응답) 단계 재료
 */

import type { DataSource } from './customsApiService';
import { supabase } from '../lib/supabase';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ===== 법령 검색 =====

export interface LawSearchResult {
  lawId: string;
  lawName: string;
  lawType: string; // 법률/시행령/시행규칙 등
  department: string; // 소관부처
  effectiveDate: string; // 시행일자
  detailUrl: string; // 법제처 본문 링크
  source: DataSource;
}

/** 현행법령 키워드 검색 (예: "관세법") */
export async function searchLaw(query: string, limit = 10): Promise<LawSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const { data, error } = await supabase.functions.invoke('law-search', {
      body: { query: q, limit },
    });
    if (error) throw error;
    if (!isRecord(data) || data.success !== true || !Array.isArray(data.laws)) {
      throw new Error(
        isRecord(data) && typeof data.error === 'string'
          ? data.error
          : '법령검색 Edge Function 응답이 올바르지 않습니다.'
      );
    }

    return data.laws.flatMap((value): LawSearchResult[] => {
      if (
        !isRecord(value) ||
        typeof value.lawId !== 'string' ||
        typeof value.lawName !== 'string' ||
        typeof value.lawType !== 'string' ||
        typeof value.department !== 'string' ||
        typeof value.effectiveDate !== 'string' ||
        typeof value.detailUrl !== 'string' ||
        value.source !== 'api' ||
        (!value.lawName && !value.detailUrl)
      ) {
        return [];
      }
      return [{
        lawId: value.lawId,
        lawName: value.lawName,
        lawType: value.lawType,
        department: value.department,
        effectiveDate: value.effectiveDate,
        detailUrl: value.detailUrl,
        source: 'api' as DataSource,
      }];
    });
  } catch (err) {
    console.warn('법제처 법령검색 Edge Function 호출 실패, 시뮬레이션 폴백:', err);
  }

  return simulatedLawSearch(q);
}

function simulatedLawSearch(query: string): LawSearchResult[] {
  const table: Record<string, LawSearchResult[]> = {
    관세: [
      { lawId: '001571', lawName: '관세법', lawType: '법률', department: '기획재정부', effectiveDate: '20260101', detailUrl: 'https://www.law.go.kr/법령/관세법', source: 'simulation' },
      { lawId: '009381', lawName: '관세법 시행령', lawType: '대통령령', department: '기획재정부', effectiveDate: '20260101', detailUrl: 'https://www.law.go.kr/법령/관세법시행령', source: 'simulation' },
    ],
    무역: [
      { lawId: '001618', lawName: '대외무역법', lawType: '법률', department: '산업통상자원부', effectiveDate: '20260101', detailUrl: 'https://www.law.go.kr/법령/대외무역법', source: 'simulation' },
    ],
    전자상거래: [
      { lawId: '011461', lawName: '전자상거래 등에서의 소비자보호에 관한 법률', lawType: '법률', department: '공정거래위원회', effectiveDate: '20260101', detailUrl: 'https://www.law.go.kr/법령/전자상거래등에서의소비자보호에관한법률', source: 'simulation' },
    ],
  };
  for (const k of Object.keys(table)) {
    if (query.includes(k)) return table[k];
  }
  return [
    { lawId: '', lawName: `${query} 관련 법령 (시뮬레이션)`, lawType: '', department: '', effectiveDate: '', detailUrl: `https://www.law.go.kr/법령/${encodeURIComponent(query)}`, source: 'simulation' },
  ];
}

// ===== 문서-법령 매핑 (검증 이슈 근거 법령 안내) =====

export interface RelatedLaw {
  topic: string;
  lawName: string;
  article: string;
  summary: string;
}

/** 검증 이슈 유형 → 근거 법령 (정적 매핑 — RAG 전 단계) */
export function getRelatedLawForIssue(issueId: string): RelatedLaw | null {
  const map: Record<string, RelatedLaw> = {
    'hscode-missing': { topic: 'HS 품목분류', lawName: '관세법', article: '제84조·제85조', summary: '품목분류 적용 기준 — 수출입 신고 시 HS부호 기재 의무' },
    'hscode-invalid': { topic: 'HS 품목분류', lawName: '관세법', article: '제84조·제85조', summary: '품목분류 적용 기준 — 부정확한 HS부호는 신고 수리 거부 사유' },
    'bizno-invalid': { topic: '신고인 자격', lawName: '관세법', article: '제241조', summary: '수출·수입 신고 — 신고인 정보 불일치 시 반려' },
    'dutiable-value-info': { topic: '과세가격', lawName: '관세법', article: '제30조', summary: '과세가격 결정의 원칙 — 실제지급금액 기준 원화 환산' },
    'estimated-duty-info': { topic: '관세율', lawName: '관세법', article: '제49조·제50조', summary: '세율 적용 우선순위 — 기본세율과 협정세율' },
    'insurance-missing': { topic: '적하보험', lawName: '상법', article: '제693조', summary: '해상적하보험 — CIF 조건 매도인의 보험계약 체결 의무(Incoterms)' },
    'co-required': { topic: '원산지증명', lawName: '대외무역법', article: '제33조', summary: '원산지표시대상 수출물품은 원산지를 정확하게 표시해야 합니다. 따라서 거래 조건상 원산지 증명이 필요한지 추가로 확인합니다.' },
    'r15-origin-not-korea': { topic: '원산지 판정', lawName: '대외무역법', article: '제33조·제34조', summary: '수출입 물품의 원산지 판정·표시 — 원산지를 사실과 다르게 신고하면 제재 대상' },
    'r16-generic-item-name': { topic: '품명 기재', lawName: '관세법', article: '제241조', summary: '수출·수입 신고 시 품명 등을 정확히 기재 — 포괄적 품명은 신고 수리 거부 사유' },
    'r14-lc-after-shipment': { topic: '신용장 거래', lawName: '관세법', article: '제226조', summary: '통관 서류의 정합성 — 신용장 개설 전 선적은 은행 매입 거절(하자) 사유' },
    'r17-hs-chapter-mismatch': { topic: 'HS 품목분류', lawName: '관세법', article: '제84조·제85조', summary: '품목분류 적용 기준 — 품명과 상이한 분류 신고는 수리 거부·정정 대상' },
  };
  return map[issueId] ?? null;
}
