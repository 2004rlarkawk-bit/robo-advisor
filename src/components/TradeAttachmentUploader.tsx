import { useRef, useState, type ChangeEvent } from 'react';
import { FileText, Paperclip, Trash2 } from 'lucide-react';
import type {
  TradeAttachment,
  TradeAttachmentDocumentType,
} from '../types/tradeFormData';
import {
  removeTradeAttachment,
  uploadTradeAttachment,
} from '../services/tradeAttachmentStorageService';

const ACCEPTED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const DOCUMENT_OPTIONS: Array<{ value: TradeAttachmentDocumentType; label: string }> = [
  { value: 'commercial_invoice', label: 'Commercial Invoice (C/I)' },
  { value: 'packing_list', label: 'Packing List (P/L)' },
  { value: 'bill_of_lading', label: 'Bill of Lading (B/L)' },
  { value: 'certificate_of_origin', label: 'Certificate of Origin (C/O)' },
  { value: 'other', label: '수출신고필증 또는 기타서류' },
];

interface Props {
  userId: string;
  scopeId: string;
  attachments: TradeAttachment[];
  onChange: (attachments: TradeAttachment[]) => void;
}

export default function TradeAttachmentUploader({
  userId,
  scopeId,
  attachments,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState<TradeAttachmentDocumentType>('commercial_invoice');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const addFiles = async (files: File[]) => {
    if (!files.length || busy) return;
    const invalid = files.filter((file) => !ACCEPTED_MIME_TYPES.has(file.type));
    if (invalid.length) {
      setMessage('PDF, PNG, JPEG 파일만 업로드할 수 있습니다.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const uploaded: TradeAttachment[] = [];
      for (const file of files) {
        uploaded.push(await uploadTradeAttachment({
          userId,
          scopeId,
          documentType,
          file,
        }));
      }
      onChange([...attachments, ...uploaded]);
    } catch (error) {
      console.error('[Export Forwarder Attachment] 업로드 실패:', error);
      setMessage('첨부파일을 업로드하지 못했습니다. Storage 권한과 연결 상태를 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (attachment: TradeAttachment) => {
    if (!window.confirm(`${attachment.fileName} 파일을 삭제할까요?`)) return;
    setBusy(true);
    setMessage('');
    try {
      await removeTradeAttachment({
        storageBucket: attachment.storageBucket,
        storagePath: attachment.storagePath,
      });
      onChange(attachments.filter(({ id }) => id !== attachment.id));
    } catch (error) {
      console.error('[Export Forwarder Attachment] 삭제 실패:', error);
      setMessage('첨부파일을 삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="forwarder-attachment-uploader">
      <div className="forwarder-attachment-picker">
        <label className="form-group">
          <span className="form-label">문서 종류</span>
          <select
            className="form-input"
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value as TradeAttachmentDocumentType)}
          >
            {DOCUMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip size={16} /> {busy ? '업로드 중...' : '파일 첨부'}
        </button>
        <input
          ref={inputRef}
          hidden
          multiple
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            void addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>
      {message && <div className="form-message error" role="alert">{message}</div>}
      <div className="import-document-list">
        {attachments.length === 0 ? (
          <p className="import-empty">첨부된 파일이 없습니다.</p>
        ) : attachments.map((attachment) => (
          <div className="import-document-row" key={attachment.id}>
            <FileText size={18} />
            <div className="import-document-name">
              <strong>{attachment.fileName}</strong>
              <span>{(attachment.sizeBytes / 1024).toFixed(1)} KB · 업로드 완료</span>
            </div>
            <button
              type="button"
              className="icon-btn import-delete"
              disabled={busy}
              aria-label={`${attachment.fileName} 삭제`}
              onClick={() => void remove(attachment)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
