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
    expect(summarizeReconciliation(results)).toEqual({
      total: 10,
      passed: 6,
      skipped: 0,
      failed: 4,
      errors: 2,
      warnings: 2,
    });
  });
});
