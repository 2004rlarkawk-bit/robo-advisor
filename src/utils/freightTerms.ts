import type { FreightTerms } from '../types';

/**
 * Incoterms → 운임 지급 조건(PREPAID/COLLECT) 유도.
 *
 * 매도인이 주운송비를 부담하는 조건(C·D 그룹)은 PREPAID,
 * 매수인이 부담하는 조건(E·F 그룹)은 COLLECT가 원칙이다.
 * 당사자 합의로 달라질 수 있으므로 화면에서는 기본값 제안에만 쓰고
 * 최종값은 사용자가 확정한다.
 */
const SELLER_PAYS_MAIN_CARRIAGE = new Set(['CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);
const BUYER_PAYS_MAIN_CARRIAGE = new Set(['EXW', 'FCA', 'FAS', 'FOB']);

export function deriveFreightTerms(incoterms: string): FreightTerms {
  const key = incoterms.trim().toUpperCase();
  if (SELLER_PAYS_MAIN_CARRIAGE.has(key)) return 'PREPAID';
  if (BUYER_PAYS_MAIN_CARRIAGE.has(key)) return 'COLLECT';
  return '';
}

/** 사용자가 고른 값이 Incoterms 원칙과 어긋나는지 — 경고용(차단 아님) */
export function isFreightTermsUnusual(incoterms: string, terms: FreightTerms): boolean {
  if (!terms) return false;
  const expected = deriveFreightTerms(incoterms);
  return Boolean(expected) && expected !== terms;
}

export const FREIGHT_TERMS_LABEL: Record<Exclude<FreightTerms, ''>, string> = {
  PREPAID: 'PREPAID (운임 선불 — 수출자 부담)',
  COLLECT: 'COLLECT (운임 후불 — 수입자 부담)',
};
