import type { ImportComparisonRow, ImportDocumentType, ReconciliationRuleResult } from '../../types/importTrade';
import { summarizeReconciliation, evaluateReconciliationGate } from '../../services/importReconciliationEngine';

const DOC_LABEL: Record<ImportDocumentType, string> = {
  commercial_invoice: 'C/I',
  packing_list: 'P/L',
  bill_of_lading: 'B/L',
  unknown: '기타',
};

function badgeClass(result: ReconciliationRuleResult): string {
  if (result.status === 'pass') return 'reconcile-badge pass';
  if (result.status === 'skip') return 'reconcile-badge skip';
  return result.severity === 'error' ? 'reconcile-badge fail-error' : 'reconcile-badge fail-warning';
}

function badgeText(result: ReconciliationRuleResult): string {
  if (result.status === 'pass') return '일치';
  if (result.status === 'skip') return '확인불가';
  return result.severity === 'error' ? '불일치·오류' : '불일치·주의';
}

/** 심각도 정렬 순위: 오류 → 주의 → 확인불가 → 일치 */
function severityRank(result: ReconciliationRuleResult): number {
  if (result.status === 'fail') return result.severity === 'error' ? 0 : 1;
  if (result.status === 'skip') return 2;
  return 3; // pass
}

function ruleNo(result: ReconciliationRuleResult): number {
  return parseInt(result.ruleId.replace(/\D/g, ''), 10) || 0;
}

function ReconcileItem({ result }: { result: ReconciliationRuleResult }) {
  return (
    <li className={`reconcile-item ${result.status}`}>
      <span className={badgeClass(result)}>{badgeText(result)}</span>
      <div className="reconcile-body">
        <div className="reconcile-title">
          <strong>{result.ruleId}. {result.label}</strong>
          <span className="reconcile-docs">{result.documents.map((doc) => DOC_LABEL[doc]).join(' · ')}</span>
        </div>
        <p className="reconcile-evidence">{result.evidence}</p>
      </div>
    </li>
  );
}

interface Props {
  results: ReconciliationRuleResult[];
  rows?: ImportComparisonRow[];
}

export default function ImportDocumentComparison({ results, rows = [] }: Props) {
  const summary = summarizeReconciliation(results);
  const gate = evaluateReconciliationGate(results);

  // 렌더 전용 파생 정렬(원본 results·판정 로직 불변): 심각도 우선, 같은 심각도는 IR 번호 순.
  const attention = results
    .filter((result) => result.status !== 'pass')
    .sort((a, b) => severityRank(a) - severityRank(b) || ruleNo(a) - ruleNo(b));
  const passed = results
    .filter((result) => result.status === 'pass')
    .sort((a, b) => ruleNo(a) - ruleNo(b));

  return (
    <section className="form-card import-card">
      <div className="import-card-heading">
        <div><h2>문서 간 대조</h2></div>
        <p>C/I·P/L·B/L 추출값을 IR1~IR10 규칙으로 교차검증합니다. (판정은 코드 기준 · 재현 가능)</p>
      </div>

      <div className="reconcile-summary" role="status">
        <span className="reconcile-chip pass">일치 {summary.passed}</span>
        <span className="reconcile-chip fail-error">오류 {summary.blocking}</span>
        <span className="reconcile-chip fail-warning">주의 {summary.warnings}</span>
        <span className="reconcile-chip skip">확인불가 {summary.skipped}</span>
      </div>

      {attention.length > 0 && (
        <ul className="reconcile-list">
          {attention.map((result) => <ReconcileItem key={result.ruleId} result={result} />)}
        </ul>
      )}

      {passed.length > 0 && (
        <details className="reconcile-pass-group">
          <summary className="reconcile-pass-summary">
            <span className="reconcile-badge pass">일치</span> {passed.length}건 검증 통과
          </summary>
          <ul className="reconcile-list reconcile-pass-list">
            {passed.map((result) => <ReconcileItem key={result.ruleId} result={result} />)}
          </ul>
        </details>
      )}

      {gate.status === 'blocked'
        ? <div className="form-message error">{gate.message}</div>
        : gate.status === 'override_required'
          ? <div className="form-message info">{gate.message}</div>
          : summary.warnings > 0
            ? <div className="form-message info">차단·필수 오류는 없습니다. 주의 항목을 확인한 뒤 진행할 수 있습니다.</div>
            : <div className="form-message success">모든 대조 항목을 통과했습니다.</div>}

      {rows.length > 0 && (
        <details className="reconcile-raw">
          <summary>AI 추출 원본값 비교표</summary>
          <div className="import-table-wrap">
            <table className="import-table">
              <thead><tr><th>항목</th><th>C/I</th><th>P/L</th><th>B/L</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.field}><th>{row.field}</th><td>{row.invoice}</td><td>{row.packingList}</td><td>{row.billOfLading}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
