import { describe, expect, it } from 'vitest';
import type { ValidationIssue } from '../types';
import {
  exportIssueDocLabel,
  isLiveCheckIssueId,
  issueFixHint,
  issueKey,
  issueToFieldKey,
  presentIssue,
  shortIssueLabel,
  unresolvedBlockers,
} from './validationIssues';

function issue(overrides: Partial<ValidationIssue> = {}): ValidationIssue {
  return {
    id: 'input-missing-itemName',
    docType: 'invoice',
    field: 'itemName',
    message: '품명이 입력되지 않았습니다.',
    severity: 'error',
    ...overrides,
  };
}

describe('validation issue helpers', () => {
  it('이슈 식별자는 규칙 ID와 필드를 함께 사용한다', () => {
    expect(issueKey(issue())).toBe('input-missing-itemName::itemName');
  });

  it('사유가 기록된 우회 가능 오류만 차단 목록에서 제외한다', () => {
    const overridable = issue({ id: 'policy-warning', overridable: true });
    const fixedError = issue({ id: 'fixed-error', overridable: false });

    expect(unresolvedBlockers(
      [overridable, fixedError, issue({ id: 'warning', severity: 'warning' })],
      { [issueKey(overridable)]: '관세사 확인 완료' },
    )).toEqual([fixedError]);
  });

  it('송장 금액 이슈는 실제 입력 필드로 연결한다', () => {
    expect(issueToFieldKey(issue({ field: 'invoiceAmount' }))).toBe('totalAmount');
    expect(issueToFieldKey(issue({ field: 'hsCode' }))).toBe('hsCode');
  });

  it('체크리스트에는 짧은 수정 문구를 제공한다', () => {
    expect(shortIssueLabel(issue())).toBe('품명 입력');
    expect(shortIssueLabel(issue({ message: '품명에 한글이 포함되어 있습니다.' }))).toBe('품명 영문으로 수정');
    expect(shortIssueLabel(issue({ id: 'r23-small-cargo-lcl', message: '총 0.088 CBM 소량 화물로 LCL(혼재) 운송이 일반적입니다.' }))).toBe('FCL/LCL 운송방식 재확인');
    expect(shortIssueLabel(issue({ id: 'r21-transit-too-long', message: '출항일(2026-10-11)부터 도착예정일(2027-10-24)까지 378일입니다.' }))).toBe('도착 예정일 연도·월 확인');
  });

  it('입력값만으로 다시 판정할 수 있는 이슈 id만 실시간 재평가 대상으로 본다', () => {
    expect(isLiveCheckIssueId('input-missing-itemName')).toBe(true);
    expect(isLiveCheckIssueId('input-nan-quantity')).toBe(true);
    expect(isLiveCheckIssueId('weight-net-gross')).toBe(true);
    expect(isLiveCheckIssueId('items-total-mismatch')).toBe(true);
    // 접두 패턴이 아닌 id는 정확히 일치해야 한다.
    expect(isLiveCheckIssueId('weight-net-gross-extra')).toBe(false);
    expect(isLiveCheckIssueId('amount-calc-mismatch')).toBe(false);
    expect(isLiveCheckIssueId('r15-origin-not-korea')).toBe(false);
  });

  it('보조 설명은 예시 → 괄호 설명 → 콜론 뒤 문장 순으로 고른다', () => {
    expect(issueFixHint(issue({ message: '선적항이 입력되지 않았습니다. 예: BUSAN, KOREA. [근거: 관세법]' }))).toBe('예: BUSAN, KOREA');
    expect(issueFixHint(issue({ message: '수량을 확인하세요 (포장 단위 기준으로 입력).' }))).toBe('포장 단위 기준으로 입력');
    expect(issueFixHint(issue({ message: '상업송장: 단가가 0입니다. 다시 입력하세요.' }))).toBe('단가가 0입니다');
    expect(issueFixHint(issue({ message: '품명이 입력되지 않았습니다.' }))).toBeNull();
  });

  it('서류 종류를 한글 서류명으로 바꾸고 모르는 종류는 기타 서류로 둔다', () => {
    expect(exportIssueDocLabel('invoice')).toBe('상업송장');
    expect(exportIssueDocLabel('customs_dec')).toBe('통관신고서');
    expect(exportIssueDocLabel('unknown')).toBe('기타 서류');
  });

  it('알려진 이슈는 짧은 제목과 설명으로 바꾸고 나머지는 원문을 쓰게 null을 준다', () => {
    expect(presentIssue(issue({ field: 'weight' }))?.title).toBe('중량 입력');
    expect(presentIssue(issue({ field: 'hsCode' }))?.title).toBe('HS CODE 확인');
    expect(presentIssue(issue({ id: 'insurance-missing', field: 'insurance' }))?.title).toBe('적하보험증권 준비');
    expect(presentIssue(issue({ id: 'llm-anomaly-1', message: 'AI 참고 — 단가: 평소보다 10배 높습니다 [근거: 통계]' }))).toEqual({
      title: '단가 값 확인',
      desc: '평소보다 10배 높습니다 (실제 값이 맞다면 그대로 진행해도 됩니다.)',
    });
    expect(presentIssue(issue({ id: 'llm-anomaly-2', message: '설명만 있는 메시지' }))).toEqual({
      title: '입력값 확인',
      desc: '설명만 있는 메시지',
    });
    expect(presentIssue(issue({ id: 'r15-origin-not-korea', field: 'countryOfOrigin', message: "원산지가 'CHINA'로 입력되었습니다." }))?.desc)
      .toContain("'CHINA'");
    expect(presentIssue(issue())).toBeNull();
  });
});
