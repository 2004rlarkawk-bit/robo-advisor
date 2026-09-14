import type { ImportComparisonRow } from '../../types/importTrade';

export default function ImportDocumentComparison({ rows, title = '문서 간 대사' }: { rows: ImportComparisonRow[]; title?: string }) {
  return (
    <section className="form-card import-card">
      <div className="import-card-heading"><div><h2>{title}</h2></div><p>B/L, C/I, P/L의 주요 값을 비교합니다.</p></div>
      {rows.length === 0 ? <p className="form-message" role="status">아직 서류 간 비교 결과가 없습니다. 결과가 없다고 해서 모든 항목이 일치하는 것은 아닙니다.</p> : <>
      <div className="import-table-wrap">
        <table className="import-table">
          <thead><tr><th>검사항목</th><th>C/I</th><th>P/L</th><th>B/L</th><th>결과</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.field}><th>{row.field}</th><td>{row.invoice}</td><td>{row.packingList}</td><td>{row.billOfLading}</td><td><span className={`match-badge ${row.matches ? 'match' : 'mismatch'}`} title={row.detail}>{row.matches ? '일치' : '불일치'}</span></td></tr>)}</tbody>
        </table>
      </div>
      {rows.every((row) => row.matches) && <div className="form-message success">비교된 {rows.length}개 항목이 모두 일치합니다.</div>}
      </>}
    </section>
  );
}
