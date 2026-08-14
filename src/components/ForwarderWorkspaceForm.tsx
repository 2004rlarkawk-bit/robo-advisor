import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Eye, FileSignature, RefreshCw, RotateCcw } from 'lucide-react';
import {
  EXPORT_POD_OPTIONS,
  EXPORT_POL_OPTIONS,
  OTHER_DOMESTIC_PORT_VALUE,
  OTHER_FOREIGN_PORT_VALUE,
  normalizeExportPortValue,
} from '../constants/ports';
import type { ContainerSize, NumericInput, PersistedTradeStatus } from '../types';
import {
  isEtaBeforeEtd,
  type ForwarderFormState,
} from '../utils/forwarderForm';
import type { TradeAttachment } from '../types/tradeFormData';
import TradeAttachmentUploader from './TradeAttachmentUploader';
import DocumentManagerReadOnlyAction from './DocumentManagerReadOnlyAction';
import { mergeForwarderAutoFill } from '../services/forwarderDocumentAnalysisService';

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
  profileDefaults?: Partial<ForwarderFormState>;
  readOnly?: boolean;
  onClose?: () => void;
  currentStep?: number;
  billOfLadingHtml?: string;
  generationError?: string;
  onPreviousStep?: () => void;
  onViewBillOfLading?: () => void;
  onDownloadBillOfLading?: () => void;
  onRegenerateBillOfLading?: () => Promise<void>;
}

const CONTAINER_SIZE_OPTIONS: ContainerSize[] = ['20GP', '40GP', '40HC'];

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
  profileDefaults = {},
  readOnly = false,
  onClose,
  currentStep = 1,
  billOfLadingHtml = '',
  generationError = '',
  onPreviousStep,
  onViewBillOfLading,
  onDownloadBillOfLading,
  onRegenerateBillOfLading,
}: Props) {
  const manuallyEditedFieldsRef = useRef(new Set<keyof ForwarderFormState>());
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
    manuallyEditedFieldsRef.current.clear();
    setForceCustomLoadPort(false);
    setForceCustomDischargePort(false);
  }, [attachmentScopeId]);
  useEffect(() => {
    if (isKnownLoadPort) setForceCustomLoadPort(false);
    else if (state.loadPort) setForceCustomLoadPort(true);
  }, [isKnownLoadPort, state.loadPort]);
  useEffect(() => {
    if (isKnownDischargePort) setForceCustomDischargePort(false);
    else if (state.dischargePort) setForceCustomDischargePort(true);
  }, [isKnownDischargePort, state.dischargePort]);
  const patch = (values: Partial<ForwarderFormState>) => {
    (Object.keys(values) as Array<keyof ForwarderFormState>).forEach((field) => {
      manuallyEditedFieldsRef.current.add(field);
    });
    onChange({ ...state, ...values });
  };
  const patchCargoItem = (
    index: number,
    values: Partial<ForwarderFormState['cargoItems'][number]>,
  ) => {
    manuallyEditedFieldsRef.current.add('cargoItems');
    const cargoItems = state.cargoItems.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...values } : item);
    const first = cargoItems[0];
    onChange({
      ...state,
      cargoItems,
      itemName: first?.descriptionOfGoods ?? '',
      packageCount: first?.numberOfPackages ?? '',
      packageType: first?.kindOfPackages ?? '',
      grossWeight: first?.grossWeightKg ?? '',
      measurement: first?.measurementCbm ?? '',
      shippingMarks: first?.marksAndNumbers ?? '',
    });
  };
  const invalidSchedule = isEtaBeforeEtd(state.departureDate, state.arrivalDate);
  const bookingRegistered = state.bookingNo.trim().length > 0;

  if (currentStep === 2) {
    const hasBillOfLading = Boolean(billOfLadingHtml);
    const billOfLadingReady = hasBillOfLading && !generationError;
    return (
      <div className="form-card forwarder-workspace-form forwarder-bl-review">
        <div className="trade-section-header">
          <div className="trade-section-title">
            <FileSignature size={20} className="text-primary" />
            <div>
              <h2 className="card-title">2. B/L 생성 및 확인</h2>
              <p className="forwarder-step-description">생성된 B/L 초안을 확인한 뒤 전체 문서를 전송하세요.</p>
            </div>
          </div>
        </div>

        <div className={`forwarder-generated-document-card ${billOfLadingReady ? 'is-complete' : 'is-failed'}`}>
          <div className="forwarder-generated-document-summary">
            <div className="forwarder-generated-document-icon" aria-hidden="true">B/L</div>
            <div>
              <strong>선하증권 (B/L)</strong>
              <span className={`forwarder-generated-document-status ${billOfLadingReady ? 'is-complete' : 'is-failed'}`}>
                {billOfLadingReady ? '생성 완료' : generationError ? '생성 실패' : '생성 대기'}
              </span>
              {!billOfLadingReady && (
                <p role={generationError ? 'alert' : 'status'}>
                  {generationError || '생성된 B/L이 없습니다.'}
                </p>
              )}
            </div>
          </div>
          {billOfLadingReady ? (
            <div className="forwarder-bl-document-actions">
              <button type="button" className="btn btn-secondary" onClick={onViewBillOfLading}><Eye size={16} /> 보기</button>
              <button type="button" className="btn btn-secondary" onClick={onDownloadBillOfLading}><Download size={16} /> 다운로드</button>
            </div>
          ) : !readOnly ? (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onRegenerateBillOfLading?.()}><RefreshCw size={16} /> 재생성</button>
          ) : null}
        </div>

        {readOnly && onClose ? <DocumentManagerReadOnlyAction onClose={onClose} /> : (
          <div className="form-actions forwarder-bl-review-actions">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onPreviousStep}><ArrowLeft size={16} /> 이전 단계</button>
            <button type="button" className="btn btn-primary" disabled={busy || !billOfLadingReady || status === 'submitted'} onClick={() => void onSubmit()}>
              {status === 'submitted' ? '전송 완료' : '전체 문서 전송'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="form-card forwarder-workspace-form">
      <div className="trade-section-header">
        <div className="trade-section-title">
          <FileSignature size={20} className="text-primary" />
          <h2 className="card-title">1. B/L 생성 정보 입력</h2>
        </div>
      </div>

      <fieldset className="workspace-readonly-fieldset" disabled={readOnly}>
      {/* 2026-07-23 편의성 업그레이드: 포워더용 선적 및 부킹 입력 폼 추가 */}
      <details className="form-section" open>
        <summary className="form-section-summary">원천서류 업로드</summary>
        <TradeAttachmentUploader
          userId={userId}
          scopeId={attachmentScopeId}
          attachments={attachments}
          onChange={onAttachmentsChange}
          onApplyAnalysis={(values, sourceFiles) => {
            const merged = mergeForwarderAutoFill(
              state,
              values,
              sourceFiles,
              profileDefaults,
              manuallyEditedFieldsRef.current,
            );
            onChange(merged.state);
            return merged;
          }}
        />
      </details>

      <details className="form-section" open>
        <summary className="form-section-summary">1. 화주 운송의뢰 정보 <span className="form-section-hint">업로드 문서에서 자동입력</span></summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Shipper 회사명</label><input className="form-input" value={state.companyName} onChange={(e) => patch({ companyName: e.target.value })} placeholder="ABC Trading Co., Ltd." /></div>
          <div className="form-group"><label className="form-label">Shipper 영문 주소</label><input className="form-input" value={state.companyAddress} onChange={(e) => patch({ companyAddress: e.target.value })} placeholder="123 Teheran-ro, Gangnam-gu, Seoul, South Korea" /></div>
          <div className="form-group"><label className="form-label">Consignee 회사명</label><input className="form-input" value={state.partnerName} onChange={(e) => patch({ partnerName: e.target.value })} placeholder="Global Import LLC" /></div>
          <div className="form-group"><label className="form-label">Consignee 영문 주소</label><input className="form-input" value={state.partnerAddress} onChange={(e) => patch({ partnerAddress: e.target.value })} placeholder="250 Market Street, Los Angeles, CA, United States" /></div>
          <div className="form-group"><label className="form-label">Notify Party (선택)</label><input className="form-input" value={state.notifyPartyName} onChange={(e) => patch({ notifyPartyName: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Invoice No. (선택)</label><input className="form-input" value={state.invoiceNo} onChange={(e) => patch({ invoiceNo: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">수출신고번호 (선택)</label><input className="form-input" value={state.exportDeclarationNo} onChange={(e) => patch({ exportDeclarationNo: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Incoterms</label><input className="form-input" value={state.incoterms} onChange={(e) => patch({ incoterms: e.target.value.toUpperCase() as ForwarderFormState['incoterms'] })} placeholder="FOB" /></div>
          <div className="form-group"><label className="form-label">희망 출항일</label><input type="date" className="form-input" value={state.requestedDepartureDate} onChange={(e) => patch({ requestedDepartureDate: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">운송방식</label><select className="form-input" value={state.loadingMode} onChange={(e) => patch({ loadingMode: e.target.value as ForwarderFormState['loadingMode'] })}><option value="">미정</option><option value="FCL">FCL</option><option value="LCL">LCL</option></select></div>
        </div>
      </details>

      <details className="form-section" open>
        <summary className="form-section-summary">2. 선복예약 및 스케줄 <span className="form-section-hint">부킹 확정 후 입력</span></summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Carrier</label><input className="form-input" value={state.carrier} onChange={(e) => patch({ carrier: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Booking No. (선택)</label><input className="form-input" value={state.bookingNo} onChange={(e) => patch({ bookingNo: e.target.value, bookingStatus: e.target.value.trim() ? 'confirmed' : 'requested' })} /></div>
          <div className="form-group"><label className="form-label">Vessel</label><input className="form-input" value={state.vesselOrFlight} onChange={(e) => patch({ vesselOrFlight: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Voyage No.</label><input className="form-input" value={state.voyageNo} onChange={(e) => patch({ voyageNo: e.target.value })} /></div>
          <div className="form-group" data-field="loadPort"><label className="form-label">POL</label><select className="form-input" value={loadPortSelection} onChange={(e) => { if (e.target.value === OTHER_DOMESTIC_PORT_VALUE) { setForceCustomLoadPort(true); patch({ loadPort: '' }); } else { setForceCustomLoadPort(false); patch({ loadPort: e.target.value }); } }}><option value="">선적항을 선택하세요</option>{EXPORT_POL_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}<option value={OTHER_DOMESTIC_PORT_VALUE}>기타 국내항</option></select>{loadPortSelection === OTHER_DOMESTIC_PORT_VALUE && <input className="form-input shipper-custom-port-input" aria-label="기타 국내항 직접 입력" value={state.loadPort} onChange={(e) => patch({ loadPort: e.target.value })} placeholder="기타 국내항 직접 입력" />}</div>
          <div className="form-group" data-field="dischargePort"><label className="form-label">POD</label><select className="form-input" value={dischargePortSelection} onChange={(e) => { if (e.target.value === OTHER_FOREIGN_PORT_VALUE) { setForceCustomDischargePort(true); patch({ dischargePort: '' }); } else { setForceCustomDischargePort(false); patch({ dischargePort: e.target.value }); } }}><option value="">도착항을 선택하세요</option>{EXPORT_POD_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}<option value={OTHER_FOREIGN_PORT_VALUE}>기타 해외항</option></select>{dischargePortSelection === OTHER_FOREIGN_PORT_VALUE && <input className="form-input shipper-custom-port-input" aria-label="기타 해외항 직접 입력" value={state.dischargePort} onChange={(e) => patch({ dischargePort: e.target.value })} placeholder="기타 해외항 직접 입력" />}</div>
          <div className="form-group"><label className="form-label">ETD</label><input type="date" className="form-input" value={state.departureDate} onChange={(e) => patch({ departureDate: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">ETA</label><input type="date" className="form-input" value={state.arrivalDate} onChange={(e) => patch({ arrivalDate: e.target.value })} /></div>
        </div>
        <div className={`form-message ${bookingRegistered ? 'info' : ''}`} role="status">{bookingRegistered ? '부킹 등록 완료' : '부킹 미등록'}</div>
        {invalidSchedule && <div className="form-message error" role="alert">ETA는 ETD보다 빠를 수 없습니다.</div>}
      </details>

      <details className="form-section" open>
        <summary className="form-section-summary">3. 컨테이너 정보</summary>
        {state.loadingMode === 'FCL' ? <div className="form-grid">
          {state.loadingMode === 'FCL' && (
            <>
              <div className="form-group"><label className="form-label">컨테이너 규격</label><select className="form-input" value={state.containerSize} onChange={(e) => patch({ containerSize: e.target.value as ContainerSize })}>{!CONTAINER_SIZE_OPTIONS.includes(state.containerSize) && <option value={state.containerSize}>{state.containerSize} (기존값)</option>}{CONTAINER_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></div>
              <div className="form-group"><label className="form-label">컨테이너 수량</label><input type="number" min="0" className="form-input" value={state.containerQuantity} onChange={(e) => patch({ containerQuantity: numericValue(e.target.value) })} /></div>
            </>
          )}
          <div className="form-group"><label className="form-label">컨테이너 번호 (선택)</label><input className="form-input" value={state.containerNo} onChange={(e) => patch({ containerNo: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Seal 번호 (선택)</label><input className="form-input" value={state.sealNo} onChange={(e) => patch({ sealNo: e.target.value })} /></div>
        </div> : <div className="form-message info" role="status">{state.loadingMode === 'LCL' ? 'LCL 운송은 컨테이너 정보를 입력하지 않아도 됩니다.' : '운송방식이 정해지면 FCL 컨테이너 정보를 입력할 수 있습니다.'}</div>}
      </details>

      <details className="form-section" open>
        <summary className="form-section-summary">4. 화물명세 <span className="form-section-hint">업로드 문서에서 자동입력</span></summary>
        <div className="forwarder-cargo-items">
          {state.cargoItems.map((item, index) => (
            <details className="forwarder-cargo-item" open key={item.id || `cargo-${index + 1}`}>
              <summary>
                <strong>{item.descriptionOfGoods || '품명 미입력'}</strong>
              </summary>
              <div className="form-grid">
                <div className="form-group"><label className="form-label" htmlFor={`cargo-description-${index}`}>Description of Goods</label><input id={`cargo-description-${index}`} className="form-input" value={item.descriptionOfGoods} onChange={(e) => patchCargoItem(index, { descriptionOfGoods: e.target.value })} placeholder="Women's 100% cotton T-shirts, black" /></div>
                <div className="form-group"><label className="form-label" htmlFor={`cargo-packages-${index}`}>Number of Packages</label><input id={`cargo-packages-${index}`} type="number" min="0" className="form-input" value={item.numberOfPackages} onChange={(e) => patchCargoItem(index, { numberOfPackages: numericValue(e.target.value) })} /></div>
                <div className="form-group"><label className="form-label" htmlFor={`cargo-package-type-${index}`}>Kind of Packages</label><input id={`cargo-package-type-${index}`} className="form-input" value={item.kindOfPackages} onChange={(e) => patchCargoItem(index, { kindOfPackages: e.target.value })} /></div>
                <div className="form-group"><label className="form-label" htmlFor={`cargo-weight-${index}`}>Gross Weight (kg)</label><input id={`cargo-weight-${index}`} type="number" min="0" step="any" className="form-input" value={item.grossWeightKg} onChange={(e) => patchCargoItem(index, { grossWeightKg: numericValue(e.target.value) })} /></div>
                <div className="form-group"><label className="form-label" htmlFor={`cargo-measurement-${index}`}>Measurement CBM</label><input id={`cargo-measurement-${index}`} className="form-input" value={item.measurementCbm} onChange={(e) => patchCargoItem(index, { measurementCbm: e.target.value })} /></div>
                <div className="form-group"><label className="form-label" htmlFor={`cargo-marks-${index}`}>Marks &amp; Numbers (선택)</label><input id={`cargo-marks-${index}`} className="form-input" value={item.marksAndNumbers} onChange={(e) => patchCargoItem(index, { marksAndNumbers: e.target.value })} /></div>
              </div>
            </details>
          ))}
        </div>
      </details>
      </fieldset>

      {readOnly && onClose ? <DocumentManagerReadOnlyAction onClose={onClose} /> : (
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { manuallyEditedFieldsRef.current.clear(); onReset(); }}><RotateCcw size={16} /> 초기화</button>
          <button type="button" className="btn btn-primary" disabled={busy || status === 'submitted' || invalidSchedule} onClick={() => void onSave()}>
            정보 저장 및 B/L 생성
          </button>
        </div>
      )}
    </div>
  );
}
