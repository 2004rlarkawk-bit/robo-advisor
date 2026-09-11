import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ForwarderCaseIssue, ForwarderCaseState } from '../../types/forwarderCase';
import { formatForwarderDate } from '../../utils/forwarderPresentation';

interface Props {
  issues: ForwarderCaseIssue[];
  notes: ForwarderCaseState['issueNotes'];
  busy: boolean;
  readOnly: boolean;
  onResolve: (issue: ForwarderCaseIssue, note: string, resolved: boolean) => Promise<boolean>;
}

export default function ForwarderIssueList({ issues, notes, busy, readOnly, onResolve }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const groups = [
    { label: '우선 확인', items: issues.filter((i) => !i.resolved && i.severity === 'blocker'), open: true },
    { label: '확인 필요', items: issues.filter((i) => !i.resolved && i.severity === 'check'), open: false },
    { label: '참고 사항', items: issues.filter((i) => !i.resolved && i.severity === 'info'), open: false },
    { label: '처리한 항목', items: issues.filter((i) => i.resolved), open: false },
  ];
  return <>{groups.filter((g) => g.items.length > 0).map((group) => (
    <details key={group.label} className="fwd-issue-group" open={group.open}>
      <summary>{group.label}<span>{group.items.length}건</span></summary>
      <div className="fwd-issue-list">{group.items.map((issue) => (
        <div key={issue.id} className={`fwd-issue is-${issue.severity}${issue.resolved ? ' is-resolved' : ''}`}>
          <div className="fwd-issue-body">
            <strong className="fwd-issue-title">{issue.title}</strong>
            <p className="fwd-issue-detail">{issue.detail}</p>
            {issue.resolved && <p className="fwd-resolution-note">{notes?.[issue.id]
              ? `처리 근거: ${notes[issue.id].note} · ${formatForwarderDate(notes[issue.id].confirmedAt)}`
              : '기존 확인 기록 · 처리 근거가 등록되지 않았습니다.'}</p>}
            {editing === issue.id && <form className="fwd-resolution-form" onSubmit={(e) => {
              e.preventDefault();
              if (note.trim()) void onResolve(issue, note.trim(), true).then((saved) => { if (saved) setEditing(null); });
            }}>
              <label>확인 근거<textarea autoFocus required value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 수정 P/L 수신 후 총중량 재확인. 관련 문서와 확인 내용을 적어 주세요." /></label>
              <div className="fwd-inline-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setEditing(null)}>취소</button><button className="btn btn-primary" disabled={busy || !note.trim()}>근거 저장 · 확인 완료</button></div>
            </form>}
          </div>
          {!readOnly && editing !== issue.id && <button type="button" className="fwd-issue-check" disabled={busy} onClick={() => {
            if (issue.resolved) void onResolve(issue, '', false);
            else { setEditing(issue.id); setNote(''); }
          }}><CheckCircle2 size={14} />{issue.resolved ? '확인 취소' : '검토 기록'}</button>}
        </div>
      ))}</div>
    </details>
  ))}</>;
}
