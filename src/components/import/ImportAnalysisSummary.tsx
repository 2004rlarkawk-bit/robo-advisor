import { Plus, Trash2 } from 'lucide-react';
import { syncLegacyImportFields } from '../../services/importDocumentAnalysisService';
import type {
  ImportAnalysisResult,
  ImportExtractedFields,
  ImportItem,
  ImportParty,
} from '../../types/importTrade';

interface Props {
  analysis: ImportAnalysisResult;
  onChange: (fields: ImportExtractedFields) => void;
  importerCompanyName?: string;
  hasCertificateOfOriginDocument?: boolean;
  readOnly?: boolean;
}

const PARTY_FIELDS: Array<[keyof ImportParty, string]> = [
  ['name', '회사명'], ['address', '주소'], ['country', '국가'],
  ['contactName', '담당자'], ['phone', '전화번호'],
];

const EMPTY_ITEM = (): ImportItem => ({
  id: crypto.randomUUID(),
  description: '',
  koreanDescription: '',
  documentHSCode: '',
  confirmedHSCode: '',
  modelName: '',
  specification: '',
  material: '',
  composition: '',
  fabricConstruction: '',
  productForm: '',
  processingState: '',
  gender: '',
  intendedUse: '',
  originCountry: '',
  quantity: '',
  quantityUnit: '',
  unitPrice: '',
  currency: '',
  amount: '',
  sourceDocumentIds: [],
});

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="form-group">
      <span className="form-label">{label}</span>
      <input className="form-input user-editable" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export default function ImportAnalysisSummary({
  analysis,
  onChange,
  importerCompanyName,
  hasCertificateOfOriginDocument = false,
  readOnly = false,
}: Props) {
  const fields = analysis.extracted;
  const commit = (next: ImportExtractedFields) => onChange(syncLegacyImportFields(next));
  const setField = (field: keyof ImportExtractedFields, value: string) => commit({ ...fields, [field]: value });
  const setParty = (
    partyKey: 'exporterDetails' | 'importerDetails' | 'consigneeDetails' | 'notifyPartyDetails',
    field: keyof ImportParty,
    value: string,
  ) => commit({ ...fields, [partyKey]: { ...fields[partyKey], [field]: value } });
  const setItem = (id: string, field: keyof ImportItem, value: string) => commit({
    ...fields,
    items: fields.items.map((item) => item.id === id ? { ...item, [field]: value } : item),
  });

  const importerMismatch = Boolean(
    importerCompanyName
    && fields.importerDetails.name
    && fields.importerDetails.name.trim().toLocaleLowerCase() !== importerCompanyName.trim().toLocaleLowerCase(),
  );

  return (
    <section className="form-card import-card">
      <div className="import-card-heading">
        <div><span className="ai-badge">AI 추출값</span><h2>분석 결과 확인 및 수정</h2></div>
        <p>첨부문서에서 확인된 값만 자동 입력했습니다. 잘못되거나 누락된 값만 수정해 주세요.</p>
      </div>

      <fieldset className="workspace-readonly-fieldset" disabled={readOnly}>

      <h3>A. 거래 당사자</h3>
      {([
        ['exporterDetails', 'Exporter / Shipper'],
        ['importerDetails', 'Importer'],
        ['consigneeDetails', 'Consignee'],
        ['notifyPartyDetails', 'Notify Party (선택)'],
      ] as const).map(([partyKey, title]) => (
        <fieldset className="import-party-fieldset" key={partyKey}>
          <legend>{title}</legend>
          {partyKey === 'consigneeDetails' && (
            <div className="import-party-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => commit({ ...fields, consigneeDetails: { ...fields.importerDetails } })}
              >
                Importer와 Consignee 동일
              </button>
            </div>
          )}
          {partyKey === 'notifyPartyDetails' && (
            <div className="import-party-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => commit({ ...fields, notifyPartyDetails: { ...fields.consigneeDetails } })}
              >
                Consignee와 Notify Party 동일
              </button>
            </div>
          )}
          <div className="import-field-grid">
            {PARTY_FIELDS.map(([field, label]) => (
              <TextField key={field} label={label} value={fields[partyKey][field]} onChange={(value) => setParty(partyKey, field, value)} />
            ))}
          </div>
          {partyKey === 'importerDetails' && importerMismatch && (
            <div className="form-message warning">
              문서의 Importer가 로그인 회사({importerCompanyName})와 다릅니다. 문서값을 덮어쓰지 않았으니 확인해 주세요.
            </div>
          )}
        </fieldset>
      ))}

      <h3>B. Invoice 정보</h3>
      <div className="import-field-grid">
        <TextField label="Invoice 번호" value={fields.invoiceNo} onChange={(value) => setField('invoiceNo', value)} />
        <TextField label="Invoice 발행일" type="date" value={fields.invoiceDate} onChange={(value) => setField('invoiceDate', value)} />
        <TextField label="통화" value={fields.currency} onChange={(value) => setField('currency', value)} />
        <TextField label="Invoice 총금액" value={fields.totalAmount} onChange={(value) => setField('totalAmount', value)} />
        <TextField label="Incoterms" value={fields.incoterms} onChange={(value) => setField('incoterms', value)} />
        <TextField label="결제조건" value={fields.paymentTerms} onChange={(value) => setField('paymentTerms', value)} />
      </div>

      <h3>C. 해상운송 정보</h3>
      <div className="import-field-grid">
        <TextField label="B/L 번호" value={fields.blNo} onChange={(value) => setField('blNo', value)} />
        <TextField label="선박명" value={fields.vesselName} onChange={(value) => setField('vesselName', value)} />
        <TextField label="항차" value={fields.voyageNo} onChange={(value) => setField('voyageNo', value)} />
        <TextField label="적재항" value={fields.loadPort} onChange={(value) => setField('loadPort', value)} />
        <TextField label="양륙항" value={fields.dischargePort} onChange={(value) => setField('dischargePort', value)} />
        <TextField label="수입국" value={fields.destinationCountry} onChange={(value) => setField('destinationCountry', value)} />
        <TextField label="선적일" type="date" value={fields.shipmentDate} onChange={(value) => setField('shipmentDate', value)} />
        <TextField label="입항예정일" type="date" value={fields.estimatedArrivalDate} onChange={(value) => setField('estimatedArrivalDate', value)} />
        <TextField label="컨테이너 번호 (쉼표 구분)" value={fields.containerNumbers.join(', ')} placeholder="선택" onChange={(value) => commit({ ...fields, containerNumbers: value.split(',').map((v) => v.trim()).filter(Boolean) })} />
        <TextField label="Seal 번호 (쉼표 구분)" value={fields.sealNumbers.join(', ')} placeholder="선택" onChange={(value) => commit({ ...fields, sealNumbers: value.split(',').map((v) => v.trim()).filter(Boolean) })} />
      </div>

      <div className="import-section-heading">
        <h3>D. 품목정보</h3>
        <button type="button" className="btn btn-secondary" onClick={() => commit({ ...fields, items: [...fields.items, EMPTY_ITEM()] })}>
          <Plus size={15} /> 품목 추가
        </button>
      </div>
      {fields.items.length === 0 && <div className="form-message warning">문서에서 품목이 확인되지 않았습니다. 필요한 경우 품목을 추가해 주세요.</div>}
      {fields.items.map((item, index) => (
        <fieldset className="import-item-fieldset" key={item.id}>
          <legend>품목 {index + 1}</legend>
          <button type="button" className="icon-btn import-delete" aria-label={`품목 ${index + 1} 삭제`} onClick={() => commit({ ...fields, items: fields.items.filter((entry) => entry.id !== item.id) })}>
            <Trash2 size={16} />
          </button>
          <div className="import-field-grid">
            <TextField label="품명" value={item.description} onChange={(value) => setItem(item.id, 'description', value)} />
            <TextField label="한글 품명" value={item.koreanDescription} onChange={(value) => setItem(item.id, 'koreanDescription', value)} />
            <TextField label="모델명" value={item.modelName} placeholder="선택" onChange={(value) => setItem(item.id, 'modelName', value)} />
            <TextField label="규격" value={item.specification} placeholder="선택" onChange={(value) => setItem(item.id, 'specification', value)} />
            <TextField label="재질" value={item.material} placeholder="선택" onChange={(value) => setItem(item.id, 'material', value)} />
            <TextField label="성분" value={item.composition} placeholder="선택" onChange={(value) => setItem(item.id, 'composition', value)} />
            <TextField label="용도" value={item.intendedUse} placeholder="선택" onChange={(value) => setItem(item.id, 'intendedUse', value)} />
            {fields.certificateOfOriginAvailable && (
              <TextField label="원산지" value={item.originCountry} onChange={(value) => setItem(item.id, 'originCountry', value)} />
            )}
            <TextField label="수량" value={item.quantity} onChange={(value) => setItem(item.id, 'quantity', value)} />
            <TextField label="수량 단위" value={item.quantityUnit} onChange={(value) => setItem(item.id, 'quantityUnit', value)} />
            <TextField label="단가" value={item.unitPrice} onChange={(value) => setItem(item.id, 'unitPrice', value)} />
            <TextField label="통화" value={item.currency} onChange={(value) => setItem(item.id, 'currency', value)} />
            <TextField label="품목 금액" value={item.amount} onChange={(value) => setItem(item.id, 'amount', value)} />
          </div>
          <small>추출 출처: {item.sourceDocumentIds.length ? item.sourceDocumentIds.join(', ') : '첨부문서에서 출처 식별값을 확인할 수 없음'}</small>
        </fieldset>
      ))}

      <h3>E. 포장 및 중량</h3>
      <div className="import-field-grid">
        <TextField label="포장수량" value={fields.totalPackageCount} onChange={(value) => setField('totalPackageCount', value)} />
        <TextField label="포장단위" value={fields.packageUnit} onChange={(value) => setField('packageUnit', value)} />
        <TextField label="순중량" value={fields.netWeight} onChange={(value) => setField('netWeight', value)} />
        <TextField label="순중량 단위" value={fields.netWeightUnit} onChange={(value) => setField('netWeightUnit', value)} />
        <TextField label="총중량" value={fields.grossWeight} onChange={(value) => setField('grossWeight', value)} />
        <TextField label="총중량 단위" value={fields.grossWeightUnit} onChange={(value) => setField('grossWeightUnit', value)} />
      </div>

      <h3>F. 원산지증명서</h3>
      <div className="form-group import-co-status">
        <span className="form-label">원산지증명서 (C/O)</span>
        <div className="import-choice-buttons" role="group" aria-label="원산지증명서 유무">
          <button
            type="button"
            className={`import-choice-button ${fields.certificateOfOriginAvailable ? 'selected' : ''}`}
            aria-pressed={fields.certificateOfOriginAvailable}
            disabled={!hasCertificateOfOriginDocument}
            onClick={() => commit({ ...fields, certificateOfOriginAvailable: true })}
          >
            유
          </button>
          <button
            type="button"
            className={`import-choice-button ${!fields.certificateOfOriginAvailable ? 'selected' : ''}`}
            aria-pressed={!fields.certificateOfOriginAvailable}
            onClick={() => commit({ ...fields, certificateOfOriginAvailable: false })}
          >
            무
          </button>
        </div>
        <small>
          {!hasCertificateOfOriginDocument
            ? '첨부된 C/O가 없어 자동으로 ‘무’가 선택되었습니다.'
            : fields.certificateOfOriginAvailable
            ? '첨부된 C/O에서 확인된 원산지 값을 품목별로 검토해 주세요.'
            : 'C/O가 첨부되어 있습니다. 원산지증명서 상태를 확인해 주세요.'}
        </small>
      </div>

      <div className="import-validation-list">
        {analysis.validations.length === 0
          ? <div className="form-message success">현재 AI 분석에서 명시적인 문서 간 불일치는 발견되지 않았습니다.</div>
          : analysis.validations.map((issue) => (
            <div key={issue.id} className={`form-message ${issue.severity}`}>
              {issue.message}
              {issue.values?.length ? ` (${issue.values.map((entry) => `${entry.documentId}: ${entry.value}`).join(' / ')})` : ''}
            </div>
          ))}
      </div>
      </fieldset>
    </section>
  );
}
