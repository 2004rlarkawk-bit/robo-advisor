import { describe, expect, it } from 'vitest';
import type { TradeProfile, ValidationIssue } from '../types';
import { runComplianceRules } from '../agents/complianceRules';
import { resolvedFixIssueKeys } from './liveFixResolution';
import { issueKey } from './validationIssues';

const profile: TradeProfile = {
  tradeType: 'export', itemName: 'STAINLESS STEEL BOLT', hsCode: '7318150000',
  loadPort: 'BUSAN, KOREA', dischargePort: 'SHANGHAI, CHINA', incoterms: 'FOB',
  quantity: 100, weight: 1000, departureDate: '2026-10-10', arrivalDate: '2027-11-04',
  companyName: 'TEST', contact: '02-1234-5678', countryOfOrigin: 'REPUBLIC OF KOREA',
  paymentTerms: 'L/C', lcDate: '2026-11-04', packageCount: 10, eaPerBox: 16,
};

describe('고칠 항목 입력 중 해결 표시', () => {
  const dateIssues = runComplianceRules(profile).filter(issue =>
    issue.id === 'r21-transit-implausible' || issue.id === 'r14-lc-after-shipment');
  const quantityIssue: ValidationIssue = {
    id: 'r10-packing-qty-mismatch', docType: 'packing_list', severity: 'error', field: 'quantity',
    message: '패킹리스트 총 수량이 상업송장 수량과 다릅니다.',
  };

  it('날짜를 고치면 해당 규칙만 체크하고 다시 틀리면 체크를 해제한다', () => {
    expect(dateIssues).toHaveLength(2);
    const fixedArrival = { ...profile, arrivalDate: '2026-10-13' };
    const resolved = resolvedFixIssueKeys(fixedArrival, dateIssues);
    expect(resolved.has(issueKey(dateIssues.find(issue => issue.id === 'r21-transit-implausible')!))).toBe(true);
    expect(resolved.has(issueKey(dateIssues.find(issue => issue.id === 'r14-lc-after-shipment')!))).toBe(false);
    expect(resolvedFixIssueKeys(profile, dateIssues).size).toBe(0);
  });

  it('신용장 개설일과 선적일 순서를 고치면 체크한다', () => {
    const fixed = { ...profile, lcDate: '2026-10-09' };
    expect(resolvedFixIssueKeys(fixed, dateIssues).has(issueKey(dateIssues.find(issue => issue.id === 'r14-lc-after-shipment')!))).toBe(true);
  });

  it('패킹 총수량이 송장 수량과 같을 때만 체크한다', () => {
    expect(resolvedFixIssueKeys(profile, [quantityIssue]).size).toBe(0);
    expect(resolvedFixIssueKeys({ ...profile, eaPerBox: 10 }, [quantityIssue]).has(issueKey(quantityIssue))).toBe(true);
    expect(resolvedFixIssueKeys({ ...profile, eaPerBox: '' }, [quantityIssue]).size).toBe(0);
  });

  it('입력값만으로 확인할 수 없는 외부 검증 항목은 체크하지 않는다', () => {
    const external: ValidationIssue = { id: 'bizno-invalid', docType: 'customs_dec', severity: 'warning', field: 'businessRegistrationNo', message: '사업자번호 확인 필요' };
    expect(resolvedFixIssueKeys(profile, [external]).size).toBe(0);
  });
});
