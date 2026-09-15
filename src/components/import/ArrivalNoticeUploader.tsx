import { useState, type ReactNode } from 'react';
import { FileText, Paperclip, Trash2 } from 'lucide-react';
import {
  removeTradeAttachment,
  uploadTradeAttachment,
} from '../../services/tradeAttachmentStorageService';
import type { ArrivalNoticeMeta } from '../../types/importTrade';

interface Props {
  value: ArrivalNoticeMeta | null;
  onChange: (value: ArrivalNoticeMeta | null) => void;
  userId: string;
  tradeId?: string;
  readOnly?: boolean;
  /** 카드 우측 상단 액션(예: 포워더 워크스페이스의 A/N 생성 버튼) */
  headerAction?: ReactNode;
  /** 카드 상단 안내 문구 */
  notice?: string;
  workspaceMode?: boolean;
  fileActions?: ReactNode;
  disabledReason?: string;
  showDisabledReason?: boolean;
}

export default function ArrivalNoticeUploader({ value, onChange, userId, tradeId, readOnly = false, headerAction, notice, workspaceMode = false, fileActions, disabledReason, showDisabledReason = true }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectFile = async (file?: File) => {
    if (!file || readOnly || disabledReason || busy) return;
    if (!tradeId) {
      setError('확인 결과를 먼저 저장한 뒤 도착통지서를 첨부해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const uploaded = await uploadTradeAttachment({
        userId,
        scopeId: tradeId,
        documentType: 'arrival_notice',
        file,
      });
      onChange({
        id: uploaded.id,
        documentType: 'arrival_notice',
        fileName: uploaded.fileName,
        storageBucket: uploaded.storageBucket,
        storagePath: uploaded.storagePath,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        uploadedAt: uploaded.uploadedAt,
      });
    } catch (caught) {
      console.error('[Arrival Notice] Storage 업로드 실패:', caught);
      setError('도착통지서를 업로드하지 못했습니다. Storage 버킷과 권한을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async () => {
    if (readOnly || disabledReason || busy || !value || !window.confirm('도착통지서를 삭제할까요?')) return;
    setBusy(true);
    setError('');
    try {
      if (value.storageBucket && value.storagePath) {
        await removeTradeAttachment({
          storageBucket: value.storageBucket,
          storagePath: value.storagePath,
        });
      }
      onChange(null);
    } catch (caught) {
      console.error('[Arrival Notice] Storage 삭제 실패:', caught);
      setError('도착통지서를 삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const displayValue = value ? {
      id: value.id,
      documentType: 'arrival_notice',
      fileName: value.fileName,
      mimeType: value.mimeType,
      sizeBytes: value.sizeBytes,
    } : null;

  return (
    <section className="form-card import-card arrival-notice-card">
      <div className="import-card-heading">
        <div>
          {!workspaceMode && <span className="ai-badge">별도 첨부</span>}
          <h2>{workspaceMode ? <><span className="fwd-section-number">2</span> 도착 안내 · A/N</> : '도착통지서 (Arrival Notice)'}</h2>
          {!workspaceMode && <p>도착통지서가 없으면 거래는 진행 중으로 저장됩니다.</p>}
        </div>
        {headerAction}
      </div>
      {notice && <p className="import-notice">{notice}</p>}
      {disabledReason && showDisabledReason && <p className="fwd-document-lock" role="status">{disabledReason}</p>}
      {displayValue ? (
        <div className="arrival-notice-file">
          <FileText size={20} />
          <div><strong>{displayValue.fileName}</strong><span>{(displayValue.sizeBytes / 1024).toFixed(1)} KB · {displayValue.mimeType}</span></div>
          {fileActions}
          {!readOnly && !disabledReason && <button type="button" disabled={busy} className="icon-btn import-delete" title="도착통지서 삭제" aria-label="도착통지서 삭제" onClick={() => void removeFile()}><Trash2 size={16} /></button>}
        </div>
      ) : readOnly && !disabledReason ? (
        <p className="import-empty">첨부된 도착통지서가 없습니다.</p>
      ) : (
        <label className={`arrival-notice-picker${disabledReason ? ' is-locked' : ''}`}>
          <Paperclip size={20} />
          <span><strong>{busy ? '업로드 중' : workspaceMode ? '기존 서류 첨부' : '도착통지서 첨부'}</strong><small>{workspaceMode ? 'PDF · 이미지 · DOCX' : '업로드가 완료된 Storage 경로만 거래에 저장합니다.'}</small></span>
          {/* 포워더가 워크스페이스에서 발행한 A/N(DOCX)도 그대로 보관할 수 있게 허용 */}
          <input disabled={busy || readOnly || Boolean(disabledReason)} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={(event) => void selectFile(event.target.files?.[0])} />
        </label>
      )}
      {error && <div className="form-message error" role="alert">{error}</div>}
    </section>
  );
}
