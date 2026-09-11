import { useState } from 'react';

export default function ForwarderCompletionForm({ busy, onCancel, onConfirm }: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reference: string, releasedOn: string) => Promise<void>;
}) {
  const [reference, setReference] = useState('');
  const [releasedOn, setReleasedOn] = useState('');
  const [checked, setChecked] = useState(false);
  const today = new Date();
  const maxDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return <form className="form-card import-card fwd-completion-form" onSubmit={(e) => {
    e.preventDefault();
    if (!busy && checked && reference.trim() && releasedOn && releasedOn <= maxDate) void onConfirm(reference.trim(), releasedOn);
  }}>
    <h2>수입 업무 완료 기록</h2>
    <p className="fwd-caption">담당자가 확인한 근거를 저장합니다. 시뮬레이션 조회 결과는 실제 통관 증빙이 아닙니다.</p>
    <label>신고수리 확인 근거<textarea autoFocus required value={reference} onChange={(e) => setReference(e.target.value)} placeholder="신고번호 또는 관세사 확인 내역 · 확인 일자와 문서명" /></label>
    <label>반출 확인일<input required type="date" max={maxDate} value={releasedOn} onChange={(e) => setReleasedOn(e.target.value)} /></label>
    <label className="fwd-confirm-check"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} required />실제 신고수리와 화물 반출을 확인했습니다.</label>
    <div className="fwd-inline-actions"><button className="btn btn-secondary" type="button" onClick={onCancel} disabled={busy}>취소</button><button className="btn btn-primary" disabled={busy || !checked || !reference.trim() || !releasedOn || releasedOn > maxDate}>기록 저장 · 업무 완료</button></div>
  </form>;
}
