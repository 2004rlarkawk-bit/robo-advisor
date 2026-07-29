import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { classifyImportDocument } from '../../services/importDocumentAnalysisService';
import type { ImportDocumentMeta, ImportDocumentType } from '../../types/importTrade';

const ACCEPT = '.pdf,.png,.jpg,.jpeg';
const MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const TYPE_LABELS: Record<ImportDocumentType, string> = {
  commercial_invoice: 'Commercial Invoice (C/I)',
  packing_list: 'Packing List (P/L)',
  bill_of_lading: 'Bill of Lading (B/L)',
  certificate_of_origin: 'Certificate of Origin (C/O)',
  other: '기타서류',
  unknown: '기타서류',
};

interface Props {
  documents: ImportDocumentMeta[];
  onChange: (documents: ImportDocumentMeta[]) => void;
  onFilesAdded: (files: Array<{ id: string; file: File }>) => void;
  onFileRemoved: (id: string) => void;
  description: string;
  structured?: boolean;
}

export default function ImportDocumentUploader({
  documents,
  onChange,
  onFilesAdded,
  onFileRemoved,
  description,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);

  const addFiles = async (files: File[], forcedType?: ImportDocumentType) => {
    setMessage('');
    const invalid = files.filter((file) => !MIME_TYPES.includes(file.type) && !/\.(pdf|png|jpe?g)$/i.test(file.name));
    if (invalid.length) {
      setMessage('PDF, PNG, JPG, JPEG 파일만 업로드할 수 있습니다.');
      return;
    }
    const fresh = files.filter((file) => !documents.some(
      (document) => document.name === file.name && document.size === file.size && document.type === forcedType,
    ));
    const pending: ImportDocumentMeta[] = fresh.map((file) => {
      const id = crypto.randomUUID();
      return {
        id,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        type: forcedType ?? 'unknown',
        status: forcedType ? 'ready' : 'classifying',
        uploadStatus: 'ready',
        analysisStatus: 'pending',
        sourceId: id,
      };
    });
    onFilesAdded(pending.map((meta, index) => ({ id: meta.id, file: fresh[index] })));
    onChange([...documents, ...pending]);
    if (forcedType) return;
    const classified = await Promise.all(pending.map(async (meta, index) => ({
      ...meta,
      type: await classifyImportDocument(fresh[index]),
      status: 'ready' as const,
    })));
    onChange([...documents, ...classified]);
  };

  const remove = (document: ImportDocumentMeta) => {
    if (!window.confirm(`${document.name} 파일을 목록에서 삭제할까요?`)) return;
    onFileRemoved(document.id);
    onChange(documents.filter((item) => item.id !== document.id));
  };

  const renderFiles = (type?: ImportDocumentType) => {
    const filtered = type ? documents.filter((document) => document.type === type) : documents;
    if (!filtered.length) return <p className="import-empty">첨부된 파일이 없습니다.</p>;
    return filtered.map((document) => (
      <div className="import-document-row" key={document.id}>
        <div className="import-document-name" title={document.name}>
          <strong>{document.name}</strong>
          <span>
            {(document.size / 1024).toFixed(1)} KB · {TYPE_LABELS[document.type]}
            {' · '}
            {document.analysisStatus === 'success'
              ? '분석 성공'
              : document.analysisStatus === 'error'
                ? `분석 실패${document.errorMessage ? `: ${document.errorMessage}` : ''}`
                : document.analysisStatus === 'analyzing' ? '분석 중' : '분석 대기'}
          </span>
        </div>
        <select
          aria-label={`${document.name} 문서 종류`}
          value={document.type === 'unknown' ? 'other' : document.type}
          onChange={(event) => onChange(documents.map((item) => item.id === document.id
            ? { ...item, type: event.target.value as ImportDocumentType }
            : item))}
        >
          {Object.entries(TYPE_LABELS).filter(([value]) => value !== 'unknown').map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button type="button" className="icon-btn import-delete" title="파일 삭제" aria-label={`${document.name} 삭제`} onClick={() => remove(document)}>
          <Trash2 size={16} />
        </button>
      </div>
    ));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };
  return (
    <section className="form-card import-card">
      <div className={`import-drop-zone ${dragging ? 'dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
        <FileUp size={34} />
        <h3>수입 서류를 여기에 놓아주세요</h3>
        <p>{description}</p>
        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()}>파일 선택</button>
        <input
          ref={inputRef}
          hidden
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            void addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>
      {message && <div className="form-message error" role="alert">{message}</div>}
      <div className="import-document-list">{renderFiles()}</div>
    </section>
  );
}
