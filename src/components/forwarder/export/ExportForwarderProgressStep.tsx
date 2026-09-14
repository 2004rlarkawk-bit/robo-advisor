import { ArrowRight, ListChecks } from 'lucide-react';
import { isBookingRegistered, type ForwarderFormState } from '../../../utils/forwarderForm';
import type { TradeAttachment } from '../../../types/tradeFormData';
import {
  EXPORT_PROGRESS_STAGE_LABEL,
  EXPORT_PROGRESS_STAGE_ORDER,
  type ExportProgressStageKey,
  type ExportProgressStatus,
} from '../../../types/exportForwarderCase';
import ForwarderDocumentSlot from './ForwarderDocumentSlot';

interface Props {
  state: ForwarderFormState;
  patch: (values: Partial<ForwarderFormState>) => void;
  progress: Partial<Record<ExportProgressStageKey, ExportProgressStatus>>;
  onProgressChange: (stage: ExportProgressStageKey, status: ExportProgressStatus) => void;
  userId: string;
  scopeId: string;
  attachments: TradeAttachment[];
  onAttachmentsChange: (attachments: TradeAttachment[]) => void;
  readOnly: boolean;
  busy: boolean;
  onNext: () => void;
}

const STATUS_LABEL: Record<ExportProgressStatus, string> = {
  pending: '대기',
  in_progress: '진행중',
  done: '완료',
};

/** STEP 3 — 선적 진행 관리. PortAI는 수출신고서를 생성하지 않고, 완료된 신고 정보만 등록/확인한다. */
export default function ExportForwarderProgressStep({
  state,
  patch,
  progress,
  onProgressChange,
  userId,
  scopeId,
  attachments,
  onAttachmentsChange,
  readOnly,
  busy,
  onNext,
}: Props) {
  // Booking 완료 여부는 별도로 저장하지 않는다 — 2단계에서 저장한 Booking No.의 존재 여부가
  // 유일한 기준(isBookingRegistered)이며, 5단계 완료 체크리스트도 동일 기준을 쓴다.
  const bookingRegistered = isBookingRegistered(state);

  const statusOf = (stage: ExportProgressStageKey): ExportProgressStatus => {
    if (stage === 'booking') return bookingRegistered ? 'done' : 'pending';
    return progress[stage] ?? 'pending';
  };

  return (
    <div className="form-card forwarder-workspace-form">
      <div className="trade-section-header">
        <div className="trade-section-title">
          <ListChecks size={20} className="text-primary" />
          <div>
            <h2 className="card-title">3. 선적 진행 관리</h2>
            <p className="forwarder-step-description">이 거래의 진행 상태를 관리합니다. 실제 통관·선적 시스템과 연동되지 않으며, 포워더가 직접 갱신합니다.</p>
          </div>
        </div>
      </div>

      <details className="form-section" open>
        <summary className="form-section-summary">진행 상태</summary>
        <div className="fwd-progress" aria-label="선적 진행 단계" style={{ marginTop: 8 }}>
          {EXPORT_PROGRESS_STAGE_ORDER.map((stage) => {
            const status = statusOf(stage);
            return (
              <span key={stage} className={`fwd-progress-step${status === 'done' ? ' is-done' : status === 'in_progress' ? ' is-current' : ''}`}>
                {EXPORT_PROGRESS_STAGE_LABEL[stage]}
              </span>
            );
          })}
        </div>
        <div className="import-document-list" style={{ marginTop: 14 }}>
          {EXPORT_PROGRESS_STAGE_ORDER.map((stage) => (
            <div className="import-document-row" key={stage}>
              <div className="import-document-content">
                <strong className="import-document-type">{EXPORT_PROGRESS_STAGE_LABEL[stage]}</strong>
                {stage === 'booking' && <span className="import-document-meta">2단계 Booking No. 저장 여부로 자동 판정됩니다.</span>}
              </div>
              <div className="import-document-actions">
                <select
                  aria-label={`${EXPORT_PROGRESS_STAGE_LABEL[stage]} 상태`}
                  className="form-input"
                  disabled={readOnly || busy || stage === 'booking'}
                  value={statusOf(stage)}
                  onChange={(event) => onProgressChange(stage, event.target.value as ExportProgressStatus)}
                >
                  <option value="pending">{STATUS_LABEL.pending}</option>
                  <option value="in_progress">{STATUS_LABEL.in_progress}</option>
                  <option value="done">{STATUS_LABEL.done}</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </details>

      <details className="form-section" open>
        <summary className="form-section-summary">수출통관 정보 <span className="form-section-hint">PortAI는 수출신고서를 생성하지 않습니다 — 완료된 신고 정보만 등록합니다</span></summary>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="progress-decl-no">수출신고번호</label>
            <input id="progress-decl-no" className="form-input" disabled={readOnly} value={state.exportDeclarationNo} onChange={(e) => patch({ exportDeclarationNo: e.target.value })} />
          </div>
        </div>
        <ForwarderDocumentSlot
          label="수출신고필증"
          documentType="export_declaration"
          userId={userId}
          scopeId={scopeId}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
          readOnly={readOnly}
        />
      </details>

      {!readOnly && (
        <div className="form-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onNext}>
            다음: B/L 관리 <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
