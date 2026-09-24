import { ArrowRight, FileSignature } from 'lucide-react';
import { useState } from 'react';
import type { TradeAttachment } from '../../../types/tradeFormData';
import { openOrDownloadTradeAttachment } from '../../../utils/tradeAttachmentView';
import type { ForwarderFormState } from '../../../utils/forwarderForm';

interface Props {
  state: ForwarderFormState;
  patch: (values: Partial<ForwarderFormState>) => void;
  patchCargoItem: (index: number, values: Partial<ForwarderFormState['cargoItems'][number]>) => void;
  readOnly: boolean;
  busy: boolean;
  onNext: () => void;
  attachments?: TradeAttachment[];
  userId?: string;
}

/** STEP 1 — 화주 의뢰 확인. 이미 접수된(받은 의뢰 또는 직접 등록) 화주 의뢰 내용을 포워더가 확인·보정한다. */
export default function ExportForwarderRequestStep({
  state,
  patch,
  patchCargoItem,
  readOnly,
  busy,
  onNext,
  attachments = [],
  userId,
}: Props) {
  const [documentError, setDocumentError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openDocument = async (document: TradeAttachment) => {
    if (!userId || openingId) return;
    setOpeningId(document.id);
    setDocumentError('');
    try { await openOrDownloadTradeAttachment(document, userId, false); }
    catch { setDocumentError('서류를 열지 못했습니다. 다시 시도해 주세요.'); }
    finally { setOpeningId(null); }
  };
  return (
    <div className="form-card forwarder-workspace-form fwd-export-stage">
      <div className="trade-section-header fwd-export-step-heading">
        <div>
          <span className="fwd-section-kicker">01 · 의뢰 확인</span>
          <h2 className="card-title">화주 의뢰와 서류</h2>
        </div>
      </div>

      <section className="fwd-export-source-docs fwd-export-content-card" aria-label="접수된 첨부 서류">
        <h3>접수된 첨부 서류 <span>{attachments.length}개</span></h3>
        {attachments.length ? <div className="fwd-export-source-list">{attachments.map(document =>
          <button key={document.id} type="button" className="btn btn-secondary" disabled={!userId || openingId !== null}
            onClick={() => void openDocument(document)}>
            <FileSignature size={16} />{document.fileName}{openingId === document.id ? ' · 여는 중…' : ' · 원본 보기'}
          </button>)}</div> : <p>첨부된 서류가 없습니다.</p>}
        {documentError && <p role="alert" className="form-message error">{documentError}</p>}
      </section>
      <dl className="fwd-export-summary-grid fwd-export-intake-summary" aria-label="접수 정보 요약">
        <div><dt>화주</dt><dd>{state.companyName || '미입력'}</dd></div>
        <div><dt>수하인</dt><dd>{state.partnerName || '미입력'}</dd></div>
        <div><dt>운송 구간</dt><dd>{[state.loadPort, state.dischargePort].filter(Boolean).join(' → ') || '미입력'}</dd></div>
        <div><dt>화물</dt><dd>{state.cargoItems[0]?.descriptionOfGoods || '미입력'} · {state.cargoItems.length}품목</dd></div>
      </dl>
      <fieldset className="workspace-readonly-fieldset" disabled={readOnly}>
        <details className="form-section fwd-export-content-card">
          <summary className="form-section-summary">운송의뢰 정보</summary>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">Shipper 회사명</label><input className="form-input" value={state.companyName} onChange={(e) => patch({ companyName: e.target.value })} placeholder="ABC Trading Co., Ltd." /></div>
            <div className="form-group"><label className="form-label">Shipper 영문 주소</label><input className="form-input" value={state.companyAddress} onChange={(e) => patch({ companyAddress: e.target.value })} placeholder="123 Teheran-ro, Gangnam-gu, Seoul, South Korea" /></div>
            <div className="form-group"><label className="form-label">Consignee 회사명</label><input className="form-input" value={state.partnerName} onChange={(e) => patch({ partnerName: e.target.value })} placeholder="Global Import LLC" /></div>
            <div className="form-group"><label className="form-label">Consignee 영문 주소</label><input className="form-input" value={state.partnerAddress} onChange={(e) => patch({ partnerAddress: e.target.value })} placeholder="250 Market Street, Los Angeles, CA, United States" /></div>
            <div className="form-group"><label className="form-label">Notify Party (선택)</label><input className="form-input" value={state.notifyPartyName} onChange={(e) => patch({ notifyPartyName: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Invoice No. (선택)</label><input className="form-input" value={state.invoiceNo} onChange={(e) => patch({ invoiceNo: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Incoterms</label><input className="form-input" value={state.incoterms} onChange={(e) => patch({ incoterms: e.target.value.toUpperCase() as ForwarderFormState['incoterms'] })} placeholder="FOB" /></div>
            <div className="form-group"><label className="form-label">희망 출항일</label><input type="date" className="form-input" value={state.requestedDepartureDate} onChange={(e) => patch({ requestedDepartureDate: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">운송방식</label><select className="form-input" value={state.loadingMode} onChange={(e) => patch({ loadingMode: e.target.value as ForwarderFormState['loadingMode'] })}><option value="">미정</option><option value="FCL">FCL</option><option value="LCL">LCL</option></select></div>
          </div>
        </details>

        <details className="form-section fwd-export-content-card">
          <summary className="form-section-summary">화물명세</summary>
          <div className="forwarder-cargo-items">
            {state.cargoItems.map((item, index) => (
              <details className="forwarder-cargo-item" open key={item.id || `cargo-${index + 1}`}>
                <summary>
                  <strong>{item.descriptionOfGoods || '품명 미입력'}</strong>
                </summary>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label" htmlFor={`cargo-description-${index}`}>Description of Goods</label><input id={`cargo-description-${index}`} className="form-input" value={item.descriptionOfGoods} onChange={(e) => patchCargoItem(index, { descriptionOfGoods: e.target.value })} placeholder="Women's 100% cotton T-shirts, black" /></div>
                  <div className="form-group"><label className="form-label" htmlFor={`cargo-packages-${index}`}>Number of Packages</label><input id={`cargo-packages-${index}`} type="number" min="0" className="form-input" value={item.numberOfPackages} onChange={(e) => patchCargoItem(index, { numberOfPackages: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
                  <div className="form-group"><label className="form-label" htmlFor={`cargo-package-type-${index}`}>Kind of Packages</label><input id={`cargo-package-type-${index}`} className="form-input" value={item.kindOfPackages} onChange={(e) => patchCargoItem(index, { kindOfPackages: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label" htmlFor={`cargo-weight-${index}`}>Gross Weight (kg)</label><input id={`cargo-weight-${index}`} type="number" min="0" step="any" className="form-input" value={item.grossWeightKg} onChange={(e) => patchCargoItem(index, { grossWeightKg: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
                  <div className="form-group"><label className="form-label" htmlFor={`cargo-measurement-${index}`}>Measurement CBM</label><input id={`cargo-measurement-${index}`} className="form-input" value={item.measurementCbm} onChange={(e) => patchCargoItem(index, { measurementCbm: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label" htmlFor={`cargo-marks-${index}`}>Marks &amp; Numbers (선택)</label><input id={`cargo-marks-${index}`} className="form-input" value={item.marksAndNumbers} onChange={(e) => patchCargoItem(index, { marksAndNumbers: e.target.value })} /></div>
                </div>
              </details>
            ))}
          </div>
          <div className="form-grid" style={{ marginTop: 14 }}>
            <div className="form-group"><label className="form-label">총 포장수 (선택)</label><input type="number" min="0" className="form-input" value={state.cargoTotals.numberOfPackages} onChange={(e) => patch({ cargoTotals: { ...state.cargoTotals, numberOfPackages: e.target.value === '' ? '' : Number(e.target.value) } })} /></div>
            <div className="form-group"><label className="form-label">총 중량 (Kg, 선택)</label><input type="number" min="0" className="form-input" value={state.cargoTotals.grossWeightKg} onChange={(e) => patch({ cargoTotals: { ...state.cargoTotals, grossWeightKg: e.target.value === '' ? '' : Number(e.target.value) } })} /></div>
            <div className="form-group"><label className="form-label">총 CBM (선택)</label><input className="form-input" value={state.cargoTotals.measurementCbm} onChange={(e) => patch({ cargoTotals: { ...state.cargoTotals, measurementCbm: e.target.value } })} /></div>
          </div>
        </details>
      </fieldset>

      {!readOnly && (
        <div className="form-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onNext}>
            다음: 선복 부킹 <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
