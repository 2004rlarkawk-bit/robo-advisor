import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import type { SavedTrade } from '../../types';
import type { ForwarderMatchCandidate } from '../../types/forwarderRequest';
import { matchForwarderForTrade } from '../../services/forwarderRequestService';
import { loadPortData } from '../../services/portLocodeService';
import {
  CUSTOM_SPECIALTY_MAX_COUNT,
  CUSTOM_SPECIALTY_MAX_LENGTH,
  FORWARDER_SPECIALTIES,
  normalizeCustomSpecialties,
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
  /** 화주가 고른 포워더가 바뀔 때마다 호출. 고른 후보가 없으면 null. */
  onSelected: (candidate: ForwarderMatchCandidate | null) => void;
  /** 화주가 직접 적은 조건. 자동 배정 점수에는 안 들어가 요청 메시지로 포워더에게 전한다. */
  onCustomConditionsChange?: (conditions: string[]) => void;
}

/** 직접 적은 조건과 포워더가 직접 적은 분야가 겹치는지 — 한쪽이 다른 쪽을 포함하면 같은 뜻으로 본다. */
function customMatches(condition: string, specialty: string): boolean {
  const a = condition.toLowerCase();
  const b = specialty.toLowerCase();
  return a.includes(b) || b.includes(a);
}

/** 처음에 보여 줄 후보 수. 나머지는 '더 보기'로 펼친다 — 시연·실사용 모두 상위 몇 곳만 비교한다. */
const VISIBLE_CANDIDATES = 3;

function candidateName(candidate: ForwarderMatchCandidate): string {
  return candidate.contactName?.trim() || '담당자명 미등록';
}

function candidateCompany(candidate: ForwarderMatchCandidate): string {
  return candidate.partnerCompanyName?.trim() || candidate.companyName?.trim() || '업체명 미등록';
}

/**
 * 거래 조건에 맞는 포워더를 추천한다. PortAI는 추천 순서만 정하고 확정은 화주가 한다.
 * 제휴 포워더를 먼저 보여주고(서버 정렬), 일반 가입 담당자는 후순위 후보로 붙는다.
 */
export default function ForwarderRecommendList({ trade, onSelected, onCustomConditionsChange }: Props) {
  const [suggestions, setSuggestions] = useState<SpecialtySuggestion[] | null>(null);
  const [selectedSpecialties, setSelectedSpecialties] = useState<ForwarderSpecialtyKey[]>([]);
  const [candidates, setCandidates] = useState<ForwarderMatchCandidate[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [showAllConditions, setShowAllConditions] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [customConditions, setCustomConditions] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const issueCount = useMemo(() => countTradeReviewIssues(trade), [trade]);
  const preferExperienced = issueCount >= EXPERIENCE_PRIORITY_ISSUE_THRESHOLD;

  // 호출부가 인라인 함수를 넘겨도 추천 조회가 매 렌더마다 다시 돌지 않도록 참조로 들고 있는다.
  const onSelectedRef = useRef(onSelected);
  onSelectedRef.current = onSelected;
  // 재조회 콜백이 선택이 바뀔 때마다 새로 만들어져 추천을 다시 부르지 않도록 ref로 읽는다.
  const pickedIdRef = useRef<string | null>(null);
  pickedIdRef.current = pickedId;

  // 항구 → 국가 판정은 항구 사전이 있어야 정확하다. 못 불러와도 정규식 폴백으로 제안은 계속한다.
  useEffect(() => {
    let cancelled = false;
    void loadPortData().catch(() => null).then(() => {
      if (cancelled) return;
      const next = suggestSpecialtiesForTrade(trade);
      setSuggestions(next);
      setSelectedSpecialties(next.map((item) => item.key));
    });
    return () => { cancelled = true; };
  }, [trade]);

  const loadCandidates = useCallback(async (specialties: ForwarderSpecialtyKey[]) => {
    setLoading(true);
    setError('');
    try {
      const list = await matchForwarderForTrade(trade.id, specialties, preferExperienced);
      setCandidates(list);
      // PortAI는 순서만 제안하고 고르는 건 화주다 — 미리 선택해 두지 않는다.
      // 조건을 바꿔 다시 불러와도 이미 고른 포워더가 목록에 남아 있으면 선택을 유지한다.
      const kept = list.find((item) => item.id === pickedIdRef.current) ?? null;
      setPickedId(kept?.id ?? null);
      onSelectedRef.current(kept);
    } catch (err) {
      console.error('[ForwarderRecommendList] 포워더 추천 조회 실패:', err);
      setError('포워더를 추천하지 못했습니다. 잠시 후 다시 시도하거나 이메일로 직접 찾아 주세요.');
      setCandidates(null);
      onSelectedRef.current(null);
    } finally {
      setLoading(false);
    }
  }, [trade.id, preferExperienced]);

  // 조건이 정해지면 바로 추천을 불러온다 — 화주가 버튼을 한 번 더 누르게 하지 않는다.
  useEffect(() => {
    if (suggestions === null) return;
    void loadCandidates(selectedSpecialties);
  }, [suggestions, selectedSpecialties, loadCandidates]);

  const toggleSpecialty = (key: ForwarderSpecialtyKey) => {
    setSelectedSpecialties((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ));
  };

  const updateCustomConditions = (next: string[]) => {
    setCustomConditions(next);
    onCustomConditionsChange?.(next);
  };

  const addCustomCondition = () => {
    const next = normalizeCustomSpecialties([...customConditions, customDraft]);
    if (next.length > customConditions.length) updateCustomConditions(next);
    setCustomDraft('');
  };

  const pick = (candidate: ForwarderMatchCandidate) => {
    setPickedId(candidate.id);
    onSelected(candidate);
  };

  if (suggestions === null) return <p className="fwd-assign-loading">거래 내용을 확인하는 중입니다.</p>;

  const selectedSet = new Set(selectedSpecialties);
  const extraOptions = FORWARDER_SPECIALTIES.filter((item) => !selectedSet.has(item.key));
  const top = candidates?.[0] ?? null;
  const visibleCandidates = candidates
    ? (showAllCandidates ? candidates : candidates.slice(0, VISIBLE_CANDIDATES))
    : [];
  const hiddenCount = (candidates?.length ?? 0) - visibleCandidates.length;

  return (
    <div className="fwd-assign">
      <div className="fwd-assign-head">
        <strong>포워더 선택</strong>
      </div>

      <div className="fwd-cond">
        <div className="fwd-cond-chips" role="group" aria-label="추천 조건">
          <span className="fwd-cond-title">추천 조건</span>
          {selectedSpecialties.map((key) => (
            <button key={key} type="button" role="checkbox" aria-checked="true" className="fwd-cond-chip is-on" onClick={() => toggleSpecialty(key)} aria-label={`${specialtyLabel(key)} 조건 빼기`}>
              {specialtyLabel(key)}
              <X size={12} aria-hidden="true" />
            </button>
          ))}
          {customConditions.map((label) => (
            <button key={`custom-${label}`} type="button" className="fwd-cond-chip is-on is-custom" onClick={() => updateCustomConditions(customConditions.filter((item) => item !== label))} aria-label={`${label} 조건 빼기`}>
              {label}
              <X size={12} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="fwd-cond-add" aria-expanded={showAllConditions} onClick={() => setShowAllConditions((v) => !v)}>
            <Plus size={12} aria-hidden="true" />
            조건 추가
          </button>
        </div>
        {showAllConditions && (
          <div className="fwd-cond-more" role="group" aria-label="조건 추가">
            {extraOptions.map((item) => (
              <button key={item.key} type="button" role="checkbox" aria-checked="false" className="fwd-cond-chip" onClick={() => toggleSpecialty(item.key)}>
                {item.label}
              </button>
            ))}
            <form
              className="fwd-cond-custom"
              onSubmit={(event) => { event.preventDefault(); addCustomCondition(); }}
            >
              <input
                type="text"
                value={customDraft}
                maxLength={CUSTOM_SPECIALTY_MAX_LENGTH}
                onChange={(event) => setCustomDraft(event.target.value)}
                placeholder="기타 조건 직접 입력 (예: 반송, 전시화물)"
                aria-label="기타 조건 직접 입력"
                disabled={customConditions.length >= CUSTOM_SPECIALTY_MAX_COUNT}
              />
              <button type="submit" disabled={!customDraft.trim() || customConditions.length >= CUSTOM_SPECIALTY_MAX_COUNT}>추가</button>
            </form>
            <p className="fwd-cond-custom-hint">직접 적은 조건은 요청 메시지와 함께 포워더에게 전달됩니다.</p>
          </div>
        )}
      </div>

      {loading && <p className="fwd-assign-loading">맞는 포워더를 찾는 중입니다.</p>}
      {error && <div className="form-message error" role="alert">{error}</div>}

      {candidates && candidates.length === 0 && !loading && (
        <p className="fwd-assign-none">등록된 포워더 담당자가 아직 없습니다. 이메일로 직접 찾거나 외부 포워더에게 보내 주세요.</p>
      )}

      {candidates && candidates.length > 0 && (
        <ul className="fwd-pick-list" role="radiogroup" aria-label="추천 포워더">
          {visibleCandidates.map((candidate) => {
            const on = candidate.id === pickedId;
            const tags = [
              ...candidate.matchedSpecialties.map((key) => ({ key, label: specialtyLabel(key), match: true })),
              // 직접 적은 분야 — 배정 점수와 무관하다. 화주가 직접 적은 조건과 겹칠 때만 일치로 칠한다.
              ...(candidate.customSpecialties ?? []).map((label) => ({
                key: `custom-${label}`,
                label,
                match: customConditions.some((condition) => customMatches(condition, label)),
              })),
            ];
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`fwd-pick-row${on ? ' is-on' : ''}`}
                  onClick={() => pick(candidate)}
                >
                  <span className="fwd-pick-mark" aria-hidden="true">{on && <Check size={14} />}</span>
                  <span className="fwd-pick-main">
                    <span className="fwd-pick-name">
                      <strong>{candidateCompany(candidate)}</strong>
                      {candidate.id === top?.id && <span className="fwd-pick-top">추천</span>}
                      {candidate.isPartner && <span className="fwd-pick-partner">제휴 포워더</span>}
                    </span>
                    <span className="fwd-pick-meta">
                      담당 {candidateName(candidate)}
                      <i aria-hidden="true">·</i>
                      현재 진행 {candidate.activeCount}건
                      <i aria-hidden="true">·</i>
                      완료 {candidate.completedCount}건
                    </span>
                    {tags.length > 0 && (
                      <span className="fwd-pick-basis">
                        {tags.map((tag) => (
                          <span key={tag.key} className={`fwd-basis-chip${tag.match ? ' is-match' : ''}`}>{tag.label}</span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button type="button" className="fwd-pick-more" onClick={() => setShowAllCandidates(true)}>
          다른 포워더 {hiddenCount}곳 더 보기
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}

      {top && !loading && (
        <p className="fwd-assign-note" aria-live="polite">
          {pickedId === null && '목록에서 의뢰할 포워더를 직접 선택해 주세요. '}
          {preferExperienced && `서류 검증에서 확인 항목이 ${issueCount}건 있어 처리 경험이 많은 담당자를 우선했습니다. `}
        </p>
      )}
    </div>
  );
}
