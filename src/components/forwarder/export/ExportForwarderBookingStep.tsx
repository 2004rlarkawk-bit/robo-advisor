import { useEffect, useState } from 'react';
import { ArrowRight, Ship } from 'lucide-react';
import PortLocodeHint from '../../trade/PortLocodeHint';
import {
  EXPORT_POD_OPTIONS,
  EXPORT_POL_OPTIONS,
  OTHER_DOMESTIC_PORT_VALUE,
  OTHER_FOREIGN_PORT_VALUE,
  normalizeExportPortValue,
} from '../../../constants/ports';
import type { ContainerSize, NumericInput } from '../../../types';
import { isBookingRegistered, isEtaBeforeEtd, type ForwarderFormState } from '../../../utils/forwarderForm';

interface Props {
  state: ForwarderFormState;
  patch: (values: Partial<ForwarderFormState>) => void;
  readOnly: boolean;
  busy: boolean;
  onSave: () => void;
}

const CONTAINER_SIZE_OPTIONS: ContainerSize[] = ['20GP', '40GP', '40HC'];

function numericValue(value: string): NumericInput {
  return value === '' ? '' : Number(value);
}

/** STEP 2 — 선적 Booking. 화물정보 요약(읽기전용) + 포워더가 확보한 실제 선사 부킹 결과 기록. */
export default function ExportForwarderBookingStep({ state, patch, readOnly, busy, onSave }: Props) {
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
  const cargoSummary = state.cargoItems.filter((item) => item.descriptionOfGoods.trim());

  return (
    <div className="form-card forwarder-workspace-form">
      <div className="trade-section-header">
        <div className="trade-section-title">
          <Ship size={20} className="text-primary" />
          <div>
            <h2 className="card-title">2. 선적 Booking</h2>
            <p className="forwarder-step-description">외부 선사·부킹 시스템에서 확보한 결과를 PortAI에 기록합니다. PortAI가 선사 부킹을 대행하지 않습니다.</p>
          </div>
        </div>
      </div>

      <details className="form-section" open>
        <summary className="form-section-summary">화물정보 Summary <span className="form-section-hint">1단계 입력값 — 여기서는 참고만</span></summary>
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
        <details className="form-section" open>
          <summary className="form-section-summary">Booking 입력</summary>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">Carrier / 선사</label><input className="form-input" value={state.carrier} onChange={(e) => patch({ carrier: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Booking No.</label><input className="form-input" value={state.bookingNo} onChange={(e) => patch({ bookingNo: e.target.value, bookingStatus: e.target.value.trim() ? 'confirmed' : 'requested' })} /></div>
            <div className="form-group"><label className="form-label">Vessel</label><input className="form-input" value={state.vesselOrFlight} onChange={(e) => patch({ vesselOrFlight: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Voyage No.</label><input className="form-input" value={state.voyageNo} onChange={(e) => patch({ voyageNo: e.target.value })} /></div>
            <div className="form-group" data-field="loadPort"><label className="form-label">POL</label><select className="form-input" value={loadPortSelection} onChange={(e) => { if (e.target.value === OTHER_DOMESTIC_PORT_VALUE) { setForceCustomLoadPort(true); patch({ loadPort: '' }); } else { setForceCustomLoadPort(false); patch({ loadPort: e.target.value }); } }}><option value="">선적항을 선택하세요</option>{EXPORT_POL_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}<option value={OTHER_DOMESTIC_PORT_VALUE}>기타 국내항</option></select>{loadPortSelection === OTHER_DOMESTIC_PORT_VALUE && <><input className="form-input shipper-custom-port-input" aria-label="기타 국내항 직접 입력" value={state.loadPort} onChange={(e) => patch({ loadPort: e.target.value })} placeholder="기타 국내항 직접 입력" /><PortLocodeHint value={state.loadPort} onApply={(value) => patch({ loadPort: value })} /></>}</div>
            <div className="form-group" data-field="dischargePort"><label className="form-label">POD</label><select className="form-input" value={dischargePortSelection} onChange={(e) => { if (e.target.value === OTHER_FOREIGN_PORT_VALUE) { setForceCustomDischargePort(true); patch({ dischargePort: '' }); } else { setForceCustomDischargePort(false); patch({ dischargePort: e.target.value }); } }}><option value="">도착항을 선택하세요</option>{EXPORT_POD_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}<option value={OTHER_FOREIGN_PORT_VALUE}>기타 해외항</option></select>{dischargePortSelection === OTHER_FOREIGN_PORT_VALUE && <><input className="form-input shipper-custom-port-input" aria-label="기타 해외항 직접 입력" value={state.dischargePort} onChange={(e) => patch({ dischargePort: e.target.value })} placeholder="기타 해외항 직접 입력" /><PortLocodeHint value={state.dischargePort} onApply={(value) => patch({ dischargePort: value })} /></>}</div>
            <div className="form-group"><label className="form-label">ETD</label><input type="date" className="form-input" value={state.departureDate} onChange={(e) => patch({ departureDate: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">ETA</label><input type="date" className="form-input" value={state.arrivalDate} onChange={(e) => patch({ arrivalDate: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">운송방식</label><select className="form-input" value={state.loadingMode} onChange={(e) => patch({ loadingMode: e.target.value as ForwarderFormState['loadingMode'] })}><option value="">미정</option><option value="FCL">FCL</option><option value="LCL">LCL</option></select></div>
          </div>
          <div className={`form-message ${bookingRegistered ? 'info' : ''}`} role="status">{bookingRegistered ? 'Booking 등록 완료' : 'Booking 미등록'}</div>
          {invalidSchedule && <div className="form-message error" role="alert">ETA는 ETD보다 빠를 수 없습니다.</div>}
        </details>

        <details className="form-section" open>
          <summary className="form-section-summary">컨테이너 정보</summary>
          {state.loadingMode === 'FCL' ? <div className="form-grid">
            <div className="form-group"><label className="form-label">컨테이너 규격</label><select className="form-input" value={state.containerSize} onChange={(e) => patch({ containerSize: e.target.value as ContainerSize })}>{!CONTAINER_SIZE_OPTIONS.includes(state.containerSize) && <option value={state.containerSize}>{state.containerSize} (기존값)</option>}{CONTAINER_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></div>
            <div className="form-group"><label className="form-label">컨테이너 수량</label><input type="number" min="0" className="form-input" value={state.containerQuantity} onChange={(e) => patch({ containerQuantity: numericValue(e.target.value) })} /></div>
            <div className="form-group"><label className="form-label">컨테이너 번호 (선택)</label><input className="form-input" value={state.containerNo} onChange={(e) => patch({ containerNo: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Seal 번호 (선택)</label><input className="form-input" value={state.sealNo} onChange={(e) => patch({ sealNo: e.target.value })} /></div>
          </div> : <div className="form-message info" role="status">{state.loadingMode === 'LCL' ? 'LCL 운송은 컨테이너 정보를 입력하지 않아도 됩니다.' : '운송방식이 정해지면 FCL 컨테이너 정보를 입력할 수 있습니다.'}</div>}
        </details>
      </fieldset>

      {!readOnly && (
        <div className="form-actions">
          <button type="button" className="btn btn-primary" disabled={busy || invalidSchedule} onClick={onSave}>
            Booking 정보 저장 <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
