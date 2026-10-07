import { useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import RequiredMark from '../RequiredMark';
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
  hasCertificateOfOriginDocument?: boolean;
  readOnly?: boolean;
  /** 문서 id → 파일명 매핑 — 검증 메시지의 근거 값 표기에 사용 */
}

const PARTY_FIELDS: Array<[keyof ImportParty, string]> = [
  ['name', '회사명'], ['address', '주소'], ['country', '국가'],
  ['phone', '전화번호'],
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
  required,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="form-group">
      <span className="form-label">{label}{required && <RequiredMark />}</span>
      <input className="form-input user-editable" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

interface FieldSpec {
  key: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  /** 신고·세액 계산에 꼭 필요한 칸 — 비어 있어도 항상 보여 채우게 한다. */
  required?: boolean;
}

/**
 * 서류에서 값을 찾은 칸과 꼭 필요한 칸만 보여 준다.
 * 비어 있는 선택 칸은 숨기고, 아래 [+ 칸 이름] 버튼으로 필요할 때 하나씩 꺼낸다.
 */
function AdaptiveFieldGrid({
  specs,
  revealed,
  onReveal,
  readOnly,
}: {
  specs: FieldSpec[];
  revealed: Set<string>;
  onReveal: (key: string) => void;
  readOnly: boolean;
}) {
  const isShown = (spec: FieldSpec) => spec.required || spec.value.trim() !== '' || revealed.has(spec.key);
  const hidden = specs.filter((spec) => !isShown(spec));
  return (
    <>
      <div className="import-field-grid">
        {specs.filter(isShown).map((spec) => (
          <TextField key={spec.key} label={spec.label} required={spec.required} value={spec.value} type={spec.type} placeholder={spec.placeholder} onChange={spec.onChange} />
        ))}
      </div>
      {!readOnly && hidden.length > 0 && (
        <div className="import-hidden-fields" aria-label="서류에 없어 숨긴 칸">
          <span className="import-hidden-fields-label">서류에 없던 칸 추가</span>
          {hidden.map((spec) => (
            <button key={spec.key} type="button" className="import-hidden-field-chip" onClick={() => onReveal(spec.key)}>
              <Plus size={13} /> {spec.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function ImportAnalysisSummary({
  analysis,
  onChange,
  hasCertificateOfOriginDocument = false,
  readOnly = false,
}: Props) {
  const [open, setOpen] = useState(true);
  // 사용자가 [+ 칸 이름]으로 꺼낸 빈 칸 — 값을 지워도 바로 사라지지 않게 기억한다.
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const reveal = (key: string) => setRevealed((current) => new Set(current).add(key));
  const grid = (specs: FieldSpec[]) => (
    <AdaptiveFieldGrid specs={specs} revealed={revealed} onReveal={reveal} readOnly={readOnly} />
  );
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

  return (
    <section className="form-card import-card">
      {/* 제목을 누르면 분석 결과 전체를 접고 펼친다 */}
      <button
        type="button"
        className={`import-card-heading import-card-toggle${open ? ' is-open' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <div><span className="ai-badge">AI 추출값</span><h2>분석 결과 확인</h2></div>
        <span className="import-card-toggle-hint">{open ? '접기' : '펼치기'}<ChevronDown size={16} /></span>
      </button>

      <fieldset className="workspace-readonly-fieldset" disabled={readOnly} hidden={!open}>

      <details className="form-section">
      <summary className="form-section-summary"><span>A. 거래 당사자</span></summary>
      {([
        ['exporterDetails', 'Exporter / Shipper'],
        ['importerDetails', 'Importer'],
        ['consigneeDetails', 'Consignee'],
        ['notifyPartyDetails', 'Notify Party (선택)'],
      ] as const).map(([partyKey, title]) => (
        <fieldset className="import-party-fieldset" key={partyKey}>
          <legend>{title}</legend>
          {partyKey === 'importerDetails' && fields.importerDetails.name.trim()
            && JSON.stringify(fields.importerDetails) === JSON.stringify(fields.consigneeDetails) && (
            <small className="import-party-note">
              Consignee와 같은 정보로 채워져 있습니다. 수입자가 다르면 고쳐 주세요.
            </small>
          )}
          {partyKey === 'importerDetails' && (
            <div className="import-party-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!fields.consigneeDetails.name.trim()}
                onClick={() => commit({ ...fields, importerDetails: { ...fields.consigneeDetails } })}
              >
                Consignee 정보를 Importer에 복사
              </button>
            </div>
          )}
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
          {grid(PARTY_FIELDS.map(([field, label]) => ({
            key: `${partyKey}.${field}`,
            label,
            value: fields[partyKey][field],
            onChange: (value: string) => setParty(partyKey, field, value),
            required: field === 'name' && partyKey !== 'notifyPartyDetails',
          })))}
        </fieldset>
      ))}
      </details>

      <details className="form-section">
      <summary className="form-section-summary"><span>B. Invoice 정보</span></summary>
      {grid([
        { key: 'invoiceNo', label: 'Invoice 번호', value: fields.invoiceNo, onChange: (value) => setField('invoiceNo', value), required: true },
        { key: 'invoiceDate', label: 'Invoice 발행일', type: 'date', value: fields.invoiceDate, onChange: (value) => setField('invoiceDate', value) },
        { key: 'currency', label: '통화', value: fields.currency, onChange: (value) => setField('currency', value), required: true },
        { key: 'totalAmount', label: 'Invoice 총금액', value: fields.totalAmount, onChange: (value) => setField('totalAmount', value), required: true },
        { key: 'incoterms', label: 'Incoterms', value: fields.incoterms, onChange: (value) => setField('incoterms', value), required: true },
        { key: 'paymentTerms', label: '결제조건', value: fields.paymentTerms, onChange: (value) => setField('paymentTerms', value) },
      ])}
      </details>

      <details className="form-section">
      <summary className="form-section-summary"><span>C. 해상운송 정보</span></summary>
      {grid([
        { key: 'blNo', label: 'B/L 번호', value: fields.blNo, onChange: (value) => setField('blNo', value), required: true },
        { key: 'vesselName', label: '선박명', value: fields.vesselName, onChange: (value) => setField('vesselName', value) },
        { key: 'voyageNo', label: '항차', value: fields.voyageNo, onChange: (value) => setField('voyageNo', value) },
        { key: 'loadPort', label: '적재항', value: fields.loadPort, onChange: (value) => setField('loadPort', value), required: true },
        { key: 'dischargePort', label: '양륙항', value: fields.dischargePort, onChange: (value) => setField('dischargePort', value) },
        { key: 'destinationCountry', label: '수입국', value: fields.destinationCountry, onChange: (value) => setField('destinationCountry', value) },
        { key: 'shipmentDate', label: '선적일', type: 'date', value: fields.shipmentDate, onChange: (value) => setField('shipmentDate', value) },
        { key: 'estimatedArrivalDate', label: '입항예정일', type: 'date', value: fields.estimatedArrivalDate, onChange: (value) => setField('estimatedArrivalDate', value) },
        { key: 'containerNumbers', label: '컨테이너 번호 (쉼표 구분)', value: fields.containerNumbers.join(', '), onChange: (value) => commit({ ...fields, containerNumbers: value.split(',').map((v) => v.trim()).filter(Boolean) }) },
        { key: 'sealNumbers', label: 'Seal 번호 (쉼표 구분)', value: fields.sealNumbers.join(', '), onChange: (value) => commit({ ...fields, sealNumbers: value.split(',').map((v) => v.trim()).filter(Boolean) }) },
      ])}
      </details>

      <details className="form-section">
      <summary className="form-section-summary"><span>D. 품목정보</span></summary>
      <div className="import-section-heading">
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
          {grid([
            { key: `${item.id}.description`, label: '품명', value: item.description, onChange: (value) => setItem(item.id, 'description', value), required: true },
            // 수입신고서의 '모델·규격' 칸과 같게 한 칸으로 보여준다. 고치면 규격에 담고 모델명은 비운다.
            {
              key: `${item.id}.spec`,
              label: '모델·규격',
              value: [item.modelName, item.specification].filter((value) => value?.trim()).join(', '),
              placeholder: '예: VF-500, 500ML',
              onChange: (value) => commit({
                ...fields,
                items: fields.items.map((entry) => entry.id === item.id ? { ...entry, modelName: '', specification: value } : entry),
              }),
            },
            { key: `${item.id}.material`, label: '재질', value: item.material, onChange: (value) => setItem(item.id, 'material', value) },
            { key: `${item.id}.composition`, label: '성분', value: item.composition, onChange: (value) => setItem(item.id, 'composition', value) },
            { key: `${item.id}.intendedUse`, label: '용도', value: item.intendedUse, onChange: (value) => setItem(item.id, 'intendedUse', value) },
            ...(fields.certificateOfOriginAvailable
              ? [{ key: `${item.id}.originCountry`, label: '원산지', value: item.originCountry, onChange: (value: string) => setItem(item.id, 'originCountry', value), required: true }]
              : []),
            { key: `${item.id}.quantity`, label: '수량', value: item.quantity, onChange: (value) => setItem(item.id, 'quantity', value), required: true },
            { key: `${item.id}.quantityUnit`, label: '수량 단위', value: item.quantityUnit, onChange: (value) => setItem(item.id, 'quantityUnit', value), required: true },
            { key: `${item.id}.unitPrice`, label: '단가', value: item.unitPrice, onChange: (value) => setItem(item.id, 'unitPrice', value), required: true },
            { key: `${item.id}.currency`, label: '통화', value: item.currency, onChange: (value) => setItem(item.id, 'currency', value), required: true },
            { key: `${item.id}.amount`, label: '품목 금액', value: item.amount, onChange: (value) => setItem(item.id, 'amount', value), required: true },
          ])}
          <small>추출 출처: {item.sourceDocumentIds.length ? item.sourceDocumentIds.join(', ') : '첨부문서에서 출처 식별값을 확인할 수 없음'}</small>
        </fieldset>
      ))}
      </details>

      <details className="form-section">
      <summary className="form-section-summary"><span>E. 포장 및 중량</span></summary>
      {grid([
        { key: 'totalPackageCount', label: '포장수량', value: fields.totalPackageCount, onChange: (value) => setField('totalPackageCount', value), required: true },
        { key: 'packageUnit', label: '포장단위', value: fields.packageUnit, onChange: (value) => setField('packageUnit', value), required: true },
        { key: 'netWeight', label: '순중량', value: fields.netWeight, onChange: (value) => setField('netWeight', value) },
        { key: 'netWeightUnit', label: '순중량 단위', value: fields.netWeightUnit, onChange: (value) => setField('netWeightUnit', value) },
        { key: 'grossWeight', label: '총중량', value: fields.grossWeight, onChange: (value) => setField('grossWeight', value), required: true },
        { key: 'grossWeightUnit', label: '총중량 단위', value: fields.grossWeightUnit, onChange: (value) => setField('grossWeightUnit', value), required: true },
      ])}
      </details>

      <details className="form-section">
      <summary className="form-section-summary"><span>F. 원산지증명서</span></summary>
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
      </details>

      </fieldset>
    </section>
  );
}
