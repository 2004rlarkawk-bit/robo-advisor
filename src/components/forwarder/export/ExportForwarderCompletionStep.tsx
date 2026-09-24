import { CheckCircle2, Circle } from 'lucide-react';
import type { PersistedTradeStatus, SavedTrade } from '../../../types';
import {
  EXPORT_PROGRESS_STAGE_LABEL,
  EXPORT_PROGRESS_STAGE_ORDER,
  type ExportProgressStageKey,
  type ExportProgressStatus,
} from '../../../types/exportForwarderCase';
import ForwarderDocumentSendPanel from './ForwarderDocumentSendPanel';

interface Props {
  /** Booking 완료 여부 — 2단계 Booking No. 저장 여부(isBookingRegistered)로 판정한 값을 그대로 받는다. */
  bookingRegistered: boolean;
  progress: Partial<Record<ExportProgressStageKey, ExportProgressStatus>>;
  masterBlNo: string;
  billOfLadingReady: boolean;
  status: PersistedTradeStatus | null;
  busy: boolean;
  onComplete: () => void;
  trade: SavedTrade | null;
  shipperNotifiedAt?: string | null;
  shippingAdviceSentAt?: string | null;
  onShipperNotified: () => void;
  onShippingAdviceSent: () => void;
  readOnly: boolean;
  defaultShipperEmail?: string;
  defaultShipperCompany?: string;
}

/** STEP 5 — 선적 완료 확인 및 화주·해외 파트너 포워더에게 문서 전달. */
export default function ExportForwarderCompletionStep({
  bookingRegistered,
  progress,
  masterBlNo,
  billOfLadingReady,
  status,
  busy,
  onComplete,
  trade,
  shipperNotifiedAt,
  shippingAdviceSentAt,
  onShipperNotified,
  onShippingAdviceSent,
  readOnly,
  defaultShipperEmail = '',
  defaultShipperCompany = '',
}: Props) {
  const checklist: Array<{ label: string; done: boolean }> = [
    { label: EXPORT_PROGRESS_STAGE_LABEL.booking, done: bookingRegistered },
    ...EXPORT_PROGRESS_STAGE_ORDER.filter((stage) => stage !== 'booking').map((stage) => ({
      label: `${EXPORT_PROGRESS_STAGE_LABEL[stage]} 완료`,
      done: (progress[stage] ?? 'pending') === 'done',
    })),
    { label: 'M/B/L 등록', done: masterBlNo.trim().length > 0 },
    { label: 'H/B/L 발행', done: billOfLadingReady },
  ];
  const allDone = checklist.every((item) => item.done);
  const isCompleted = status === 'submitted';

  return (
    <div className="form-card forwarder-workspace-form fwd-export-stage">
      <div className="trade-section-header fwd-export-step-heading">
        <div>
          <span className="fwd-section-kicker">05 · 완료</span>
          <h2 className="card-title">선적 완료와 문서 전달</h2>
        </div>
      </div>

      <details className="form-section fwd-export-content-card fwd-export-accent-green" open>
        <summary className="form-section-summary">완료 체크</summary>
        <ul className="forwarder-completion-checklist">
          {checklist.map((item) => (
            <li key={item.label} className={item.done ? 'is-done' : ''}>
              {item.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              {item.label}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={busy || isCompleted || !allDone} onClick={onComplete}>
              {isCompleted ? '선적 완료 처리됨' : '선적 완료 처리'}
            </button>
            {!allDone && !isCompleted && <p className="fwd-action-hint">미완료 항목을 먼저 확인해 주세요.</p>}
          </div>
        )}
      </details>

      {shipperNotifiedAt && <p className="form-message success">화주에게 전달 완료 — {new Date(shipperNotifiedAt).toLocaleString('ko-KR')}</p>}
      {shippingAdviceSentAt && <p className="form-message success">해외 파트너 포워더에게 전달 완료 — {new Date(shippingAdviceSentAt).toLocaleString('ko-KR')}</p>}

      {trade && !readOnly && (
        <>
          <ForwarderDocumentSendPanel
            trade={trade}
            title="화주에게 선적완료 알림"
            description="House B/L 등 생성된 문서를 화주 이메일로 전달합니다."
            sendButtonLabel="화주에게 선적완료 알림"
            defaultMessage="안녕하세요. 의뢰하신 건의 선적이 완료되어 관련 서류를 전달드립니다. 확인 부탁드립니다."
            defaultRecipientEmail={defaultShipperEmail}
            defaultRecipientCompany={defaultShipperCompany}
            onSent={onShipperNotified}
          />

          <ForwarderDocumentSendPanel
            trade={trade}
            title="해외 파트너 포워더 Shipping Advice"
            description="현지 통관·인도를 담당하는 해외 파트너 포워더에게 Shipping Advice와 관련 서류를 전달합니다."
            sendButtonLabel="Shipping Advice 전달"
            defaultMessage="안녕하세요. 아래 건의 Shipping Advice를 전달드립니다. 첨부 서류 확인 부탁드립니다."
            onSent={onShippingAdviceSent}
          />
        </>
      )}
    </div>
  );
}
