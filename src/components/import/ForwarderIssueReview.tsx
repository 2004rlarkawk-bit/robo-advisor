import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Info } from 'lucide-react';
import type { ForwarderCaseIssue } from '../../types/forwarderCase';
import type { ImportComparisonRow, ImportDocumentMeta } from '../../types/importTrade';
import { getIssueComparisons } from '../../utils/forwarderIssueComparisons';
import { comparisonOutliers } from '../../utils/comparisonOutliers';
import { getIssueDocuments } from '../../utils/forwarderIssueDocuments';
import { IMPORT_DOCUMENT_TYPE_LABELS } from '../../services/importDocumentAnalysisService';

type Group = 'required' | 'recommended' | 'done';
const GROUPS = [
  { id: 'required', label: '필수 확인', Icon: AlertTriangle },
  { id: 'recommended', label: '권장 사항', Icon: Info },
  { id: 'done', label: '확인 완료', Icon: CheckCircle2 },
] as const;

export function issueReviewGroup(issue: ForwarderCaseIssue): Group {
  return issue.resolved ? 'done' : issue.severity === 'blocker' ? 'required' : 'recommended';
}

interface Props {
  issues: ForwarderCaseIssue[];
  notes: Record<string, string>;
  saving: boolean;
  documents?: ImportDocumentMeta[];
  comparisons?: ImportComparisonRow[];
  documentBusyId?: string | null;
  onOpenDocument?: (document: ImportDocumentMeta) => void;
  requestPicks?: Record<string, boolean>;
  onToggleRequest?: (issue: ForwarderCaseIssue, checked: boolean) => void;
  onResolve: (issue: ForwarderCaseIssue, note: string) => Promise<boolean>;
  onReopen: (issue: ForwarderCaseIssue) => Promise<boolean>;
}

/** Presentation only: keep every issue ID and existing resolution semantics intact. */
export default function ForwarderIssueReview({ issues, notes, saving, documents = [], comparisons = [], documentBusyId = null, onOpenDocument, requestPicks = {}, onToggleRequest, onResolve, onReopen }: Props) {
  const [filter, setFilter] = useState<Group>(() =>
    issues.some((issue) => issueReviewGroup(issue) === 'required') ? 'required'
      : issues.some((issue) => issueReviewGroup(issue) === 'recommended') ? 'recommended' : 'done');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const pendingCount = issues.filter((issue) => !issue.resolved).length;
  const visible = issues.filter((issue) => issueReviewGroup(issue) === filter);

  return <div className="fwd-review-panel">
    <div className="import-card-heading">
      <div><h2>서류 검토 사항</h2></div>
      <span className="fwd-review-count">미확인 {pendingCount}건</span>
    </div>
    <div className="fwd-review-filters" role="group" aria-label="검토 사항 분류">
      {GROUPS.map(({ id, label, Icon }) => <button key={id} type="button" className={`fwd-review-filter is-${id}`} aria-pressed={filter === id} onClick={() => { setFilter(id); setExpandedId(null); setFeedback(''); }}>
        <Icon size={18} aria-hidden="true"/><span>{label}</span><strong>{issues.filter((issue) => issueReviewGroup(issue) === id).length}</strong>
      </button>)}
    </div>
    <div className="fwd-review-items">
      {visible.map((issue) => {
        const evidence = getIssueDocuments(issue, documents);
        const shownDocuments = evidence.length ? evidence : documents;
        return <div className={`fwd-review-item is-${filter}`} key={issue.id}>
        <div className="fwd-review-row">
          {onToggleRequest && !issue.resolved && issue.severity !== 'info'
            ? <input className="fwd-review-pick" type="checkbox" aria-label={`${issue.title} 보완 요청 선택`} checked={Boolean(requestPicks[issue.id])} disabled={saving} onChange={event => onToggleRequest(issue, event.target.checked)} />
            : <span className="fwd-review-dot" aria-hidden="true"/>}
          <div className="fwd-review-summary"><span className="fwd-review-name">{issue.title}{issue.severity === 'info' && <small>참고</small>}</span><p className="fwd-review-description">{issue.detail}</p></div>
          <button type="button" className="fwd-review-toggle" aria-label={`${issue.title} ${expandedId === issue.id ? '검토 닫기' : issue.resolved ? '기록 보기' : '검토하기'}`} aria-expanded={expandedId === issue.id} aria-controls={`fwd-review-${issue.id}`} onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}>
            <span className="fwd-review-open">{expandedId === issue.id ? '접기' : issue.resolved ? '기록 보기' : '검토하기'}</span><ChevronDown size={16} aria-hidden="true"/>
          </button>
        </div>
        <div className="fwd-review-detail" id={`fwd-review-${issue.id}`} hidden={expandedId !== issue.id}>
          {getIssueComparisons(issue, comparisons).map((row) => {
            const outliers = comparisonOutliers(row);
            return <div className="fwd-issue-comparison" key={row.field}>
              <h3>{row.field} · 서류별 비교값 <span className={`match-badge ${row.matches ? 'match' : 'mismatch'}`}>{row.matches ? '일치' : '불일치'}</span></h3>
              <dl>
                <div><dt>C/I · 상업송장</dt><dd className={outliers.has('invoice') ? 'mismatch-value' : undefined}>{row.invoice || '추출값 없음'}</dd></div>
                <div><dt>P/L · 포장명세서</dt><dd className={outliers.has('packingList') ? 'mismatch-value' : undefined}>{row.packingList || '추출값 없음'}</dd></div>
                <div><dt>B/L · 선하증권</dt><dd className={outliers.has('billOfLading') ? 'mismatch-value' : undefined}>{row.billOfLading || '추출값 없음'}</dd></div>
              </dl>
              {row.detail && <p>{row.detail}</p>}
            </div>;
          })}
          <div className="fwd-review-evidence">
            <h3>{evidence.length ? '근거 서류' : '제출 서류'}</h3>
            {!evidence.length && <p className="fwd-review-source-hint">{documents.length ? '연결된 근거 서류가 지정되지 않았습니다. 제출 서류에서 직접 확인하세요.' : '등록된 원본 서류가 없습니다.'}</p>}
            <div className="fwd-review-source-list">{shownDocuments.map((document) => {
              const available = Boolean(document.storageBucket && document.storagePath && onOpenDocument);
              return <button type="button" className="fwd-review-source" key={document.id} disabled={!available || documentBusyId !== null} title={document.name} onClick={() => onOpenDocument?.(document)}>
                <span><strong>{IMPORT_DOCUMENT_TYPE_LABELS[document.type] ?? '서류'}</strong><small>{document.name}</small></span><span>{!available ? '원본 없음' : documentBusyId === document.id ? '여는 중…' : '원본 열기'}</span><ExternalLink size={14} aria-hidden="true"/>
              </button>;
            })}</div>
          </div>
          {issue.resolved ? <>
            {notes[issue.id] && <p className="fwd-issue-note">검토 기록 · {notes[issue.id]}</p>}
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={async () => { if (await onReopen(issue)) { setExpandedId(null); setFeedback('확인을 취소했습니다. 해당 검토 분류에서 다시 확인할 수 있습니다.'); } }}>완료 취소</button>
          </> : <>
            <label htmlFor={`fwd-review-note-${issue.id}`} className="form-label">검토 메모 <span className="fwd-review-optional">{issue.severity === 'blocker' ? '(문제없음 판단 시 필수)' : '(선택)'}</span></label>
            <textarea id={`fwd-review-note-${issue.id}`} className="form-input" rows={2} value={drafts[issue.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [issue.id]: event.target.value }))} placeholder="원문 확인 결과나 판단 근거를 기록하세요."/>
            <div className="fwd-review-detail-actions">
              <button type="button" className="btn btn-primary" disabled={saving || Boolean(requestPicks[issue.id]) || (issue.severity === 'blocker' && !(drafts[issue.id] ?? '').trim())} onClick={async () => { if (await onResolve(issue, (drafts[issue.id] ?? '').trim())) { setExpandedId(null); setDrafts((current) => ({ ...current, [issue.id]: '' })); setFeedback('검토 결과를 저장했습니다. 확인 완료에서 볼 수 있습니다.'); } }}><CheckCircle2 size={15} aria-hidden="true"/>문제없음으로 확인</button>
            </div>
          </>}
        </div>
      </div>;})}
      {visible.length === 0 && <p className="fwd-review-empty">{filter === 'done' ? '아직 확인 완료한 항목이 없습니다.' : '이 분류에 남은 검토 항목이 없습니다.'}</p>}
    </div>
    {feedback && <p className="fwd-review-feedback" role="status">{feedback}</p>}
  </div>;
}
