import { describe, expect, it } from 'vitest';
import { IMPORT_DEMO_INPUT } from './importReconciliationFixtures';
import { runImportReconciliation, summarizeReconciliation } from './importReconciliationEngine';

describe('수입 서류 대사 규칙 엔진', () => {
  it('PDF 데모 세트의 의도된 오류 4건을 판정한다', () => {
    const results = runImportReconciliation(IMPORT_DEMO_INPUT);
    const failures = Object.fromEntries(
      results.filter((result) => result.status === 'fail').map((result) => [result.ruleId, result.severity]),
    );

    expect(failures).toEqual({ IR1: 'warning', IR2: 'error', IR3: 'error', IR8: 'warning' });
    // IR11~IR14(원산지·항구·Consignee·보험)는 C/O·B/L 항구·보험증권 값이 없어 판정 보류.
    expect(summarizeReconciliation(results)).toEqual({
      total: 14,
      passed: 6,
      skipped: 4,
      failed: 4,
      errors: 2,
      warnings: 2,
    });
  });

  it('IR11 — C/O 와 C/I 원산지가 다르면 error, 표기 차이는 통과', () => {
    const fail = runImportReconciliation({
      commercial_invoice: { originCountry: 'Vietnam' },
      certificate_of_origin: { originCountry: 'China' },
    }).find((r) => r.ruleId === 'IR11')!;
    expect(fail.status).toBe('fail');
    expect(fail.severity).toBe('error');
    const pass = runImportReconciliation({
      commercial_invoice: { originCountry: 'REPUBLIC OF KOREA' },
      certificate_of_origin: { originCountry: 'Korea' },
    }).find((r) => r.ruleId === 'IR11')!;
    expect(pass.status).toBe('pass');
  });

  it('IR12 — B/L 과 C/I 항구 대조 (표기 차이 흡수)', () => {
    const pass = runImportReconciliation({
      commercial_invoice: { loadPort: 'BUSAN, KOREA', dischargePort: 'Osaka Port' },
      bill_of_lading: { loadPort: 'Busan', dischargePort: 'OSAKA' },
    }).find((r) => r.ruleId === 'IR12')!;
    expect(pass.status).toBe('pass');
    const fail = runImportReconciliation({
      commercial_invoice: { loadPort: 'Busan', dischargePort: 'Osaka' },
      bill_of_lading: { loadPort: 'Busan', dischargePort: 'Kobe' },
    }).find((r) => r.ruleId === 'IR12')!;
    expect(fail.status).toBe('fail');
    expect(fail.evidence).toContain('도착항');
  });

  it('IR13 — Consignee 법인 접미 차이는 통과, 다른 회사는 warning', () => {
    const pass = runImportReconciliation({
      commercial_invoice: { consignee: 'INCHEON SOUND KOREA INC.' },
      bill_of_lading: { consignee: 'Incheon Sound Korea' },
    }).find((r) => r.ruleId === 'IR13')!;
    expect(pass.status).toBe('pass');
    const fail = runImportReconciliation({
      commercial_invoice: { consignee: 'INCHEON SOUND KOREA INC.' },
      bill_of_lading: { consignee: 'BUSAN TRADING CO., LTD.' },
    }).find((r) => r.ruleId === 'IR13')!;
    expect(fail.status).toBe('fail');
    expect(fail.severity).toBe('warning');
  });

  it('IR14 — 보험금액이 송장금액 × 110% 미만이면 warning', () => {
    const fail = runImportReconciliation({
      commercial_invoice: { totalAmount: 'USD 8,000.00', currency: 'USD' },
      insurance_policy: { insuredAmount: '8,000', insuredCurrency: 'USD' },
    }).find((r) => r.ruleId === 'IR14')!;
    expect(fail.status).toBe('fail');
    const pass = runImportReconciliation({
      commercial_invoice: { totalAmount: 'USD 8,000.00', currency: 'USD' },
      insurance_policy: { insuredAmount: '8,800', insuredCurrency: 'USD' },
    }).find((r) => r.ruleId === 'IR14')!;
    expect(pass.status).toBe('pass');
    const skip = runImportReconciliation({
      commercial_invoice: { totalAmount: 'USD 8,000.00' },
    }).find((r) => r.ruleId === 'IR14')!;
    expect(skip.status).toBe('skip');
  });
});
