import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileText, FileUp, Trash2 } from 'lucide-react';
import {
  classifyImportDocument,
  IMPORT_DOCUMENT_TYPE_LABELS,
} from '../../services/importDocumentAnalysisService';
import type { ImportDocumentMeta, ImportDocumentType } from '../../types/importTrade';

const ACCEPT = '.pdf,.png,.jpg,.jpeg';
const MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const TYPE_LABELS: Record<ImportDocumentType, string> = IMPORT_DOCUMENT_TYPE_LABELS;

/**
 * 이번 버전의 서류 분석은 해상운송(B/L) 기준이다.
 * 항공운송장은 검증 규칙(총중량·포장 수량 대조 기준, 운송 정보 항목)이 달라 아직 다루지 않으므로,
 * 파일명으로 항공운송장이 짐작되면 지원 범위를 먼저 알려준다.
 */
const AIR_WAYBILL_HINT = /항공\s*화물\s*운송장|항공\s*운송장|AIR\s*WAY\s*BILL|AIRWAYBILL|\bAWB\b|\bMAWB\b|\bHAWB\b/i;

interface Props {
  documents: ImportDocumentMeta[];
  onChange: (documents: ImportDocumentMeta[]) => void;
  onFilesAdded: (files: Array<{ id: string; file: File }>) => void;
  onFileRemoved: (document: ImportDocumentMeta) => Promise<void>;
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
  // 지원 범위 안내는 오류가 아니므로 경고 톤으로 구분해 보여준다.
  const [messageTone, setMessageTone] = useState<'error' | 'warning'>('error');
  const [dragging, setDragging] = useState(false);

  const addFiles = async (files: File[], forcedType?: ImportDocumentType) => {
    setMessage('');
    const invalid = files.filter((file) => !MIME_TYPES.includes(file.type) && !/\.(pdf|png|jpe?g)$/i.test(file.name));
    if (invalid.length) {
      setMessageTone('error');
      setMessage('PDF, PNG, JPG, JPEG 파일만 업로드할 수 있습니다.');
      return;
    }
    if (files.some((file) => AIR_WAYBILL_HINT.test(file.name))) {
      setMessageTone('warning');
      setMessage('항공화물운송장(AWB)은 현재 지원하지 않습니다. 이번 버전은 해상운송 B/L 기준으로 수입서류를 검토합니다.');
    }
    const fresh = files.filter((file) => !documents.some(
      (document) => document.name === file.name
        && document.size === file.size
        && (!forcedType || document.type === forcedType),
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

  const remove = async (document: ImportDocumentMeta) => {
    if (!window.confirm(`${document.name} 파일을 목록에서 삭제할까요?`)) return;
    setMessage('');
    try {
      await onFileRemoved(document);
      onChange(documents.filter((item) => item.id !== document.id));
    } catch (error) {
      setMessageTone('error');
      setMessage(error instanceof Error ? error.message : '파일을 삭제하지 못했습니다.');
    }
  };

  const renderFiles = (type?: ImportDocumentType) => {
    const filtered = type ? documents.filter((document) => document.type === type) : documents;
    if (!filtered.length) return <p className="import-empty">첨부된 파일이 없습니다.</p>;
    return filtered.map((document) => (
      <div className="import-document-row" key={document.id}>
        <FileText className="import-document-icon" size={18} aria-hidden="true" />
        <div className="import-document-content">
          <strong className="import-document-type">{TYPE_LABELS[document.type]}</strong>
          <span className="import-document-file-name" title={document.name}>{document.name}</span>
          <span className="import-document-meta">
            {(document.size / 1024).toFixed(1)} KB
            {' · '}
            {document.uploadStatus === 'uploaded' && document.analysisStatus === 'pending'
              ? '업로드 완료'
              : document.analysisStatus === 'success'
              ? '분석 성공'
              : document.analysisStatus === 'error'
                ? `분석 실패${document.errorMessage ? `: ${document.errorMessage}` : ''}`
                : document.analysisStatus === 'analyzing' ? '분석 중' : '분석 대기'}
          </span>
        </div>
        <div className="import-document-actions">
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
          <button type="button" className="icon-btn import-delete" title="파일 삭제" aria-label={`${document.name} 삭제`} onClick={() => void remove(document)}>
            <Trash2 size={14} />
          </button>
        </div>
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
        {/* 이번 버전의 지원 범위 — 해상운송(B/L) 기준임을 업로드 전에 알려준다. */}
        <p className="import-scope-note">현재 수입 서류 분석은 해상운송(B/L) 기준으로 지원합니다. 항공운송(AWB)은 추후 지원 예정입니다.</p>
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
      {message && <div className={`form-message ${messageTone}`} role="alert">{message}</div>}
      <div className="import-document-list">{renderFiles()}</div>
    </section>
  );
}
