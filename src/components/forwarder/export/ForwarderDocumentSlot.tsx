import { useRef, useState } from 'react';
import { Download, Eye, FileUp, Trash2 } from 'lucide-react';
import type { TradeAttachment, TradeAttachmentDocumentType } from '../../../types/tradeFormData';
import { removeTradeAttachment, uploadTradeAttachment } from '../../../services/tradeAttachmentStorageService';
import { openOrDownloadTradeAttachment } from '../../../utils/tradeAttachmentView';

interface Props {
  label: string;
  hint?: string;
  documentType: TradeAttachmentDocumentType;
  userId: string;
  scopeId: string;
  attachments: TradeAttachment[];
  onAttachmentsChange: (attachments: TradeAttachment[]) => void;
  readOnly: boolean;
}

/**
 * 특정 문서 종류(수출신고필증·Master B/L 등) 1건을 등록·보기·다운로드하는 최소 위젯.
 * TradeAttachmentUploader와 동일한 Storage 서비스(uploadTradeAttachment 등)를 재사용하되,
 * 전체 첨부파일 배열 중 이 문서 종류만 걸러 보여준다 — 회사문서관리 원본 배열은 그대로 유지한다.
 * PortAI는 이 문서를 생성하지 않고 "등록/보관"만 한다.
 */
export default function ForwarderDocumentSlot({
  label,
  hint,
  documentType,
  userId,
  scopeId,
  attachments,
  onAttachmentsChange,
  readOnly,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = attachments.filter((attachment) => attachment.documentType === documentType);

  const handleFiles = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const uploaded: TradeAttachment[] = [];
      for (const file of files) {
        uploaded.push(await uploadTradeAttachment({ userId, scopeId, documentType, file }));
      }
      onAttachmentsChange([...attachments, ...uploaded]);
    } catch {
      setError('파일을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (attachment: TradeAttachment) => {
    if (!window.confirm(`${attachment.fileName} 파일을 삭제할까요?`)) return;
    setBusy(true);
    setError('');
    try {
      await removeTradeAttachment({ storageBucket: attachment.storageBucket, storagePath: attachment.storagePath });
      onAttachmentsChange(attachments.filter((item) => item.id !== attachment.id));
    } catch {
      setError('파일을 삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (attachment: TradeAttachment, download: boolean) => {
    setBusy(true);
    setError('');
    try {
      await openOrDownloadTradeAttachment(attachment, userId, download);
    } catch {
      setError('문서를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="forwarder-document-slot">
      <div className="forwarder-document-slot-head">
        <span className="form-label">{label}</span>
        {hint && <span className="form-section-hint">{hint}</span>}
      </div>
      {items.length === 0 ? (
        <p className="import-empty">등록된 파일이 없습니다.</p>
      ) : (
        <div className="import-document-list">
          {items.map((attachment) => (
            <div className="import-document-row" key={attachment.id}>
              <div className="import-document-content">
                <span className="import-document-file-name" title={attachment.fileName}>{attachment.fileName}</span>
                <span className="import-document-meta">{(attachment.sizeBytes / 1024).toFixed(1)} KB</span>
              </div>
              <div className="import-document-actions">
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void handleOpen(attachment, false)}><Eye size={14} /> 보기</button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void handleOpen(attachment, true)}><Download size={14} /> 다운로드</button>
                {!readOnly && (
                  <button type="button" className="icon-btn import-delete" disabled={busy} title="파일 삭제" aria-label={`${attachment.fileName} 삭제`} onClick={() => void handleRemove(attachment)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
            <FileUp size={15} /> {busy ? '처리 중…' : '파일 등록'}
          </button>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(event) => {
              void handleFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </>
      )}
      {error && <div className="form-message error" role="alert">{error}</div>}
    </div>
  );
}
