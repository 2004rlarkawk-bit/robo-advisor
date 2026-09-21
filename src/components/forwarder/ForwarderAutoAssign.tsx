import { useEffect, useMemo, useState } from 'react';
import { Check, UserCheck } from 'lucide-react';
import type { SavedTrade } from '../../types';
import type { ForwarderMatchCandidate } from '../../types/forwarderRequest';
import { matchForwarderForTrade } from '../../services/forwarderRequestService';
import { loadPortData } from '../../services/portLocodeService';
import {
  FORWARDER_SPECIALTIES,
  specialtyLabel,
  type ForwarderSpecialtyKey,
} from '../../utils/forwarderSpecialty';
import {
  countTradeReviewIssues,
  EXPERIENCE_PRIORITY_ISSUE_THRESHOLD,
  suggestSpecialtiesForTrade,
  type SpecialtySuggestion,
} from '../../utils/forwarderSpecialtySuggestion';

interface Props {
  trade: SavedTrade;
  /** 겸용 계정이 자기 자신에게 배정된 경우를 알려주려고 받는다. */
  currentUserId?: string;
  /** 배정(또는 화주가 고른 다른 후보)이 바뀔 때마다 호출. 후보가 없으면 null. */
  onAssigned: (candidate: ForwarderMatchCandidate | null) => void;
}

function candidateName(candidate: ForwarderMatchCandidate): string {
  return candidate.contactName?.trim() || '담당자명 미등록';
}

/**
 * 거래에서 뽑은 조건으로 담당자를 자동 배정한다. 조건마다 "왜 골랐는지"를 옆에 적어 두고,
 * 배정 결과에도 근거(겹친 특화 분야·진행 중·완료 건수)를 붙인다.
 */
export default function ForwarderAutoAssign({ trade, currentUserId, onAssigned }: Props) {
  const [suggestions, setSuggestions] = useState<SpecialtySuggestion[] | null>(null);
  const [selected, setSelected] = useState<ForwarderSpecialtyKey[]>([]);
  const [candidates, setCandidates] = useState<ForwarderMatchCandidate[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState('');

  const issueCount = useMemo(() => countTradeReviewIssues(trade), [trade]);
  const preferExperienced = issueCount >= EXPERIENCE_PRIORITY_ISSUE_THRESHOLD;

  // 항구 → 국가 판정은 항구 사전이 있어야 정확하다. 못 불러와도 정규식 폴백으로 제안은 계속한다.
  useEffect(() => {
    let cancelled = false;
    void loadPortData().catch(() => null).then(() => {
      if (cancelled) return;
      const next = suggestSpecialtiesForTrade(trade);
      setSuggestions(next);
      setSelected(next.map((item) => item.key));
    });
    return () => { cancelled = true; };
  }, [trade]);

  const toggle = (key: ForwarderSpecialtyKey) => {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    // 조건이 바뀌면 이전 배정은 더 이상 근거가 맞지 않는다.
    setCandidates(null);
    setPickedId(null);
    onAssigned(null);
  };

  const findAssignee = async () => {
    setMatching(true);
    setError('');
    try {
      const list = await matchForwarderForTrade(trade.id, selected, preferExperienced);
      setCandidates(list);
      setPickedId(list[0]?.id ?? null);
      onAssigned(list[0] ?? null);
    } catch (err) {
      console.error('[ForwarderAutoAssign] 담당자 배정 실패:', err);
      setError('담당자를 찾지 못했습니다. 잠시 후 다시 시도하거나 이메일로 직접 찾아 주세요.');
      setCandidates(null);
      onAssigned(null);
    } finally {
      setMatching(false);
    }
  };

  const pick = (candidate: ForwarderMatchCandidate) => {
    setPickedId(candidate.id);
    onAssigned(candidate);
  };

  if (suggestions === null) return <p className="fwd-assign-loading">거래 내용을 확인하는 중입니다.</p>;

  const suggestedKeys = new Set(suggestions.map((item) => item.key));
  const others = FORWARDER_SPECIALTIES.filter((item) => !suggestedKeys.has(item.key));
  const assigned = candidates?.find((item) => item.id === pickedId) ?? null;
  const alternates = candidates?.filter((item) => item.id !== pickedId) ?? [];

  return (
    <div className="fwd-assign">
      <div className="fwd-assign-head">
        <strong>이 거래에 필요한 담당자 조건</strong>
        <span>{suggestions.length > 0 ? '거래 내용에서 자동으로 골랐어요' : '거래 내용에서 뽑힌 조건이 없어요. 필요하면 직접 골라 주세요.'}</span>
      </div>

      {suggestions.length > 0 && (
        <ul className="fwd-cond-list">
          {suggestions.map((item) => {
            const on = selected.includes(item.key);
            return (
              <li key={item.key}>
                <button type="button" role="checkbox" aria-checked={on} className={`fwd-cond-row${on ? ' is-on' : ''}`} onClick={() => toggle(item.key)}>
                  <span className="fwd-cond-box" aria-hidden="true">{on && <Check size={13} />}</span>
                  <span className="fwd-cond-label">{specialtyLabel(item.key)}</span>
                  <span className="fwd-cond-reason">{item.reason}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="fwd-cond-more" role="group" aria-label="조건 추가">
        <span>조건 추가</span>
        {others.map((item) => {
          const on = selected.includes(item.key);
          return (
            <button key={item.key} type="button" role="checkbox" aria-checked={on} className={`fwd-cond-chip${on ? ' is-on' : ''}`} onClick={() => toggle(item.key)}>
              {item.label}
            </button>
          );
        })}
      </div>

      {!candidates && (
        <button type="button" className="btn btn-primary fwd-assign-find" disabled={matching} onClick={() => void findAssignee()}>
          <UserCheck size={16} aria-hidden="true" /> {matching ? '담당자 찾는 중…' : '담당자 자동 배정'}
        </button>
      )}

      {error && <div className="form-message error" role="alert">{error}</div>}

      {candidates && candidates.length === 0 && (
        <p className="fwd-assign-none">등록된 포워더 담당자가 아직 없습니다. 이메일로 직접 찾거나 외부 포워더에게 보내 주세요.</p>
      )}

      {assigned && (
        <div className="fwd-assign-result" aria-live="polite">
          <div className="fwd-assign-who">
            <span className="fwd-assign-tag">배정 담당자</span>
            <strong>{candidateName(assigned)}</strong>
            <span>{assigned.companyName || '업체명 미등록'}</span>
          </div>
          <div className="fwd-assign-basis" aria-label="배정 근거">
            {assigned.matchedSpecialties.map((key) => (
              <span key={key} className="fwd-basis-chip is-match">{specialtyLabel(key)} 일치</span>
            ))}
            <span className="fwd-basis-chip">진행 중 {assigned.activeCount}건</span>
            <span className="fwd-basis-chip">완료 {assigned.completedCount}건</span>
          </div>
          <p className="fwd-assign-note">
            {assigned.matchedSpecialties.length === 0 && (selected.length > 0
              ? '조건과 일치하는 특화 담당자가 없어, 업무 여유가 있는 담당자에게 배정했습니다. '
              : '조건을 고르지 않아, 업무 여유가 있는 담당자에게 배정했습니다. ')}
            {preferExperienced && `서류 검증에서 확인 항목이 ${issueCount}건 있어 처리 경험이 많은 담당자를 우선했습니다. `}
            {currentUserId && assigned.id === currentUserId && '다른 포워더 담당자가 없어 본인(겸용) 계정으로 배정됩니다.'}
          </p>
          {alternates.length > 0 && (
            <div className="fwd-assign-alt">
              <span>다른 후보</span>
              {alternates.map((item) => (
                <button key={item.id} type="button" onClick={() => pick(item)}>
                  {candidateName(item)} · 일치 {item.matchedSpecialties.length} · 진행 중 {item.activeCount}건
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
