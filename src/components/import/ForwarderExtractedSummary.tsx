import type { ForwarderImportCase } from '../../types/forwarderCase';

export default function ForwarderExtractedSummary({ item }: { item: ForwarderImportCase }) {
  const fields = item.snapshot.analysis.extracted;
  const values = [
    ['수입자', fields.importer || item.importer],
    ['운송 구간', [fields.loadPort, fields.dischargePort].filter(Boolean).join(' → ')],
    ['거래 조건', fields.incoterms],
    ['송장 금액', [fields.currency, fields.totalAmount].filter(Boolean).join(' ')],
    ['총중량', [fields.grossWeight, fields.grossWeightUnit].filter(Boolean).join(' ')],
    ['용적', fields.measurement ? `${fields.measurement} CBM` : ''],
  ];
  return <section className="form-card import-card fwd-extracted-card">
    <div className="import-card-heading"><div><h2>서류에서 가져온 정보</h2><p>신고자료에 사용할 주요 값을 원본과 확인하세요.</p></div><span className="fwd-soft-badge">AI 추출</span></div>
    <dl className="fwd-extracted-grid">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || <span className="fwd-missing-value">미기재</span>}</dd></div>)}</dl>
    {fields.items?.length > 0 && <details className="fwd-item-details"><summary>품목 정보 <b>{fields.items.length}건</b></summary><div className="fwd-items-scroll"><table><thead><tr><th>품목</th><th>HS 코드</th><th>원산지</th><th>수량</th></tr></thead><tbody>{fields.items.map(part => <tr key={part.id}><td>{part.koreanDescription || part.description || '미기재'}</td><td>{part.confirmedHSCode || part.documentHSCode || '확인 필요'}</td><td>{part.originCountry || '미기재'}</td><td>{[part.quantity, part.quantityUnit].filter(Boolean).join(' ') || '미기재'}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
