import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileText, FileUp, Sparkles, Trash2 } from 'lucide-react';
import { classifyImportDocument } from '../services/importDocumentAnalysisService';
import {
  analyzeForwarderAttachments,
  type ForwarderDocumentConflict,
} from '../services/forwarderDocumentAnalysisService';
import type {
  TradeAttachment,
  TradeAttachmentDocumentType,
} from '../types/tradeFormData';
import {
  removeTradeAttachment,
  uploadTradeAttachment,
} from '../services/tradeAttachmentStorageService';
import type { ForwarderFormState } from '../utils/forwarderForm';

const ACCEPTED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const DOCUMENT_OPTIONS: Array<{ value: TradeAttachmentDocumentType; label: string }> = [
  { value: 'commercial_invoice', label: 'C/I' },
  { value: 'packing_list', label: 'P/L' },
  { value: 'bill_of_lading', label: 'B/L' },
  { value: 'certificate_of_origin', label: 'C/O' },
  { value: 'other', label: '기타서류' },
];
const FIELD_LABELS: Partial<Record<keyof ForwarderFormState, string>> = {
  companyName: 'Shipper 회사명',
  companyAddress: 'Shipper 주소',
  partnerName: 'Consignee 회사명',
  partnerAddress: 'Consignee 주소',
  vesselOrFlight: 'Vessel',
  voyageNo: 'Voyage No.',
  loadPort: 'POL',
  dischargePort: 'POD',
  departureDate: 'ETD',
  arrivalDate: 'ETA',
  notifyPartyName: 'Notify Party',
  containerNo: 'Container No.',
  sealNo: 'Seal No.',
  itemName: 'Description of Goods',
  packageCount: 'Number of Packages',
  packageType: 'Kind of Packages',
  grossWeight: 'Gross Weight',
};

interface Props {
  userId: string;
  scopeId: string;
  attachments: TradeAttachment[];
  onChange: (attachments: TradeAttachment[]) => void;
  onApplyAnalysis?: (
    values: Partial<ForwarderFormState>,
    sourceFiles: Record<string, string>,
  ) => ForwarderDocumentConflict[];
}

function acceptedFile(file: File): boolean {
  return ACCEPTED_MIME_TYPES.has(file.type) || /\.(pdf|png|jpe?g)$/i.test(file.name);
}

export default function TradeAttachmentUploader({
  userId,
  scopeId,
  attachments,
  onChange,
  onApplyAnalysis,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'info' | 'error'>('info');
  const [conflicts, setConflicts] = useState<ForwarderDocumentConflict[]>([]);

  const addFiles = async (files: File[]) => {
    if (!files.length || busy) return;
    const invalid = files.filter((file) => !acceptedFile(file));
    if (invalid.length) {
      setMessageKind('error');
      setMessage('PDF, PNG, JPEG 파일만 업로드할 수 있습니다.');
      return;
    }
    const fresh = files.filter((file) => !attachments.some(
      (attachment) => attachment.fileName === file.name
        && attachment.sizeBytes === file.size,
    ));
    if (!fresh.length) {
      setMessageKind('info');
      setMessage('이미 첨부된 파일입니다.');
      return;
    }

    setBusy(true);
    setMessage('');
    const uploaded: TradeAttachment[] = [];
    const nextPending: Record<string, File> = {};
    const failed: string[] = [];
    for (const file of fresh) {
      try {
        const classified = await classifyImportDocument(file);
        const documentType: TradeAttachmentDocumentType = classified === 'unknown'
          ? 'other'
          : classified;
        const attachment = await uploadTradeAttachment({
          userId,
          scopeId,
          documentType,
          file,
        });
        uploaded.push(attachment);
        nextPending[attachment.id] = file;
      } catch {
        failed.push(file.name);
      }
    }
    if (uploaded.length > 0) {
      setPendingFiles((current) => ({ ...current, ...nextPending }));
      onChange([...attachments, ...uploaded]);
    }
    if (failed.length > 0) {
      setMessageKind('error');
      setMessage(`일부 파일을 업로드하지 못했습니다: ${failed.join(', ')}`);
    } else {
      setMessageKind('info');
      setMessage(`${uploaded.length}개 파일을 업로드했습니다. AI 분석으로 빈 입력값을 자동 채울 수 있습니다.`);
    }
    setBusy(false);
  };

  const analyze = async () => {
    if (!attachments.length || busy) return;
    setBusy(true);
    setMessageKind('info');
    setMessage('첨부 문서를 AI로 분석하고 있습니다.');
    setConflicts([]);
    try {
      const result = await analyzeForwarderAttachments(attachments, pendingFiles, userId);
      const reclassified = attachments.map((attachment) => ({
        ...attachment,
        documentType: result.classifications[attachment.id] ?? attachment.documentType,
      }));
      if (reclassified.some((attachment, index) =>
        attachment.documentType !== attachments[index].documentType)) {
        onChange(reclassified);
      }
      const userConflicts = onApplyAnalysis?.(result.values, result.sourceFiles) ?? [];
      const nextConflicts = [...userConflicts, ...result.documentConflicts];
      setConflicts(nextConflicts);
      const conflictCount = nextConflicts.length;
      const appliedCount = Object.keys(result.values).length - userConflicts.length;
      const parts = [`빈 필드 ${Math.max(0, appliedCount)}개를 자동 입력했습니다.`];
      if (conflictCount > 0) parts.push(`기존 값 또는 문서 간 충돌 ${conflictCount}개는 덮어쓰지 않았습니다.`);
      if (result.failures.length > 0) {
        parts.push(`분석 실패 ${result.failures.length}개: ${result.failures.map(({ fileName }) => fileName).join(', ')}`);
      }
      setMessageKind(result.failures.length === attachments.length ? 'error' : 'info');
      setMessage(parts.join(' '));
    } catch (error) {
      setMessageKind('error');
      setMessage(error instanceof Error
        ? error.message
        : 'AI 문서 분석에 실패했습니다. 첨부파일은 유지되며 수동 입력할 수 있습니다.');
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
      setPendingFiles((current) => {
        const next = { ...current };
        delete next[attachment.id];
        return next;
      });
      onChange(attachments.filter(({ id }) => id !== attachment.id));
    } catch {
      setMessageKind('error');
      setMessage('첨부파일을 삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <section className="forwarder-attachment-uploader">
      <div
        className={`import-drop-zone ${dragging ? 'dragging' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <FileUp size={32} />
        <h3>수출 서류를 한 번에 첨부해 주세요</h3>
        <p>C/I, P/L, B/L, C/O 및 기타서류 · PDF, PNG, JPEG</p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? '처리 중…' : '여러 파일 선택'}
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
      <div className="import-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || attachments.length === 0 || !onApplyAnalysis}
          onClick={() => void analyze()}
        >
          <Sparkles size={16} /> {busy ? 'AI 분석 중…' : 'AI 분석 및 빈 필드 자동입력'}
        </button>
      </div>
      {message && <div className={`form-message ${messageKind}`} role="status">{message}</div>}
      {conflicts.length > 0 && (
        <div className="form-message warning" role="status">
          <strong>자동입력 충돌값은 기존 입력을 유지했습니다.</strong>
          <ul>
            {conflicts.map((conflict, index) => (
              <li key={`${String(conflict.field)}-${conflict.sourceFileName}-${index}`}>
                {FIELD_LABELS[conflict.field] || String(conflict.field)}:
                {' '}{String(conflict.currentValue)} ↔ {String(conflict.analyzedValue)}
                {' '}({conflict.sourceFileName})
              </li>
            ))}
          </ul>
        </div>
      )}
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
            <select
              aria-label={`${attachment.fileName} 문서 종류`}
              value={attachment.documentType === 'arrival_notice' ? 'other' : attachment.documentType}
              onChange={(event) => onChange(attachments.map((item) => item.id === attachment.id
                ? { ...item, documentType: event.target.value as TradeAttachmentDocumentType }
                : item))}
            >
              {DOCUMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
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
