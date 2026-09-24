import { useEffect, useRef } from 'react';
import type { BillOfLadingData, PersistedTradeStatus, SavedTrade } from '../types';
import { isBookingRegistered, type ForwarderFormState } from '../utils/forwarderForm';
import type { TradeAttachment } from '../types/tradeFormData';
import type {
  ExportProgressStageKey,
  ExportProgressStatus,
  ExportBookingDetails,
} from '../types/exportForwarderCase';
import { ArrowLeft } from 'lucide-react';
import DocumentManagerReadOnlyAction from './DocumentManagerReadOnlyAction';
import ImportStepIndicator from './import/ImportStepIndicator';
import type { ForwarderExportRequest } from '../services/forwarderExportRequestService';
import { mergeForwarderAutoFill } from '../services/forwarderDocumentAnalysisService';
import ExportForwarderInboxView from './forwarder/export/ExportForwarderInboxView';
import ExportForwarderRequestStep from './forwarder/export/ExportForwarderRequestStep';
import ExportForwarderBookingStep from './forwarder/export/ExportForwarderBookingStep';
import ExportForwarderProgressStep from './forwarder/export/ExportForwarderProgressStep';
import ExportForwarderBLStep from './forwarder/export/ExportForwarderBLStep';
import ExportForwarderCompletionStep from './forwarder/export/ExportForwarderCompletionStep';
import ExportForwarderMessages from './forwarder/export/ExportForwarderMessages';
import '../styles/forwarderExportRefresh.css';

const STEP_LABELS = ['화주 의뢰 확인', '선복 부킹', '반입·선적 준비', 'B/L 관리', '선적 완료'];

interface Props {
  state: ForwarderFormState;
  onChange: (state: ForwarderFormState) => void;
  status: PersistedTradeStatus | null;
  busy: boolean;
  userId: string;
  attachmentScopeId: string;
  attachments: TradeAttachment[];
  onAttachmentsChange: (attachments: TradeAttachment[]) => void;
  /** 사용자 프로필 기본값 — AI 분석값이 "직접 입력값"이 아닌 프로필 기본값과 충돌할 때는 조용히 덮어쓴다. */
  profileDefaults?: Partial<ForwarderFormState>;
  readOnly?: boolean;
  onClose?: () => void;
  currentStep: number;
  onStepChange: (step: number) => void;

  /** 첫 진입은 "받은 의뢰" Inbox, 의뢰를 불러오거나 직접 등록을 완료하면 5단계 workflow로 전환된다. */
  view: 'inbox' | 'workflow';
  /** 업무 화면(workflow)에서 Inbox 화면으로 돌아간다 — 거래 저장 데이터는 지우지 않는다. */
  onReturnToInbox: () => void;
  /** 직접 등록에서 서류 확인을 마치고 STEP 1(화주 의뢰 확인)로 진입 */
  onEnterWorkflow: () => void;

  /** STEP 1 — 의뢰 접수 */
  onNextFromRequest: () => void;
  appliedRequestTradeId?: string | null;
  onApplyExportRequest?: (request: ForwarderExportRequest) => void;

  /** STEP 2 — 선복 부킹 */
  onSaveBooking: () => void;
  /** 외부에서 확정받은 부킹의 부가정보(마감일·운임조건·비고) */
  booking: ExportBookingDetails;
  onBookingChange: (values: Partial<ExportBookingDetails>) => void;

  /** STEP 3 — 선적 진행 관리 */
  progress: Partial<Record<ExportProgressStageKey, ExportProgressStatus>>;
  onProgressChange: (stage: ExportProgressStageKey, status: ExportProgressStatus) => void;
  onNextFromProgress: () => void;

  /** STEP 4 — B/L 관리 */
  masterBlNo: string;
  onSaveMasterBl: (value: string) => void;
  /** 생성된 House B/L — forwarderBillOfLadingService가 만든 실제 데이터(docx 미리보기/다운로드의 원본). */
  billOfLadingData: BillOfLadingData | null;
  generationError?: string;
  onGenerateHouseBillOfLading: () => void;
  onViewBillOfLading?: () => void;
  onDownloadBillOfLading?: () => void;
  onNextFromBL: () => void;

  /** STEP 5 — 선적 완료 및 문서 전달 */
  trade: SavedTrade | null;
  shipperNotifiedAt?: string | null;
  shippingAdviceSentAt?: string | null;
  completedAt?: string | null;
  onShipperNotified: () => Promise<void>;
  onShippingAdviceSent: () => Promise<void>;
  onCompleteShipment: () => void;
  defaultShipperEmail?: string;
  defaultShipperCompany?: string;
}

/**
 * 수출 포워더 워크스페이스 — 5단계(의뢰 접수 → Booking → 선적 진행 → B/L 관리 → 선적 완료) 오케스트레이터.
 * 각 단계 화면은 components/forwarder/export/*Step에 위임하고, 여기서는
 * 공통 Step 표시줄과 폼 상태(수동 입력 필드 추적 포함)만 관리한다.
 */
export default function ForwarderWorkspaceForm({
  state,
  onChange,
  status,
  busy,
  userId,
  attachmentScopeId,
  attachments,
  onAttachmentsChange,
  profileDefaults = {},
  readOnly = false,
  onClose,
  currentStep,
  onStepChange,
  view,
  onReturnToInbox,
  onEnterWorkflow,
  onNextFromRequest,
  appliedRequestTradeId = null,
  onApplyExportRequest,
  onSaveBooking,
  booking,
  onBookingChange,
  progress,
  onProgressChange,
  onNextFromProgress,
  masterBlNo,
  onSaveMasterBl,
  billOfLadingData,
  generationError = '',
  onGenerateHouseBillOfLading,
  onViewBillOfLading,
  onDownloadBillOfLading,
  onNextFromBL,
  trade,
  shipperNotifiedAt,
  shippingAdviceSentAt,
  completedAt,
  onShipperNotified,
  onShippingAdviceSent,
  onCompleteShipment,
  defaultShipperEmail,
  defaultShipperCompany,
}: Props) {
  const manuallyEditedFieldsRef = useRef(new Set<keyof ForwarderFormState>());
  useEffect(() => {
    manuallyEditedFieldsRef.current.clear();
  }, [attachmentScopeId]);

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

  const canMoveTo = (step: number) => readOnly || step === 1 || Boolean(status);

  const billOfLadingReady = Boolean(billOfLadingData) && !generationError;

  const handleApplyAnalysis = (
    values: Partial<ForwarderFormState>,
    sourceFiles: Record<string, string>,
  ) => {
    const merged = mergeForwarderAutoFill(
      state,
      values,
      sourceFiles,
      profileDefaults,
      manuallyEditedFieldsRef.current,
    );
    onChange(merged.state);
    return merged;
  };

  // 첫 진입 화면 — 업무 단계(Stepper)·입력 폼 없이 "받은 의뢰" Inbox만 보여준다.
  if (view === 'inbox') {
    return (
      <ExportForwarderInboxView
        userId={userId}
        attachmentScopeId={attachmentScopeId}
        attachments={attachments}
        onAttachmentsChange={onAttachmentsChange}
        onApplyAnalysis={handleApplyAnalysis}
        appliedRequestTradeId={appliedRequestTradeId}
        onApplyExportRequest={onApplyExportRequest ?? (() => {})}
        onContinueToWorkflow={onEnterWorkflow}
      />
    );
  }

  return (
    <div className="forwarder-export-flow fwd-export-refresh">
      {!readOnly && (
        <button type="button" className="btn btn-secondary forwarder-back-to-inbox" onClick={onReturnToInbox}>
          <ArrowLeft size={16} /> 목록으로 돌아가기
        </button>
      )}

      <section className="form-card fwd-export-summary" aria-label="수출 거래 요약">
        <div className="fwd-export-summary-title">
          <h2>{state.bookingNo || state.invoiceNo || '수출 의뢰'}</h2>
          <span>{STEP_LABELS[currentStep - 1]}</span>
        </div>
        <dl className="fwd-export-summary-grid">
          <div><dt>화주</dt><dd>{state.companyName || '미입력'}</dd></div>
          <div><dt>수하인</dt><dd>{state.partnerName || '미입력'}</dd></div>
          <div><dt>선박</dt><dd>{state.vesselOrFlight || '미정'}</dd></div>
          <div><dt>출항일</dt><dd>{state.departureDate || state.requestedDepartureDate || '미정'}</dd></div>
        </dl>
      <ImportStepIndicator
        current={currentStep}
        labels={STEP_LABELS}
        onMove={onStepChange}
        canMoveTo={canMoveTo}
      />
      </section>

      {currentStep === 1 && (
        <ExportForwarderRequestStep
          attachments={attachments}
          userId={userId}
          state={state}
          patch={patch}
          patchCargoItem={patchCargoItem}
          readOnly={readOnly}
          busy={busy}
          onNext={onNextFromRequest}
        />
      )}

      {currentStep === 2 && (
        <ExportForwarderBookingStep
          state={state}
          patch={patch}
          booking={booking}
          onBookingChange={onBookingChange}
          userId={userId}
          scopeId={attachmentScopeId}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
          readOnly={readOnly}
          busy={busy}
          onSave={onSaveBooking}
        />
      )}

      {currentStep === 3 && (
        <ExportForwarderProgressStep
          state={state}
          patch={patch}
          progress={progress}
          onProgressChange={onProgressChange}
          userId={userId}
          scopeId={attachmentScopeId}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
          readOnly={readOnly}
          busy={busy}
          onNext={onNextFromProgress}
        />
      )}

      {currentStep === 4 && (
        <ExportForwarderBLStep
          state={state}
          patch={patch}
          booking={booking}
          userId={userId}
          scopeId={attachmentScopeId}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
          readOnly={readOnly}
          busy={busy}
          masterBlNo={masterBlNo}
          onSaveMasterBl={onSaveMasterBl}
          billOfLadingData={billOfLadingData}
          generationError={generationError}
          onGenerateHouseBillOfLading={onGenerateHouseBillOfLading}
          onViewHouseBillOfLading={() => onViewBillOfLading?.()}
          onDownloadHouseBillOfLading={() => onDownloadBillOfLading?.()}
          onNext={onNextFromBL}
        />
      )}

      {currentStep === 5 && (
        <ExportForwarderCompletionStep
          bookingRegistered={isBookingRegistered(state)}
          progress={progress}
          masterBlNo={masterBlNo}
          billOfLadingReady={billOfLadingReady}
          status={status}
          busy={busy}
          onComplete={onCompleteShipment}
          trade={trade}
          shipperNotifiedAt={shipperNotifiedAt}
          shippingAdviceSentAt={shippingAdviceSentAt}
          completedAt={completedAt}
          onShipperNotified={onShipperNotified}
          onShippingAdviceSent={onShippingAdviceSent}
          readOnly={readOnly}
          defaultShipperEmail={defaultShipperEmail}
          defaultShipperCompany={defaultShipperCompany}
        />
      )}

      {/* 업무 메시지 — 화주 의뢰로 들어온 건이면 모든 단계에서 화주와 대화할 수 있다 (수입과 동일한 채널) */}
      {!readOnly && <ExportForwarderMessages trade={trade} userId={userId} />}

      {readOnly && onClose && <DocumentManagerReadOnlyAction onClose={onClose} />}
    </div>
  );
}
