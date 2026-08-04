import { describe, expect, it } from 'vitest';
import type { ValidationIssue } from '../types';
import {
  issueKey,
  issueToFieldKey,
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
  });
});
