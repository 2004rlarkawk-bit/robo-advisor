import { describe, it, expect } from 'vitest';
import { runImportReconciliation, summarizeReconciliation, evaluateReconciliationGate } from './importReconciliationEngine';
import { IMPORT_DEMO_MISMATCH, IMPORT_DEMO_CLEAN } from './importReconciliationFixtures';
import type { ReconciliationRuleResult, ReconciliationStatus } from '../types/importTrade';

function statusMap(results: ReconciliationRuleResult[]): Record<string, ReconciliationStatus> {
  return Object.fromEntries(results.map((r) => [r.ruleId, r.status]));
}

describe('데모 픽스처 오라클 — 이어폰 수입 (오류 포함)', () => {
  const results = runImportReconciliation(IMPORT_DEMO_MISMATCH.input);
  const status = statusMap(results);

  it('IR1 품명 상이 → warning fail', () => {
    expect(status.IR1).toBe('fail');
    expect(results.find((r) => r.ruleId === 'IR1')?.severity).toBe('warning');
  });
  it('IR2 수량 1,000 vs 1,020 → error fail (근거에 20 포함)', () => {
    const ir2 = results.find((r) => r.ruleId === 'IR2')!;
    expect(ir2.status).toBe('fail');
    expect(ir2.severity).toBe('error');
    expect(ir2.evidence).toContain('20');
  });
  it('IR3 총중량 120 vs 128 → error fail (8kg 차이)', () => {
    const ir3 = results.find((r) => r.ruleId === 'IR3')!;
    expect(ir3.status).toBe('fail');
    expect(ir3.severity).toBe('error');
    expect(ir3.evidence).toContain('8');
  });
  it('IR8 HS 미기재 → warning fail', () => {
    expect(status.IR8).toBe('fail');
    expect(results.find((r) => r.ruleId === 'IR8')?.severity).toBe('warning');
  });
  it('IR4·IR5·IR6·IR7·IR9·IR10 은 pass', () => {
    for (const id of ['IR4', 'IR5', 'IR6', 'IR7', 'IR9', 'IR10']) {
      expect(status[id]).toBe('pass');
    }
  });
  it('집계: error 2 + warning 2 + pass 6, skip 0', () => {
    const s = summarizeReconciliation(results);
    expect(s).toMatchObject({ blocking: 2, warnings: 2, passed: 6, skipped: 0, failed: 4 });
  });

  it('게이트: IR10 통과·내용오류만 → override_required (IR2·IR3 우회 대상, 하드 차단 없음)', () => {
    const gate = evaluateReconciliationGate(results);
    expect(gate.status).toBe('override_required');
    expect(gate.blocking).toHaveLength(0);
    expect(gate.overridable.map((r) => r.ruleId).sort()).toEqual(['IR2', 'IR3']);
  });
});

describe('데모 픽스처 오라클 — 이어폰 수입 (정상)', () => {
  it('10개 항목 전부 pass', () => {
    const results = runImportReconciliation(IMPORT_DEMO_CLEAN.input);
    expect(results).toHaveLength(10);
    expect(results.every((r) => r.status === 'pass')).toBe(true);
  });
});
