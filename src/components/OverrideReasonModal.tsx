import type { ValidationIssue } from '../types';

interface Props {
  issue: ValidationIssue;
  reason: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 경고를 무시하고 생성할 때 사유를 적는 모달 — 사유는 문서 이력에 남는다. */
export default function OverrideReasonModal({ issue, reason, onReasonChange, onCancel, onConfirm }: Props) {
  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 92vw)', background: '#fff', borderRadius: 14, padding: '22px 24px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800 }}>경고 무시하고 생성 — 사유 입력</h3>
        <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b' }}>이 경고를 무시하고 문서를 생성합니다. 입력한 사유는 문서 이력에 기록되어 본인·관리자 사후 검토에 활용됩니다.</p>
        <div style={{ margin: '10px 0 12px', padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
          <strong>[{issue.id}]</strong> {issue.message}
        </div>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder={"예:\n· 관세사와 협의됨 — 현재 상태로 신고 진행\n· 보세운송 건으로 동일국가 항구가 정상\n· 사업자번호 확정 전 초안만 생성"}
          style={{ width: '100%', minHeight: 88, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button className="btn btn-secondary" onClick={onCancel}>취소</button>
          <button className="btn btn-primary" onClick={onConfirm}>사유 기록하고 생성</button>
        </div>
      </div>
    </div>
  );
}
