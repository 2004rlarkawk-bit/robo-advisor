import type { ImportDutyEstimate } from '../../types/importTrade';
import type { FtaEligibility } from '../../services/ftaAgreementService';

export default function ImportDutySummary({ duty, error, busy = false, ftaReviewing = false, ftaEligibility = null, readOnly = false, onRetry }: {
  duty: ImportDutyEstimate | null;
  error: string;
  busy?: boolean;
  /** FTA 적용 가능성 확인을 골랐는지 */
  ftaReviewing?: boolean;
  /** 확인 결과 — applyRate가 참일 때만 협정세율을 예상세액에 반영한다 */
  ftaEligibility?: FtaEligibility | null;
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
  // 반영하지 못한 항목이 있으면 세액을 완성된 결과처럼 보이지 않게 한다.
  const missing = valuation?.unconfirmed ?? [];
  const provisional = missing.length > 0;
  const krw = (value: number | null) => value == null ? '확인 필요' : `${Math.round(value).toLocaleString('ko-KR')}원`;
  const fta = duty.fta;
  const ftaApplied = Boolean(ftaReviewing && ftaEligibility?.applyRate && fta?.duty != null && fta.rate != null);
  const ftaVat = fta?.duty == null ? null : Math.round((duty.customsValue + fta.duty) * 0.1);
  const ftaRateText = !ftaReviewing
    ? '미적용'
    : fta?.rate == null
      ? '확인 필요'
      : ftaApplied ? `${fta.rate}%` : `${fta.rate}% · 증빙 확인 후 적용`;
  // 환율 기준일 YYYYMMDD → YYYY.MM.DD (수출 과세가격 카드와 표기 통일)
  const ymd = (d: string) => /^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : d;
  return (
    <section className="form-card import-card">
      <div className="import-card-heading"><div><h2>예상 관세액</h2></div><span className="source-badge">{provisional ? '참고' : 'API'}</span></div>
      <dl className="duty-grid">
        <div><dt>Invoice 통화</dt><dd>{duty.invoiceCurrency}</dd></div>
        <div><dt>Invoice 금액</dt><dd>{duty.invoiceAmount.toLocaleString()}</dd></div>
        <div><dt>적용 환율</dt><dd>{duty.exchangeRate.toLocaleString()}원</dd></div>
        <div><dt>환율 기준일</dt><dd>{ymd(duty.exchangeRateDate)}</dd></div>
        <div><dt>원화 환산금액</dt><dd>{krw(duty.convertedInvoiceKrw)}</dd></div>
        <div><dt>운임·보험료 가산{valuation?.incoterms ? ` (${valuation.incoterms})` : ''}</dt><dd>{duty.additionsKrw == null ? '확인 필요' : krw(duty.additionsKrw)}</dd></div>
        <div><dt>예상 과세가격</dt><dd>{krw(duty.customsValue)}</dd></div>
        <div><dt>기본 관세율</dt><dd>{duty.basicRate}%</dd></div>
        <div><dt>FTA 협정</dt><dd>{ftaReviewing ? duty.ftaAgreement : '미적용'}</dd></div>
        <div><dt>FTA 세율</dt><dd>{ftaRateText}</dd></div>
        <div><dt>{ftaApplied ? '기본세율 기준 예상 관세' : '예상 관세'}</dt><dd>{krw(duty.basicDuty)}</dd></div>
        <div><dt>부가가치세</dt><dd>{krw(duty.vat)}</dd></div>
        <div><dt>기타 세금</dt><dd>{krw(duty.otherTaxes)}</dd></div>
        <div><dt>{provisional ? `${missing.join('·')} 미반영 참고세액` : ftaApplied ? '기본세율 기준 총 예상세액' : '총 예상세액'}</dt><dd>{krw(duty.totalTax)}</dd></div>
        <div><dt>예상 절감액</dt><dd>{ftaApplied ? krw(fta?.savings ?? null) : ftaReviewing && fta?.savings != null ? '증빙 확인 후 표시' : '확인 필요'}</dd></div>
        {ftaApplied && fta && (
          <>
            <div className="duty-grid-fta"><dt>FTA 적용 시 예상 관세</dt><dd>{krw(fta.duty)}</dd></div>
            <div className="duty-grid-fta"><dt>FTA 적용 시 부가가치세</dt><dd>{krw(ftaVat)}</dd></div>
            <div className="duty-grid-fta"><dt>FTA 적용 시 총 예상세액</dt><dd>{krw(fta.duty == null || ftaVat == null ? null : fta.duty + ftaVat)}</dd></div>
          </>
        )}
      </dl>
      {valuation && valuation.notes.length > 0 && (
        <div className="form-message warning" role="status">
          {valuation.notes.map((note) => <div key={note}>{note}</div>)}
        </div>
      )}
      <p className="import-notice">
        {ftaApplied
          ? '원산지증명서가 첨부되어 협정세율 기준 예상세액을 함께 보여줍니다. 원산지 결정기준 충족 여부는 관세사와 확인한 뒤 신고하세요.'
          : ftaReviewing
            ? '위 금액은 기본 관세율 기준입니다. 원산지증명서와 적용 요건이 확인되면 협정세율 기준 예상세액과 절감액을 반영합니다.'
            : '위 금액은 기본 관세율 기준입니다. FTA 협정세율은 원산지증명서와 적용 요건 확인 전에는 적용하지 않습니다.'}
        {' '}수수료·로열티 등 운임·보험료 외의 가산·공제 요소는 반영하지 않은 추정치입니다.
      </p>
    </section>
  );
}
