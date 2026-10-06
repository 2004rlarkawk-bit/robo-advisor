import { useMemo, useState } from 'react';
import { CornerUpLeft } from 'lucide-react';
import ForwarderReturnRequestContent, { buildReturnRequestLetter } from './ForwarderReturnRequestContent';
import { HANDOFF_REQUIRED_DOCUMENTS } from '../../utils/importHandoffReadiness';
import {
  buildReturnRequestBody,
  RETURN_REQUEST_DOCUMENTS,
  RETURN_REQUEST_REASON_ORDER,
  RETURN_REQUEST_REASONS,
  returnRequestDocumentLabel,
  type ReturnRequestDocumentType,
  type ReturnRequestReason,
} from '../../utils/returnRequestDocuments';
import '../../styles/returnRequest.css';

export interface ComposedReturnRequest {
  reason: string;
  documentTypes: string[];
  issueTitles: string[];
}

interface Props {
  /** 화주가 실제로 올린 서류 종류 — 없는 필수 서류는 '서류 누락'으로 미리 골라 둔다. */
  presentTypes: string[];
  issuerName: string;
  senderContactName: string;
  saving: boolean;
  onCancel: () => void;
  onSend: (request: ComposedReturnRequest) => void;
}

/**
 * 포워더가 화주에게 보낼 보완 요청을 서류 단위로 고른다.
 * 값 비교 이슈가 아니라, 포워더가 원본을 보고 판단한 서류와 사유가 요청 내용이 된다.
 */
export default function ReturnRequestComposer({ presentTypes, issuerName, senderContactName, saving, onCancel, onSend }: Props) {
  const present = useMemo(() => new Set(presentTypes), [presentTypes]);
  const [picked, setPicked] = useState<Partial<Record<ReturnRequestDocumentType, ReturnRequestReason>>>(() => {
    const initial: Partial<Record<ReturnRequestDocumentType, ReturnRequestReason>> = {};
    for (const type of HANDOFF_REQUIRED_DOCUMENTS) {
      if (!present.has(type)) initial[type as ReturnRequestDocumentType] = 'missing';
    }
    return initial;
  });
  const [memo, setMemo] = useState('');

  const items = RETURN_REQUEST_DOCUMENTS
    .filter((doc) => picked[doc.type])
    .map((doc) => ({ type: doc.type, reason: picked[doc.type]! }));
  const letter = items.length
    ? buildReturnRequestLetter(buildReturnRequestBody(items, memo), issuerName, senderContactName)
    : '';

  const toggle = (type: ReturnRequestDocumentType, checked: boolean) => {
    setPicked((current) => {
      const next = { ...current };
      if (checked) next[type] = present.has(type) ? 'unreadable' : 'missing';
      else delete next[type];
      return next;
    });
  };

  return (
    <section className="form-card import-card rr-composer" aria-label="서류 보완 요청 작성">
      <div className="import-card-heading">
        <div>
          <h2>서류 보완 요청</h2>
          <p>보완이 필요한 서류와 사유를 고르세요. 화주에게 알림과 함께 전달됩니다.</p>
        </div>
      </div>

      <ul className="rr-doc-list">
        {RETURN_REQUEST_DOCUMENTS.map((doc) => {
          const reason = picked[doc.type];
          const submitted = present.has(doc.type);
          return (
            <li key={doc.type} className={reason ? 'is-picked' : ''}>
              <label className="rr-doc-check">
                <input
                  type="checkbox"
                  checked={Boolean(reason)}
                  onChange={(event) => toggle(doc.type, event.target.checked)}
                />
                <span className="rr-doc-name">{doc.label}</span>
                {doc.type !== 'other' && (
                  <span className={`rr-doc-state${submitted ? '' : ' is-missing'}`}>{submitted ? '제출됨' : '미제출'}</span>
                )}
              </label>
              <select
                className="form-input rr-doc-reason"
                aria-label={`${doc.label} 보완 사유`}
                value={reason ?? ''}
                disabled={!reason}
                onChange={(event) => setPicked((current) => ({ ...current, [doc.type]: event.target.value as ReturnRequestReason }))}
              >
                {!reason && <option value="">사유 선택</option>}
                {RETURN_REQUEST_REASON_ORDER.map((key) => (
                  <option key={key} value={key}>{RETURN_REQUEST_REASONS[key].label}</option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>

      <label className="form-group rr-memo">
        <span className="form-label">전달 메모 (선택)</span>
        <textarea
          className="form-input"
          rows={2}
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="예: P/L 총 수량이 C/I와 같은지 확인 후 다시 올려 주세요."
        />
      </label>

      {letter && (
        <details className="fwd-return-letter-preview" open>
          <summary>화주에게 보일 요청문</summary>
          <ForwarderReturnRequestContent reason={letter} />
        </details>
      )}

      <div className="rr-actions">
        <button type="button" className="btn btn-secondary" disabled={saving} onClick={onCancel}>취소</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || items.length === 0}
          onClick={() => onSend({
            reason: letter,
            documentTypes: items.map((item) => item.type),
            issueTitles: items.map((item) => `${returnRequestDocumentLabel(item.type)} · ${RETURN_REQUEST_REASONS[item.reason].label}`),
          })}
        >
          <CornerUpLeft size={15} /> {saving ? '보내는 중…' : `보완 요청 보내기 (${items.length}건)`}
        </button>
      </div>
    </section>
  );
}
