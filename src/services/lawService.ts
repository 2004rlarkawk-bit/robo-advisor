/**
 * 법제처 국가법령정보 Open API (law.go.kr DRF)
 *
 * 승인 항목 (2026-07-02): 현행법령·행정규칙·판례·법령해석례·행정심판례 (JSON)
 *  + 지능형 검색 + 관련법령
 *
 * 인증: OC=<law.go.kr 가입 ID> — 키가 아니라 사용자 ID.
 *  발급 시 등록한 도메인/IP에서만 호출 허용될 수 있음 (사용자 검증).
 *
 * CORS 미확인 → 로컬 개발은 vite '/law-api' 프록시 경유, 실패 시 시뮬레이션 폴백.
 *
 * 활용처:
 *  - 검증 이슈에 근거 법령 링크 (예: HS 오류 → 관세법 제241조)
 *  - UNI-PASS 요건승인의 관련법령(relaLwor) → 조문 연결
 *  - 8월 RAG(법령 질의응답) 단계 재료
 */

import type { DataSource } from './customsApiService';

const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  typeof localStorage !== 'undefined'
    ? localStorage
    : { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const KEY_LAW_OC = 'portai_law_oc';

export function setLawOC(oc: string): void {
  storage.setItem(KEY_LAW_OC, oc);
}
export function getLawOC(): string | null {
  return storage.getItem(KEY_LAW_OC);
}
export function hasLawOC(): boolean {
  const v = getLawOC();
  return !!v && v.length >= 2;
}
export function clearLawOC(): void {
  storage.removeItem(KEY_LAW_OC);
}

function baseUrl(): string {
  const isDev =
    typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  return isDev ? '/law-api/DRF' : 'https://www.law.go.kr/DRF';
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
  const oc = getLawOC();
  const q = query.trim();
  if (!q) return [];

  if (oc) {
    try {
      const url =
        `${baseUrl()}/lawSearch.do?OC=${encodeURIComponent(oc)}` +
        `&target=law&type=JSON&display=${limit}&query=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`법령검색 API 오류 (${res.status})`);
      const data = await res.json();
      // 인증 실패 응답도 200으로 옴 → result 필드 존재 시 오류로 간주
      if (data?.result && !data?.LawSearch) throw new Error(String(data.result));
      const rows = data?.LawSearch?.law;
      const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
      if (list.length > 0) {
        return list.map((r: Record<string, string>) => ({
          lawId: r.법령ID || r.lawId || '',
          lawName: r.법령명한글 || r.법령명 || '',
          lawType: r.법종구분명 || '',
          department: r.소관부처명 || '',
          effectiveDate: r.시행일자 || '',
          detailUrl: r.법령상세링크 ? `https://www.law.go.kr${r.법령상세링크}` : `https://www.law.go.kr/법령/${encodeURIComponent(r.법령명한글 || q)}`,
          source: 'api' as DataSource,
        }));
      }
      return [];
    } catch (err) {
      console.warn('법제처 법령검색 실패, 시뮬레이션 폴백:', err);
    }
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
    { lawId: '', lawName: `${query} 관련 법령 (시뮬레이션 — OC 설정 후 실검색 가능)`, lawType: '', department: '', effectiveDate: '', detailUrl: `https://www.law.go.kr/법령/${encodeURIComponent(query)}`, source: 'simulation' },
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
    'co-required': { topic: '원산지증명', lawName: '대외무역법', article: '제33조', summary: '수출입 물품의 원산지 표시·증명' },
  };
  return map[issueId] ?? null;
}
