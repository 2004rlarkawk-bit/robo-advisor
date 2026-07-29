import { FileSignature, RotateCcw } from 'lucide-react';
import { DISCHARGE_PORT_OPTIONS, LOAD_PORT_OPTIONS } from '../constants/ports';
import type { BookingStatus, ContainerSize, NumericInput, PersistedTradeStatus } from '../types';
import {
  isBookingNumberRequired,
  isEtaBeforeEtd,
  type ForwarderFormState,
} from '../utils/forwarderForm';
import type { TradeAttachment } from '../types/tradeFormData';
import TradeAttachmentUploader from './TradeAttachmentUploader';

interface Props {
  state: ForwarderFormState;
  onChange: (state: ForwarderFormState) => void;
  status: PersistedTradeStatus | null;
  busy: boolean;
  onSave: () => Promise<void>;
  onSubmit: () => Promise<void>;
  onReset: () => void;
  userId: string;
  attachmentScopeId: string;
  attachments: TradeAttachment[];
  onAttachmentsChange: (attachments: TradeAttachment[]) => void;
}

const BOOKING_STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: 'requested', label: '요청' },
  { value: 'confirmed', label: '확정' },
  { value: 'cancelled', label: '취소' },
];
const CONTAINER_SIZE_OPTIONS: ContainerSize[] = ['20GP', '40GP', '40HC', '45HC'];

function numericValue(value: string): NumericInput {
  return value === '' ? '' : Number(value);
}

export default function ForwarderWorkspaceForm({
  state,
  onChange,
  status,
  busy,
  onSave,
  onSubmit,
  onReset,
  userId,
  attachmentScopeId,
  attachments,
  onAttachmentsChange,
}: Props) {
  const patch = (values: Partial<ForwarderFormState>) => onChange({ ...state, ...values });
  const bookingNumberMissing = isBookingNumberRequired(state);
  const invalidSchedule = isEtaBeforeEtd(state.departureDate, state.arrivalDate);

  return (
    <div className="form-card forwarder-workspace-form">
      <div className="trade-section-header">
        <div className="trade-section-title">
          <FileSignature size={20} className="text-primary" />
          <h2 className="card-title">포워더 선적 및 부킹 정보 입력</h2>
        </div>
      </div>

      {/* 2026-07-23 편의성 업그레이드: 포워더용 선적 및 부킹 입력 폼 추가 */}
      <details className="form-section" open>
        <summary className="form-section-summary">1. 원천서류 업로드</summary>
        <TradeAttachmentUploader
          userId={userId}
          scopeId={attachmentScopeId}
          attachments={attachments}
          onChange={onAttachmentsChange}
        />
      </details>

      <details className="form-section" open>
        <summary className="form-section-summary">2. 선적의뢰 S/R 정보</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Shipper 회사명</label><input className="form-input" value={state.companyName} onChange={(e) => patch({ companyName: e.target.value })} placeholder="ABC Trading Co., Ltd." /></div>
          <div className="form-group"><label className="form-label">Shipper 영문 주소</label><input className="form-input" value={state.companyAddress} onChange={(e) => patch({ companyAddress: e.target.value })} placeholder="123 Teheran-ro, Gangnam-gu, Seoul, South Korea" /></div>
          <div className="form-group"><label className="form-label">Consignee 회사명</label><input className="form-input" value={state.partnerName} onChange={(e) => patch({ partnerName: e.target.value })} placeholder="Global Import LLC" /></div>
          <div className="form-group"><label className="form-label">Consignee 영문 주소</label><input className="form-input" value={state.partnerAddress} onChange={(e) => patch({ partnerAddress: e.target.value })} placeholder="250 Market Street, Los Angeles, CA, United States" /></div>
          <div className="form-group"><label className="form-label">수출신고필증번호</label><input className="form-input" value={state.exportDeclarationNo} onChange={(e) => patch({ exportDeclarationNo: e.target.value })} /></div>
        </div>
      </details>

      <details className="form-section" open>
        <summary className="form-section-summary">3. 선복예약 및 스케줄</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Carrier</label><input className="form-input" value={state.carrier} onChange={(e) => patch({ carrier: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Vessel</label><input className="form-input" value={state.vesselOrFlight} onChange={(e) => patch({ vesselOrFlight: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Voyage No.</label><input className="form-input" value={state.voyageNo} onChange={(e) => patch({ voyageNo: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">POL</label><select className="form-input" value={state.loadPort} onChange={(e) => patch({ loadPort: e.target.value })}><option value="">선적항을 선택하세요</option>{LOAD_PORT_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}</select></div>
          <div className="form-group"><label className="form-label">POD</label><select className="form-input" value={state.dischargePort} onChange={(e) => patch({ dischargePort: e.target.value })}><option value="">도착항을 선택하세요</option>{DISCHARGE_PORT_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}</select></div>
          <div className="form-group"><label className="form-label">ETD</label><input type="date" className="form-input" value={state.departureDate} onChange={(e) => patch({ departureDate: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">ETA</label><input type="date" className="form-input" value={state.arrivalDate} onChange={(e) => patch({ arrivalDate: e.target.value })} /></div>
        </div>
        {invalidSchedule && <div className="form-message error" role="alert">ETA는 ETD보다 빠를 수 없습니다.</div>}
      </details>

      <details className="form-section" open>
        <summary className="form-section-summary">4. 부킹 정보</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">부킹 상태</label><select className="form-input" value={state.bookingStatus} onChange={(e) => patch({ bookingStatus: e.target.value as BookingStatus })}>{BOOKING_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Booking No. {state.bookingStatus === 'confirmed' ? <b>*</b> : state.bookingStatus === 'requested' ? '(선택)' : ''}</label><input className="form-input" value={state.bookingNo} required={state.bookingStatus === 'confirmed'} aria-invalid={bookingNumberMissing} onChange={(e) => patch({ bookingNo: e.target.value })} /></div>
        </div>
        {bookingNumberMissing && <div className="form-message error" role="alert">부킹 확정 시 Booking No.는 필수입니다.</div>}
        {state.bookingStatus === 'cancelled' && <div className="form-message info" role="status">취소된 부킹입니다. 입력값은 삭제되지 않습니다.</div>}
      </details>

      <details className="form-section" open>
        <summary className="form-section-summary">5. B/L 발급 정보</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Notify Party</label><input className="form-input" value={state.notifyPartyName} onChange={(e) => patch({ notifyPartyName: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">적재 방식</label><select className="form-input" value={state.loadingMode} onChange={(e) => patch({ loadingMode: e.target.value as ForwarderFormState['loadingMode'] })}><option value="FCL">FCL</option><option value="LCL">LCL</option></select></div>
          {state.loadingMode === 'FCL' && (
            <>
              <div className="form-group"><label className="form-label">컨테이너 규격</label><select className="form-input" value={state.containerSize} onChange={(e) => patch({ containerSize: e.target.value as ContainerSize })}>{CONTAINER_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></div>
              <div className="form-group"><label className="form-label">컨테이너 수량</label><input type="number" min="0" className="form-input" value={state.containerQuantity} onChange={(e) => patch({ containerQuantity: numericValue(e.target.value) })} /></div>
            </>
          )}
          <div className="form-group"><label className="form-label">컨테이너 번호 (선택)</label><input className="form-input" value={state.containerNo} onChange={(e) => patch({ containerNo: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Seal 번호 (선택)</label><input className="form-input" value={state.sealNo} onChange={(e) => patch({ sealNo: e.target.value })} /></div>
        </div>
      </details>

      <details className="form-section" open>
        <summary className="form-section-summary">6. 화물명세</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Description of Goods</label><input className="form-input" value={state.itemName} onChange={(e) => patch({ itemName: e.target.value })} placeholder="Women's 100% cotton T-shirts, black" /></div>
          <div className="form-group"><label className="form-label">Number of Packages</label><input type="number" min="0" className="form-input" value={state.packageCount} onChange={(e) => patch({ packageCount: numericValue(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">Kind of Packages</label><input className="form-input" value={state.packageType} onChange={(e) => patch({ packageType: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Gross Weight (kg)</label><input type="number" min="0" step="any" className="form-input" value={state.grossWeight} onChange={(e) => patch({ grossWeight: numericValue(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">Measurement CBM</label><input className="form-input" value={state.measurement} onChange={(e) => patch({ measurement: e.target.value })} /></div>
        </div>
      </details>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onReset}><RotateCcw size={16} /> 초기화</button>
        <button type="button" className="btn btn-secondary" disabled={busy || status === 'submitted' || bookingNumberMissing || invalidSchedule} onClick={() => void onSave()}>
          {status === 'generated' ? '선적·부킹 정보 다시 저장' : '선적·부킹 정보 저장'}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || status !== 'generated' || bookingNumberMissing || invalidSchedule} onClick={() => void onSubmit()}>
          {status === 'submitted' ? '전송 완료' : '전체 문서 전송'}
        </button>
      </div>
    </div>
  );
}
