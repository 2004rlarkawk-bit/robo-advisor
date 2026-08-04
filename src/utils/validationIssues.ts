import type { ValidationIssue } from '../types';

export function issueKey(issue: ValidationIssue): string {
  return `${issue.id}::${String(issue.field)}`;
}

export function unresolvedBlockers(
  issues: ValidationIssue[],
  overrides: Record<string, string>,
): ValidationIssue[] {
  return issues.filter(
    (issue) => issue.severity === 'error'
      && !(issue.overridable && overrides[issueKey(issue)]),
  );
}

export function issueToFieldKey(issue: ValidationIssue): string {
  return String(issue.field) === 'invoiceAmount'
    ? 'totalAmount'
    : String(issue.field);
}

export function shortIssueLabel(issue: ValidationIssue): string {
  const message = issue.message
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const missing = message.match(/^(.+?)이 ?입력되지 않았습니다/);
  if (missing) return `${missing[1].trim()} 입력`;
  const korean = message.match(/^(.+?)에 한글이 포함되어/);
  if (korean) return `${korean[1].trim()} 영문으로 수정`;
  const sentence = message.split('.')[0].trim();
  const [title, ...rest] = sentence.split(':');
  return rest.length > 0 && title.trim().length >= 6
    ? title.trim()
    : sentence;
}
