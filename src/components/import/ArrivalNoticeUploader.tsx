import { FileText, Paperclip, Trash2 } from 'lucide-react';
import type { ArrivalNoticeMeta } from '../../types/importTrade';

interface Props {
  value: ArrivalNoticeMeta | null;
  onChange: (value: ArrivalNoticeMeta | null) => void;
}

export default function ArrivalNoticeUploader({ value, onChange }: Props) {
  const selectFile = (file?: File) => {
    if (!file) return;
    onChange({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      uploadedAt: new Date().toISOString(),
    });
  };

  return (
    <section className="form-card import-card arrival-notice-card">
      <div className="import-card-heading">
        <div><span className="ai-badge">별도 첨부</span><h2>도착통지서 (Arrival Notice)</h2></div>
        <p>도착통지서가 없으면 거래는 진행 중으로 저장됩니다.</p>
      </div>
      {value ? (
        <div className="arrival-notice-file">
          <FileText size={20} />
          <div><strong>{value.fileName}</strong><span>{(value.size / 1024).toFixed(1)} KB · {value.mimeType}</span></div>
          <button type="button" className="icon-btn import-delete" title="도착통지서 삭제" aria-label="도착통지서 삭제" onClick={() => window.confirm('도착통지서를 삭제할까요?') && onChange(null)}><Trash2 size={16} /></button>
        </div>
      ) : (
        <label className="arrival-notice-picker">
          <Paperclip size={20} />
          <span><strong>도착통지서 첨부</strong><small>현재는 파일 메타데이터만 저장하며 실제 Storage 업로드는 연결 전입니다.</small></span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => selectFile(event.target.files?.[0])} />
        </label>
      )}
    </section>
  );
}
