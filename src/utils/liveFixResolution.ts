import type { TradeProfile, ValidationIssue } from '../types';
import { runComplianceRules, RULE_POLICY } from '../agents/complianceRules';
import { validateRequiredInputs } from '../harness/validatorEngine';
import { isLiveCheckIssueId, issueKey } from './validationIssues';

/** 입력값만으로 재검증할 수 있는 지난 검증 항목의 해결 여부. 비동기·서류 분석 항목은 재생성 전까지 유지한다. */
export function resolvedFixIssueKeys(profile: TradeProfile, issues: ValidationIssue[]): Set<string> {
  const currentKeys = new Set([
    ...validateRequiredInputs(profile),
    ...runComplianceRules(profile),
  ].map(issueKey));
  const resolved = new Set<string>();

  for (const issue of issues) {
    const key = issueKey(issue);
    const profileRule = Object.prototype.hasOwnProperty.call(RULE_POLICY, issue.id)
      && !issue.id.startsWith('r10-')
      && !issue.id.startsWith('r17-');
    if (isLiveCheckIssueId(issue.id) || profileRule) {
      if (!currentKeys.has(key)) resolved.add(key);
      continue;
    }

    // R10은 생성된 C/I·P/L을 대조한 결과다. 입력 중에는 같은 원천값이 모두 있을 때만
    // 박스수×박스당 수량과 송장 수량을 비교한다. 공란은 '해결'로 오판하지 않는다.
    if (issue.id === 'r10-packing-qty-mismatch') {
      const invoiceQuantity = profile.shipperItems?.length
        ? profile.shipperItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
        : Number(profile.quantity);
      const boxes = Number(profile.packageCount);
      const eaPerBox = Number(profile.eaPerBox);
      if (invoiceQuantity > 0 && boxes > 0 && eaPerBox > 0 && boxes * eaPerBox === invoiceQuantity) {
        resolved.add(key);
      }
    }
  }

  return resolved;
}
