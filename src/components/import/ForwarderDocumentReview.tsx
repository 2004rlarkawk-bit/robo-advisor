import { useState } from 'react';
import type { ImportComparisonRow } from '../../types/importTrade';
import { COMPARISON_LABELS, IMPORT_FIELD_LABELS, comparisonStatus, hasDocumentValue } from '../../utils/forwarderPresentation';

export default function ForwarderDocumentReview({ rows }: { rows: ImportComparisonRow[] }) {
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const differences = rows.filter((row) => comparisonStatus(row) === 'mismatch').length;
  const incomplete = rows.filter((row) => ['single', 'missing'].includes(comparisonStatus(row))).length;
  const visible = rows.filter((row) => !onlyDifferences || comparisonStatus(row) === 'mismatch')
    .sort((a, b) => Number(comparisonStatus(b) === 'mismatch') - Number(comparisonStatus(a) === 'mismatch'));

  return (
    <section className="form-card import-card fwd-comparison">
      <div className="import-card-heading">
        <div><h2>문서 대사 결과</h2><p>상업송장 · 포장명세서 · 선하증권</p></div>
        <span className="fwd-count">{rows.length}개 항목</span>
      </div>
      <div className="fwd-review-summary">
        <span className={differences ? 'has-difference' : ''}>불일치 <strong>{differences}</strong></span>
        <span>비교 자료 부족 <strong>{incomplete}</strong></span>
        <label><input type="checkbox" checked={onlyDifferences} onChange={(e) => setOnlyDifferences(e.target.checked)} />불일치만 보기</label>
      </div>
      <p className="fwd-caption">‘일치’는 값이 기재된 문서끼리 비교한 결과입니다. 단일 문서 기재 항목은 교차 검증되지 않았습니다.</p>
      {visible.length === 0 ? <p className="fwd-empty">{rows.length === 0 ? '아직 대사 결과가 없습니다.' : '불일치 항목이 없습니다.'}</p> : (
        <div className="fwd-comparison-items">
          {visible.map((row, index) => {
            const status = comparisonStatus(row);
            return (
              <article className={`fwd-comparison-item is-${status}`} key={`${row.field}-${index}`}>
                <div className="fwd-comparison-title"><h3>{IMPORT_FIELD_LABELS[row.field] ?? row.field}</h3><span className={`fwd-result-badge is-${status}`}>{COMPARISON_LABELS[status]}</span></div>
                <dl className="fwd-comparison-values">
                  {([['C/I · 상업송장', row.invoice], ['P/L · 포장명세서', row.packingList], ['B/L · 선하증권', row.billOfLading]] as const).map(([label, value]) => (
                    <div key={label}><dt>{label}</dt><dd className={hasDocumentValue(value) ? '' : 'is-absent'}>{hasDocumentValue(value) ? value : '미기재'}</dd></div>
                  ))}
                </dl>
                {status === 'mismatch' && row.detail && <p className="fwd-comparison-reason">{row.detail}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
