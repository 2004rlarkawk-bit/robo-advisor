import { describe, it, expect } from 'vitest';
import { buildFeedbackReport } from '../feedbackReport';
import type { ValidationIssue } from '../../types';

const factIssue: ValidationIssue = {
  id: 'dutiable-value-info',
  docType: 'customs_dec',
  severity: 'info',
  field: 'invoiceAmount',
  message: '과세가격 환산: USD 25,000 × 1,478.44원 = 약 36,961,000원 (관세청 주간환율 · 적용일 2026-07-26)',
  card: {
    id: 'dutiable-value',
    title: '과세가격 환산',
    value: '약 36,961,000원',
    formula: 'USD 25,000 × 1,478.44원',
    meta: '여성 캐시미어 코트 · 관세청 주간환율 · 적용일 2026-07-26',
    basis: { label: '근거', law: '관세법 제30조' },
  },
};

const weightIssue: ValidationIssue = {
  id: 'packing-weight-missing',
  docType: 'packing_list',
  severity: 'warning',
  field: 'weight',
  message: '총중량(Gross Weight)이 누락되었습니다. [근거: 관세법 제241조]',
  basis: { label: '근거', law: '관세법 제241조' },
};

const infoIssue: ValidationIssue = {
  id: 'bizno-checksum-only',
  docType: 'customs_dec',
  severity: 'info',
  field: 'businessRegistrationNo',
  message: '사업자등록번호: 형식(체크섬)만 확인됨',
};

describe('buildFeedbackReport — 검증 이슈 → 리포트 틀', () => {
  it('card를 가진 이슈는 facts로, 나머지는 checks로 분리한다', () => {
    const r = buildFeedbackReport([factIssue, weightIssue, infoIssue]);
    expect(r.facts.map((f) => f.id)).toEqual(['dutiable-value']);
    expect(r.checks.map((c) => c.id)).toEqual(['packing-weight-missing', 'bizno-checksum-only']);
  });

  it('사실 카드 값/근거를 그대로 보존한다(GPT 무관하게 결정론적)', () => {
    const r = buildFeedbackReport([factIssue]);
    expect(r.facts[0].value).toBe('약 36,961,000원');
    expect(r.facts[0].basis).toEqual({ label: '근거', law: '관세법 제30조' });
    expect(r.checks).toHaveLength(0);
  });

  it('check detail에서 " [근거: ...]" 접미사를 떼고 basis는 배지로 유지한다', () => {
    const r = buildFeedbackReport([weightIssue]);
    expect(r.checks[0].detail).toBe('총중량(Gross Weight)이 누락되었습니다.');
    expect(r.checks[0].basis).toEqual({ label: '근거', law: '관세법 제241조' });
  });

  it('title이 없으면 docType 라벨로 대체한다', () => {
    const r = buildFeedbackReport([weightIssue]);
    expect(r.checks[0].title).toBe('패킹리스트');
  });

  it('needsCheck는 error+warning만 세고 info(참고)는 제외한다', () => {
    const r = buildFeedbackReport([factIssue, weightIssue, infoIssue]);
    expect(r.summary.needsCheck).toBe(1); // weightIssue(warning)만
  });

  it('reviewed/narrative 옵션을 그대로 반영한다', () => {
    const r = buildFeedbackReport([], undefined, { reviewed: 2, narrative: '요약' });
    expect(r.summary).toEqual({ reviewed: 2, needsCheck: 0 });
    expect(r.narrative).toBe('요약');
    expect(r.facts).toHaveLength(0);
  });
});
