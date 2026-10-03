import type { ImportDutyEstimate } from '../../types/importTrade';

export default function ImportDutySummary({ duty, error, busy = false, ftaReviewing = false, readOnly = false, onRetry }: {
  duty: ImportDutyEstimate | null;
  error: string;
  busy?: boolean;
  /** FTA 적용 가능 여부를 확인 중인지 */
  ftaReviewing?: boolean;
  /** 문서 관리에서 조회로 연 화면 — 다시 계산하지 않고 저장된 값만 보여준다. */
  readOnly?: boolean;
  onRetry?: () => void;
}) {
  if (!duty) {
    // 사유를 뭉뚱그리지 않는다. 조회 화면에서 계산을 시도하지도 않았는데
    // '관세율 정보를 확인할 수 없어'라고 적으면 API가 고장 난 것처럼 읽힌다.
    const message = busy
      ? '기본 관세율로 예상세액을 계산하고 있습니다…'
      : error
        || (readOnly
          ? '이 거래에는 예상세액이 저장되어 있지 않습니다. 목록에서 거래를 이어서 열면 다시 계산합니다.'
          : '아직 예상세액을 계산하지 않았습니다.');
    return (
      <section className="form-card import-card">
        <div className="import-card-heading">
          <div><h2>예상 관세액</h2></div>
          <span className="source-badge">{busy ? '계산 중' : '계산 전'}</span>
        </div>
        <div className={`form-message ${busy ? 'info' : 'warning'}`} role="status">{message}</div>
        {!busy && !readOnly && onRetry && (
          <div className="import-actions">
            <button type="button" className="btn btn-secondary" onClick={onRetry}>예상세액 다시 계산</button>
          </div>
        )}
      </section>
    );
  }
  const valuation = duty.valuation;
  const krw = (value: number | null) => value == null ? '확인 필요' : `${Math.round(value).toLocaleString('ko-KR')}원`;
  // 환율 기준일 YYYYMMDD → YYYY.MM.DD (수출 과세가격 카드와 표기 통일)
  const ymd = (d: string) => /^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : d;
  return (
    <section className="form-card import-card">
      <div className="import-card-heading"><div><h2>예상 관세액</h2></div><span className="source-badge">API</span></div>
      <dl className="duty-grid">
        <div><dt>Invoice 통화</dt><dd>{duty.invoiceCurrency}</dd></div>
        <div><dt>Invoice 금액</dt><dd>{duty.invoiceAmount.toLocaleString()}</dd></div>
        <div><dt>적용 환율</dt><dd>{duty.exchangeRate.toLocaleString()}원</dd></div>
        <div><dt>환율 기준일</dt><dd>{ymd(duty.exchangeRateDate)}</dd></div>
        <div><dt>원화 환산금액</dt><dd>{krw(duty.convertedInvoiceKrw)}</dd></div>
        <div><dt>운임·보험료 가산{valuation?.incoterms ? ` (${valuation.incoterms})` : ''}</dt><dd>{duty.additionsKrw == null ? '확인 필요' : krw(duty.additionsKrw)}</dd></div>
        <div><dt>예상 과세가격</dt><dd>{krw(duty.customsValue)}</dd></div>
        <div><dt>기본 관세율</dt><dd>{duty.basicRate}%</dd></div>
        <div><dt>FTA 협정</dt><dd>{duty.ftaAgreement}</dd></div>
        <div><dt>FTA 세율</dt><dd>{duty.ftaRate == null ? (ftaReviewing ? '확인 필요' : '미적용') : `${duty.ftaRate}%`}</dd></div>
        <div><dt>예상 관세</dt><dd>{krw(duty.basicDuty)}</dd></div>
        <div><dt>부가가치세</dt><dd>{krw(duty.vat)}</dd></div>
        <div><dt>기타 세금</dt><dd>{krw(duty.otherTaxes)}</dd></div>
        <div><dt>총 예상세액</dt><dd>{krw(duty.totalTax)}</dd></div>
        <div><dt>예상 절감액</dt><dd>{krw(duty.estimatedSavings)}</dd></div>
      </dl>
      {valuation && valuation.notes.length > 0 && (
        <div className="form-message warning" role="status">
          {valuation.notes.map((note) => <div key={note}>{note}</div>)}
        </div>
      )}
      <p className="import-notice">
        {ftaReviewing
          ? duty.ftaRate == null
            ? '위 금액은 기본 관세율 기준입니다. 협정세율을 확인하면 FTA 적용 예상세액과 절감액을 함께 보여줍니다.'
            : '원산지증명서와 협정 요건을 관세사와 확인한 뒤 협정세율을 적용하세요.'
          : '위 금액은 기본 관세율 기준입니다. FTA 협정세율은 원산지증명서와 적용 요건 확인 전에는 적용하지 않습니다.'}
      </p>
    </section>
  );
}
