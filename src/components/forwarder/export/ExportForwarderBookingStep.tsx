import { useEffect, useState } from 'react';
import { CheckCircle2, PenLine } from 'lucide-react';
import PortLocodeHint from '../../trade/PortLocodeHint';
import ForwarderDocumentSlot from './ForwarderDocumentSlot';
import {
  EXPORT_POD_OPTIONS,
  EXPORT_POL_OPTIONS,
  OTHER_DOMESTIC_PORT_VALUE,
  OTHER_FOREIGN_PORT_VALUE,
  normalizeExportPortValue,
} from '../../../constants/ports';
import type { ContainerSize, FreightTerms, NumericInput } from '../../../types';
import type { ExportBookingDetails } from '../../../types/exportForwarderCase';
import type { TradeAttachment } from '../../../types/tradeFormData';
import { FREIGHT_TERMS_LABEL } from '../../../utils/freightTerms';
import { isBookingRegistered, isEtaBeforeEtd, missingBookingFields, type ForwarderFormState } from '../../../utils/forwarderForm';

interface Props {
  state: ForwarderFormState;
  patch: (values: Partial<ForwarderFormState>) => void;
  /** 외부에서 확정받은 부킹의 부가정보(마감일·운임조건·비고) */
  booking: ExportBookingDetails;
  onBookingChange: (values: Partial<ExportBookingDetails>) => void;
  userId: string;
  scopeId: string;
  attachments: TradeAttachment[];
  onAttachmentsChange: (attachments: TradeAttachment[]) => void;
  readOnly: boolean;
  busy: boolean;
  onSave: () => void;
}

const CONTAINER_SIZE_OPTIONS: ContainerSize[] = ['20GP', '40GP', '40HC'];

function numericValue(value: string): NumericInput {
  return value === '' ? '' : Number(value);
}

/**
 * STEP 2 — 선복 부킹.
 * PortAI가 선사에 예약을 보내는 화면이 아니다. 포워더가 선사 홈페이지·메일·전화로 확정한 부킹을
 * PortAI에 등록해 이후 단계(H/B/L 작성 등)에서 쓰게 하는 화면이다.
 */
export default function ExportForwarderBookingStep({
  state, patch, booking, onBookingChange, userId, scopeId, attachments, onAttachmentsChange, readOnly, busy, onSave,
}: Props) {
  const [forceCustomLoadPort, setForceCustomLoadPort] = useState(false);
  const [forceCustomDischargePort, setForceCustomDischargePort] = useState(false);
  const normalizedLoadPort = normalizeExportPortValue(state.loadPort);
  const normalizedDischargePort = normalizeExportPortValue(state.dischargePort);
  const isKnownLoadPort = EXPORT_POL_OPTIONS.some(({ value }) => value === normalizedLoadPort);
  const isKnownDischargePort = EXPORT_POD_OPTIONS.some(({ value }) => value === normalizedDischargePort);
  const loadPortSelection = forceCustomLoadPort || (state.loadPort && !isKnownLoadPort)
    ? OTHER_DOMESTIC_PORT_VALUE
    : normalizedLoadPort;
  const dischargePortSelection = forceCustomDischargePort || (state.dischargePort && !isKnownDischargePort)
    ? OTHER_FOREIGN_PORT_VALUE
    : normalizedDischargePort;
  useEffect(() => {
    if (isKnownLoadPort) setForceCustomLoadPort(false);
    else if (state.loadPort) setForceCustomLoadPort(true);
  }, [isKnownLoadPort, state.loadPort]);
  useEffect(() => {
    if (isKnownDischargePort) setForceCustomDischargePort(false);
    else if (state.dischargePort) setForceCustomDischargePort(true);
  }, [isKnownDischargePort, state.dischargePort]);

  const invalidSchedule = isEtaBeforeEtd(state.departureDate, state.arrivalDate);
  const bookingRegistered = isBookingRegistered(state);
  const missingFields = missingBookingFields(state);
  const cargoSummary = state.cargoItems.filter((item) => item.descriptionOfGoods.trim());

  return (
    <div className="form-card forwarder-workspace-form fwd-export-stage">
      <div className="trade-section-header fwd-export-step-heading">
        <div>
          <span className="fwd-section-kicker">02 · 선복</span>
          <h2 className="card-title">선복 부킹</h2>
        </div>
      </div>

      <details className="form-section fwd-export-content-card">
        <summary className="form-section-summary">의뢰 요약</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Shipper</label><input className="form-input" value={state.companyName} disabled readOnly /></div>
          <div className="form-group"><label className="form-label">Consignee</label><input className="form-input" value={state.partnerName} disabled readOnly /></div>
          <div className="form-group"><label className="form-label">Incoterms / 희망 출항일</label><input className="form-input" value={[state.incoterms, state.requestedDepartureDate].filter(Boolean).join(' · ') || '미입력'} disabled readOnly /></div>
        </div>
        {cargoSummary.length === 0 ? (
          <p className="form-message info" role="status">1단계에서 입력한 화물명세가 없습니다.</p>
        ) : (
          <div className="import-document-list">
            {cargoSummary.map((item, index) => (
              <div className="import-document-row" key={item.id || index}>
                <div className="import-document-content">
                  <strong className="import-document-type">{item.descriptionOfGoods}</strong>
                  <span className="import-document-meta">
                    {[
                      item.numberOfPackages !== '' ? `${item.numberOfPackages} ${item.kindOfPackages || 'PKGS'}` : '',
                      item.grossWeightKg !== '' ? `${item.grossWeightKg} KG` : '',
                      item.measurementCbm ? `${item.measurementCbm} CBM` : '',
                    ].filter(Boolean).join(' · ') || '수량·중량 미입력'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </details>

      <fieldset className="workspace-readonly-fieldset" disabled={readOnly}>
        <details className="form-section fwd-export-content-card fwd-export-accent-blue" open>
          <summary className="form-section-summary">부킹 정보</summary>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">Carrier / 선사</label><input className="form-input" value={state.carrier} onChange={(e) => patch({ carrier: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Booking No.</label><input className="form-input" value={state.bookingNo} onChange={(e) => patch({ bookingNo: e.target.value, bookingStatus: e.target.value.trim() ? 'confirmed' : 'requested' })} /></div>
            <div className="form-group"><label className="form-label">Vessel</label><input className="form-input" value={state.vesselOrFlight} onChange={(e) => patch({ vesselOrFlight: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Voyage No.</label><input className="form-input" value={state.voyageNo} onChange={(e) => patch({ voyageNo: e.target.value })} /></div>
            <div className="form-group" data-field="loadPort"><label className="form-label">POL</label><select className="form-input" value={loadPortSelection} onChange={(e) => { if (e.target.value === OTHER_DOMESTIC_PORT_VALUE) { setForceCustomLoadPort(true); patch({ loadPort: '' }); } else { setForceCustomLoadPort(false); patch({ loadPort: e.target.value }); } }}><option value="">선적항을 선택하세요</option>{EXPORT_POL_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}<option value={OTHER_DOMESTIC_PORT_VALUE}>기타 국내항</option></select>{loadPortSelection === OTHER_DOMESTIC_PORT_VALUE && <><input className="form-input shipper-custom-port-input" aria-label="기타 국내항 직접 입력" value={state.loadPort} onChange={(e) => patch({ loadPort: e.target.value })} placeholder="기타 국내항 직접 입력" /><PortLocodeHint value={state.loadPort} onApply={(value) => patch({ loadPort: value })} /></>}</div>
            <div className="form-group" data-field="dischargePort"><label className="form-label">POD</label><select className="form-input" value={dischargePortSelection} onChange={(e) => { if (e.target.value === OTHER_FOREIGN_PORT_VALUE) { setForceCustomDischargePort(true); patch({ dischargePort: '' }); } else { setForceCustomDischargePort(false); patch({ dischargePort: e.target.value }); } }}><option value="">도착항을 선택하세요</option>{EXPORT_POD_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}<option value={OTHER_FOREIGN_PORT_VALUE}>기타 해외항</option></select>{dischargePortSelection === OTHER_FOREIGN_PORT_VALUE && <><input className="form-input shipper-custom-port-input" aria-label="기타 해외항 직접 입력" value={state.dischargePort} onChange={(e) => patch({ dischargePort: e.target.value })} placeholder="기타 해외항 직접 입력" /><PortLocodeHint value={state.dischargePort} onApply={(value) => patch({ dischargePort: value })} /></>}</div>
            <div className="form-group"><label className="form-label">ETD</label><input type="date" className="form-input" value={state.departureDate} onChange={(e) => patch({ departureDate: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">ETA</label><input type="date" className="form-input" value={state.arrivalDate} onChange={(e) => patch({ arrivalDate: e.target.value })} /></div>
            <div className="form-group"><label className="form-label" htmlFor="booking-cargo-closing">Cargo Closing Date</label><input id="booking-cargo-closing" type="date" className="form-input" value={booking.cargoClosingDate ?? ''} onChange={(e) => onBookingChange({ cargoClosingDate: e.target.value })} /></div>
            <div className="form-group"><label className="form-label" htmlFor="booking-cy-closing">CY Closing Date <span className="optional-label">(있는 경우)</span></label><input id="booking-cy-closing" type="date" className="form-input" value={booking.cyClosingDate ?? ''} onChange={(e) => onBookingChange({ cyClosingDate: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">운송방식</label><select className="form-input" value={state.loadingMode} onChange={(e) => patch({ loadingMode: e.target.value as ForwarderFormState['loadingMode'] })}><option value="">미정</option><option value="FCL">FCL</option><option value="LCL">LCL</option></select></div>
            <div className="form-group">
              <label className="form-label" htmlFor="booking-freight-terms">Freight Terms</label>
              <select id="booking-freight-terms" className="form-input" value={booking.freightTerms ?? ''} onChange={(e) => onBookingChange({ freightTerms: e.target.value as FreightTerms })}>
                <option value="">선택하세요</option>
                <option value="PREPAID">{FREIGHT_TERMS_LABEL.PREPAID}</option>
                <option value="COLLECT">{FREIGHT_TERMS_LABEL.COLLECT}</option>
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label" htmlFor="booking-remarks">비고</label><textarea id="booking-remarks" className="form-input" rows={2} value={booking.remarks ?? ''} onChange={(e) => onBookingChange({ remarks: e.target.value })} placeholder="선사 안내사항, 반입지, 특이사항 등" /></div>
          <div className={`form-message ${bookingRegistered ? 'info' : ''}`} role="status">
            {bookingRegistered ? '부킹 완료' : '부킹 대기'}
            {!bookingRegistered && missingFields.length > 0 ? ` — ${missingFields.join(', ')}가 필요합니다.` : ''}
          </div>
          {invalidSchedule && <div className="form-message error" role="alert">ETA는 ETD보다 빠를 수 없습니다.</div>}
        </details>

        <details className="form-section fwd-export-content-card" open>
          <summary className="form-section-summary">컨테이너 정보</summary>
          {state.loadingMode === 'FCL' ? <div className="form-grid">
            <div className="form-group"><label className="form-label">컨테이너 규격</label><select className="form-input" value={state.containerSize} onChange={(e) => patch({ containerSize: e.target.value as ContainerSize })}>{!CONTAINER_SIZE_OPTIONS.includes(state.containerSize) && <option value={state.containerSize}>{state.containerSize} (기존값)</option>}{CONTAINER_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></div>
            <div className="form-group"><label className="form-label">컨테이너 수량</label><input type="number" min="0" className="form-input" value={state.containerQuantity} onChange={(e) => patch({ containerQuantity: numericValue(e.target.value) })} /></div>
            <div className="form-group"><label className="form-label">컨테이너 번호 (선택)</label><input className="form-input" value={state.containerNo} onChange={(e) => patch({ containerNo: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Seal 번호 (선택)</label><input className="form-input" value={state.sealNo} onChange={(e) => patch({ sealNo: e.target.value })} /></div>
          </div> : <div className="form-message info" role="status">{state.loadingMode === 'LCL' ? 'LCL 운송은 컨테이너 정보를 입력하지 않아도 됩니다.' : '운송방식이 정해지면 FCL 컨테이너 정보를 입력할 수 있습니다.'}</div>}
        </details>

        <details className="form-section fwd-export-booking-document" open>
          <summary className="form-section-summary">Booking Confirmation</summary>
          <ForwarderDocumentSlot
            label=""
            documentType="booking_confirmation"
            userId={userId}
            scopeId={scopeId}
            attachments={attachments}
            onAttachmentsChange={onAttachmentsChange}
            readOnly={readOnly}
          />
        </details>
      </fieldset>

      {!readOnly && (
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || invalidSchedule || missingFields.length > 0}
            title={missingFields.length > 0 ? `${missingFields.join(', ')}를 입력해야 부킹 완료 처리를 할 수 있습니다.` : undefined}
            onClick={onSave}
          >
            {bookingRegistered ? <><PenLine size={16} /> 부킹 정보 수정 저장</> : <><CheckCircle2 size={16} /> 부킹 확정 정보 등록</>}
          </button>
        </div>
      )}
    </div>
  );
}
