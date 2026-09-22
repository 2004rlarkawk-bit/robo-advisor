import { useEffect, useRef } from 'react';
import type { BillOfLadingData, PersistedTradeStatus, SavedTrade } from '../types';
import { isBookingRegistered, type ForwarderFormState } from '../utils/forwarderForm';
import type { TradeAttachment } from '../types/tradeFormData';
import type {
  ExportProgressStageKey,
  ExportProgressStatus,
  ExportBookingDetails,
} from '../types/exportForwarderCase';
import DocumentManagerReadOnlyAction from './DocumentManagerReadOnlyAction';
import ImportStepIndicator from './import/ImportStepIndicator';
import type { ForwarderExportRequest } from '../services/forwarderExportRequestService';
import { mergeForwarderAutoFill } from '../services/forwarderDocumentAnalysisService';
import ExportForwarderRequestStep from './forwarder/export/ExportForwarderRequestStep';
import ExportForwarderBookingStep from './forwarder/export/ExportForwarderBookingStep';
import ExportForwarderProgressStep from './forwarder/export/ExportForwarderProgressStep';
import ExportForwarderBLStep from './forwarder/export/ExportForwarderBLStep';
import ExportForwarderCompletionStep from './forwarder/export/ExportForwarderCompletionStep';

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

  /** STEP 1 — 의뢰 접수 */
  onNextFromRequest: () => void;
  onResetTrade: () => void;
  showRequestInbox?: boolean;
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
  onShipperNotified: () => void;
  onShippingAdviceSent: () => void;
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
  onNextFromRequest,
  onResetTrade,
  showRequestInbox = false,
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

  return (
    <div className="forwarder-export-flow">
      <ImportStepIndicator
        current={currentStep}
        labels={STEP_LABELS}
        onMove={onStepChange}
        canMoveTo={canMoveTo}
      />

      {currentStep === 1 && (
        <ExportForwarderRequestStep
          state={state}
          patch={patch}
          patchCargoItem={patchCargoItem}
          userId={userId}
          attachmentScopeId={attachmentScopeId}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
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
          readOnly={readOnly}
          busy={busy}
          onNext={onNextFromRequest}
          onResetTrade={onResetTrade}
          showRequestInbox={showRequestInbox}
          appliedRequestTradeId={appliedRequestTradeId}
          onApplyExportRequest={onApplyExportRequest}
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
          onShipperNotified={onShipperNotified}
          onShippingAdviceSent={onShippingAdviceSent}
          readOnly={readOnly}
          defaultShipperEmail={defaultShipperEmail}
          defaultShipperCompany={defaultShipperCompany}
        />
      )}

      {readOnly && onClose && <DocumentManagerReadOnlyAction onClose={onClose} />}
    </div>
  );
}
