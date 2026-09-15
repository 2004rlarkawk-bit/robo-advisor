import { useState } from 'react';
import { ArrowRight, FileSignature, Plus, RotateCcw, X } from 'lucide-react';
import type { ForwarderFormState } from '../../../utils/forwarderForm';
import type { TradeAttachment } from '../../../types/tradeFormData';
import TradeAttachmentUploader from '../../TradeAttachmentUploader';
import ForwarderExportRequestInbox from '../../ForwarderExportRequestInbox';
import type { ForwarderExportRequest } from '../../../services/forwarderExportRequestService';
import type { ForwarderAutoFillApplicationResult } from '../../../services/forwarderDocumentAnalysisService';

interface Props {
  state: ForwarderFormState;
  patch: (values: Partial<ForwarderFormState>) => void;
  patchCargoItem: (index: number, values: Partial<ForwarderFormState['cargoItems'][number]>) => void;
  userId: string;
  attachmentScopeId: string;
  attachments: TradeAttachment[];
  onAttachmentsChange: (attachments: TradeAttachment[]) => void;
  onApplyAnalysis: (
    values: Partial<ForwarderFormState>,
    sourceFiles: Record<string, string>,
  ) => ForwarderAutoFillApplicationResult;
  readOnly: boolean;
  busy: boolean;
  onNext: () => void;
  onResetTrade: () => void;
  showRequestInbox: boolean;
  appliedRequestTradeId?: string | null;
  onApplyExportRequest?: (request: ForwarderExportRequest) => void;
}

/** STEP 1 — 운송 의뢰 접수 + AI 서류 분석. 화주 의뢰함, 서류 업로드, 당사자·화물명세를 다룬다. */
export default function ExportForwarderRequestStep({
  state,
  patch,
  patchCargoItem,
  userId,
  attachmentScopeId,
  attachments,
  onAttachmentsChange,
  onApplyAnalysis,
  readOnly,
  busy,
  onNext,
  onResetTrade,
  showRequestInbox,
  appliedRequestTradeId,
  onApplyExportRequest,
}: Props) {
  const [isManualRegistrationOpen, setIsManualRegistrationOpen] = useState(false);

  return (
    <div className="form-card forwarder-workspace-form">
      <div className="trade-section-header">
        <div className="trade-section-title">
          <FileSignature size={20} className="text-primary" />
          <h2 className="card-title">1. 운송 의뢰 접수 + AI 서류 분석</h2>
        </div>
        {!readOnly && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsManualRegistrationOpen((open) => !open)}
            aria-expanded={isManualRegistrationOpen}
          >
            {isManualRegistrationOpen ? <X size={16} /> : <Plus size={16} />}
            {isManualRegistrationOpen ? '직접 등록 닫기' : '직접 등록'}
          </button>
        )}
      </div>

      {showRequestInbox && onApplyExportRequest && !readOnly && (
        <ForwarderExportRequestInbox
          onApply={onApplyExportRequest}
          appliedTradeId={appliedRequestTradeId ?? null}
        />
      )}

      {isManualRegistrationOpen && !readOnly && (
        <details className="form-section" open>
          <summary className="form-section-summary">직접 의뢰 등록 <span className="form-section-hint">외부에서 받은 의뢰 서류 업로드</span></summary>
          <p className="forwarder-step-description">
            이메일, 메신저 등 외부에서 받은 화주의 수출 의뢰 서류를 업로드해 주세요.
            업로드한 문서는 AI가 분석하여 화주·수하인·화물정보를 자동 입력합니다.
          </p>
          <TradeAttachmentUploader
            userId={userId}
            scopeId={attachmentScopeId}
            attachments={attachments}
            onChange={onAttachmentsChange}
            onApplyAnalysis={onApplyAnalysis}
          />
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsManualRegistrationOpen(false)}>
              <X size={16} /> 닫기
            </button>
          </div>
        </details>
      )}

      <fieldset className="workspace-readonly-fieldset" disabled={readOnly}>
        <details className="form-section" open>
          <summary className="form-section-summary">화주 운송의뢰 정보 <span className="form-section-hint">업로드 문서에서 자동입력</span></summary>
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

        <details className="form-section" open>
          <summary className="form-section-summary">화물명세 <span className="form-section-hint">업로드 문서에서 자동입력 · 다품목 지원</span></summary>
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
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onResetTrade}>
            <RotateCcw size={16} /> 초기화
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onNext}>
            다음: Booking <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
