import type { ImportAnalysisResult, ImportExtractedFields } from '../../types/importTrade';

const FIELDS: Array<[keyof ImportExtractedFields, string]> = [
  ['shipper', 'Shipper (수출자)'], ['consignee', 'Buyer / Consignee (수하인)'],
  ['notifyParty', 'Notify Party (착화통지처)'], ['importer', 'Importer (수입자)'],
  ['invoiceNo', 'Invoice 번호'], ['productDescription', '품명'], ['quantity', '수량'],
  ['grossWeight', '총중량'], ['netWeight', '순중량'], ['originCountry', '원산지'],
  ['destinationCountry', '수입국'], ['currency', '통화'], ['totalAmount', '총금액'],
  ['loadPort', '적재항'], ['dischargePort', '양륙항'], ['blNo', 'B/L 번호'],
  ['containerNo', '컨테이너 번호'], ['sealNo', 'Seal 번호'],
  ['vesselName', '선박명'], ['voyageNo', '항차'],
];

interface Props {
  analysis: ImportAnalysisResult;
  onChange: (fields: ImportExtractedFields) => void;
}

export default function ImportAnalysisSummary({ analysis, onChange }: Props) {
  return (
    <section className="form-card import-card">
      <div className="import-card-heading">
        <div><span className="ai-badge">AI 추출값</span><h2>분석 결과 확인</h2></div>
        <p>필요한 값을 수정하면 최종 저장값으로 사용됩니다.</p>
      </div>
      <div className="import-field-grid">
        {FIELDS.map(([field, label]) => (
          <label key={field} className="form-group">
            <span className="form-label">{label}</span>
            <input className="form-input user-editable" value={analysis.extracted[field]} onChange={(event) => onChange({ ...analysis.extracted, [field]: event.target.value })} />
          </label>
        ))}
      </div>
      <div className="import-validation-list">
        {analysis.validations.length === 0
          ? <div className="form-message success">업로드된 서류에서 주요 정보의 불일치가 발견되지 않았습니다.</div>
          : analysis.validations.map((issue) => <div key={issue.id} className={`form-message ${issue.severity}`}>{issue.message}</div>)}
      </div>
    </section>
  );
}
