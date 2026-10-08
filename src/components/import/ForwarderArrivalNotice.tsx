import { useEffect, useRef, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import type { ForwarderImportCase } from '../../types/forwarderCase';
import type { ArrivalNoticeMeta } from '../../types/importTrade';
import {
  buildArrivalNoticeDocx, downloadArrivalNoticeDocx, printArrivalNoticeAsPdf, renderArrivalNoticePreview,
} from '../../services/arrivalNoticeDocxService';
import { loadTradeAttachmentFile } from '../../services/tradeAttachmentStorageService';
import ArrivalNoticeUploader from './ArrivalNoticeUploader';

interface Props {
  item: ForwarderImportCase;
  userId: string;
  issuerName: string;
  contactName: string;
  locked: boolean;
  saving: boolean;
  lockReason: string;
  onChange: (value: ArrivalNoticeMeta | null) => void;
}

/** 생성한 A/N을 먼저 확인하고 내려받는다. 외부에서 발급받은 원본 첨부는 별도로 유지한다. */
export default function ForwarderArrivalNotice({ item, userId, issuerName, contactName, locked, saving, lockReason, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const previewHost = useRef<HTMLDivElement>(null);
  const readOnly = locked || saving;

  useEffect(() => {
    if (!previewBlob || !previewHost.current) return;
    void renderArrivalNoticePreview(previewBlob, previewHost.current).catch(() => {
      setError('도착안내서 미리보기를 열지 못했습니다. 다시 시도해 주세요.');
      setPreviewBlob(null);
    });
  }, [previewBlob]);

  const documentAction = async (format: 'preview' | 'docx' | 'pdf') => {
    if (busy) return;
    if (format === 'preview' && previewBlob) { setPreviewBlob(null); return; }
    setBusy(true); setError('');
    try {
      if (format === 'preview') setPreviewBlob(await buildArrivalNoticeDocx(item, issuerName, contactName));
      else if (format === 'docx') await downloadArrivalNoticeDocx(item, issuerName, contactName);
      else await printArrivalNoticeAsPdf(item, issuerName, contactName);
    } catch {
      setError(format === 'pdf' ? 'PDF 저장 창을 열지 못했습니다. 다시 시도해 주세요.' : '도착안내서를 생성하지 못했습니다. 다시 시도해 주세요.');
    } finally { setBusy(false); }
  };

  const openOriginal = async (meta: ArrivalNoticeMeta, download: boolean) => {
    if (!meta.storageBucket || !meta.storagePath || fileBusy) return;
    const previewWindow = download ? null : window.open('', '_blank');
    if (previewWindow) previewWindow.opener = null;
    setFileBusy(true); setError('');
    try {
      const file = await loadTradeAttachmentFile({ storageBucket: meta.storageBucket, storagePath: meta.storagePath,
        fileName: meta.fileName, mimeType: meta.mimeType, documentType: 'arrival_notice' }, userId);
      const url = URL.createObjectURL(file);
      if (download) {
        const link = document.createElement('a'); link.href = url; link.download = meta.fileName;
        document.body.appendChild(link); link.click(); link.remove();
      } else if (previewWindow) previewWindow.location.href = url;
      else setError('팝업이 차단되었습니다. 다운로드를 이용해 주세요.');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      previewWindow?.close();
      setError('첨부한 도착통지서를 열지 못했습니다. 다시 시도해 주세요.');
    } finally { setFileBusy(false); }
  };

  return <ArrivalNoticeUploader
    workspaceMode
    showDisabledReason={false}
    disabledReason={locked ? lockReason : undefined}
    value={item.arrivalNotice}
    onChange={onChange}
    userId={userId}
    tradeId={item.tradeId}
    readOnly={readOnly}
    fileActions={item.arrivalNotice?.storagePath ? <div className="fwd-an-file-actions">
      <button type="button" className="btn btn-secondary" disabled={fileBusy} onClick={() => void openOriginal(item.arrivalNotice!, false)}>원본 열기</button>
      <button type="button" className="btn btn-secondary" disabled={fileBusy} onClick={() => void openOriginal(item.arrivalNotice!, true)}>다운로드</button>
    </div> : undefined}
  >
    <div className="document-preview-actions">
      <button type="button" className="btn btn-secondary" disabled={busy} aria-expanded={Boolean(previewBlob)} onClick={() => void documentAction('preview')}><Eye size={17} />{previewBlob ? '닫기' : '보기'}</button>
      <button type="button" className="btn btn-secondary" disabled={busy || readOnly} onClick={() => void documentAction('docx')}><Download size={17} />DOCX 다운로드</button>
      <button type="button" className="btn btn-primary" disabled={busy || readOnly} onClick={() => void documentAction('pdf')}><Download size={17} />PDF 저장</button>
    </div>
    {error && <p className="form-message error" role="alert">{error}</p>}
    {previewBlob && <div className="declaration-preview fwd-an-preview" ref={previewHost} aria-label="도착안내서 미리보기" />}
  </ArrivalNoticeUploader>;
}
