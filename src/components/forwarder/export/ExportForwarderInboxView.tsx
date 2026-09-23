import { useState } from 'react';
import { ArrowRight, Inbox, Plus, X } from 'lucide-react';
import type { ForwarderFormState } from '../../../utils/forwarderForm';
import type { TradeAttachment } from '../../../types/tradeFormData';
import TradeAttachmentUploader from '../../TradeAttachmentUploader';
import ForwarderExportRequestInbox from '../../ForwarderExportRequestInbox';
import type { ForwarderExportRequest } from '../../../services/forwarderExportRequestService';
import type { ForwarderAutoFillApplicationResult } from '../../../services/forwarderDocumentAnalysisService';

interface Props {
  userId: string;
  attachmentScopeId: string;
  attachments: TradeAttachment[];
  onAttachmentsChange: (attachments: TradeAttachment[]) => void;
  onApplyAnalysis: (
    values: Partial<ForwarderFormState>,
    sourceFiles: Record<string, string>,
  ) => ForwarderAutoFillApplicationResult;
  appliedRequestTradeId?: string | null;
  onApplyExportRequest: (request: ForwarderExportRequest) => void;
  /** 직접 등록에서 서류를 확인한 뒤 업무 화면(STEP 1)으로 진입 */
  onContinueToWorkflow: () => void;
}

/**
 * 수출 포워더 첫 진입 화면 — 업무 단계(Stepper)나 입력 폼 없이 "받은 의뢰함"만 Inbox로 보여준다.
 * 화주가 PortAI 내부에서 보낸 의뢰는 ForwarderExportRequestInbox(기존 컴포넌트)를 그대로 쓰고,
 * 외부(이메일·메신저)에서 받은 의뢰는 [+ 직접 등록]으로 기존 업로드·AI 분석 흐름을 그대로 연다.
 * 어느 경로든 실제 업무 처리는 동일한 5단계 workflow(ForwarderWorkspaceForm)로 이어진다.
 */
export default function ExportForwarderInboxView({
  userId,
  attachmentScopeId,
  attachments,
  onAttachmentsChange,
  onApplyAnalysis,
  appliedRequestTradeId,
  onApplyExportRequest,
  onContinueToWorkflow,
}: Props) {
  const [isManualRegistrationOpen, setIsManualRegistrationOpen] = useState(false);

  return (
    <div className="forwarder-workspace-form fwd-export-refresh fwd-export-list">
      <div className="trade-section-header">
        <div className="trade-section-title">
          <Inbox size={20} className="text-primary" />
          <h2 className="card-title">수출 포워더 업무</h2>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setIsManualRegistrationOpen((open) => !open)}
          aria-expanded={isManualRegistrationOpen}
        >
          {isManualRegistrationOpen ? <X size={16} /> : <Plus size={16} />}
          {isManualRegistrationOpen ? '직접 등록 닫기' : '직접 등록'}
        </button>
      </div>

      <ForwarderExportRequestInbox
        onApply={onApplyExportRequest}
        appliedTradeId={appliedRequestTradeId ?? null}
      />

      {isManualRegistrationOpen && (
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
            <button type="button" className="btn btn-primary" onClick={onContinueToWorkflow}>
              다음: 화주 의뢰 확인 <ArrowRight size={16} />
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
