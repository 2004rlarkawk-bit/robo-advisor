import { useState } from 'react';
import { Send } from 'lucide-react';
import type { SavedTrade } from '../../../types';
import { ATTACHABLE_DOCUMENT_LABELS, type AttachableDocumentType } from '../../../types/forwarderRequest';
import { getAttachableDocumentTypes, sendExternalForwarderEmail } from '../../../services/externalForwarderEmailService';
import '../../../styles/forwarderRequest.css';

interface Props {
  trade: SavedTrade;
  title: string;
  description: string;
  sendButtonLabel: string;
  defaultMessage: string;
  defaultRecipientEmail?: string;
  defaultRecipientCompany?: string;
  defaultRecipientName?: string;
  /** 전송 완료 시각 등 기록을 남기려는 호출부에서 사용 */
  onSent?: () => void;
}

/**
 * 생성된 거래 문서(H/B/L 등)를 이메일로 전달하는 공용 패널.
 * 화주가 포워더에게 의뢰할 때 쓰는 ForwarderRequestModal의 "외부 이메일 전송" 로직
 * (externalForwarderEmailService.sendExternalForwarderEmail)을 그대로 재사용하되,
 * 포워더 → 화주 / 포워더 → 해외 파트너처럼 방향이 반대인 화면에 맞춰 라벨만 바꾼다.
 */
export default function ForwarderDocumentSendPanel({
  trade,
  title,
  description,
  sendButtonLabel,
  defaultMessage,
  defaultRecipientEmail = '',
  defaultRecipientCompany = '',
  defaultRecipientName = '',
  onSent,
}: Props) {
  const attachableTypes = getAttachableDocumentTypes(trade);
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail);
  const [recipientCompany, setRecipientCompany] = useState(defaultRecipientCompany);
  const [recipientName, setRecipientName] = useState(defaultRecipientName);
  const [message, setMessage] = useState(defaultMessage);
  const [selectedDocTypes, setSelectedDocTypes] = useState<AttachableDocumentType[]>(attachableTypes);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const toggleDocType = (type: AttachableDocumentType) => {
    setSelectedDocTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type]);
  };

  const handleSend = async () => {
    setError('');
    if (!recipientEmail.trim()) {
      setError('받는 사람 이메일을 입력해 주세요.');
      return;
    }
    if (selectedDocTypes.length === 0) {
      setError('보낼 문서를 하나 이상 선택해 주세요.');
      return;
    }
    setSending(true);
    try {
      await sendExternalForwarderEmail({
        trade,
        recipientEmail,
        recipientCompany,
        recipientName,
        message,
        documentTypes: selectedDocTypes,
      });
      setSuccess(true);
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이메일 전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <details className="form-section" data-testid="forwarder-document-send-panel">
      <summary className="form-section-summary">{title}</summary>
      <p className="forwarder-step-description">{description}</p>
      {success ? (
        <div className="form-message success">이메일을 전송했습니다.</div>
      ) : (
        <>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor={`${title}-email`}>받는 사람 이메일</label>
              <input id={`${title}-email`} type="email" className="form-input" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${title}-company`}>업체명</label>
              <input id={`${title}-company`} className="form-input" value={recipientCompany} onChange={(e) => setRecipientCompany(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${title}-name`}>담당자명</label>
              <input id={`${title}-name`} className="form-input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`${title}-message`}>메시지</label>
            <textarea id={`${title}-message`} className="form-input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="form-group">
            <span className="form-label">보낼 문서</span>
            {attachableTypes.length === 0 ? (
              <p className="fwd-doc-empty">이 거래에는 아직 이메일로 보낼 수 있는 생성 문서가 없습니다. (H/B/L 생성 후 이용 가능)</p>
            ) : (
              <div className="fwd-doc-checklist">
                {attachableTypes.map((type) => (
                  <label key={type}>
                    <input type="checkbox" checked={selectedDocTypes.includes(type)} onChange={() => toggleDocType(type)} />
                    {ATTACHABLE_DOCUMENT_LABELS[type]}
                  </label>
                ))}
              </div>
            )}
          </div>
          {error && <div className="form-message error" role="alert">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={sending || attachableTypes.length === 0} onClick={() => void handleSend()}>
              <Send size={16} /> {sending ? '전송 중…' : sendButtonLabel}
            </button>
          </div>
        </>
      )}
    </details>
  );
}
