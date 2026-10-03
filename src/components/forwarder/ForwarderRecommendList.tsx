import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
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
  /** 화주가 고른 포워더가 바뀔 때마다 호출. 고른 후보가 없으면 null. */
  onSelected: (candidate: ForwarderMatchCandidate | null) => void;
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
export default function ForwarderRecommendList({ trade, onSelected }: Props) {
  const [suggestions, setSuggestions] = useState<SpecialtySuggestion[] | null>(null);
  const [selectedSpecialties, setSelectedSpecialties] = useState<ForwarderSpecialtyKey[]>([]);
  const [candidates, setCandidates] = useState<ForwarderMatchCandidate[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [showAllConditions, setShowAllConditions] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const issueCount = useMemo(() => countTradeReviewIssues(trade), [trade]);
  const preferExperienced = issueCount >= EXPERIENCE_PRIORITY_ISSUE_THRESHOLD;

  // 호출부가 인라인 함수를 넘겨도 추천 조회가 매 렌더마다 다시 돌지 않도록 참조로 들고 있는다.
  const onSelectedRef = useRef(onSelected);
  onSelectedRef.current = onSelected;

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
      // 추천 1순위를 미리 골라 두되, 전달은 화주가 버튼을 눌러야 일어난다.
      setPickedId(list[0]?.id ?? null);
      onSelectedRef.current(list[0] ?? null);
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

  const pick = (candidate: ForwarderMatchCandidate) => {
    setPickedId(candidate.id);
    onSelected(candidate);
  };

  if (suggestions === null) return <p className="fwd-assign-loading">거래 내용을 확인하는 중입니다.</p>;

  const selectedSet = new Set(selectedSpecialties);
  const extraOptions = FORWARDER_SPECIALTIES.filter((item) => !selectedSet.has(item.key));
  const reasons = suggestions.filter((item) => selectedSet.has(item.key)).map((item) => item.reason);
  const picked = candidates?.find((item) => item.id === pickedId) ?? null;
  const visibleCandidates = candidates
    ? (showAllCandidates ? candidates : candidates.slice(0, VISIBLE_CANDIDATES))
    : [];
  const hiddenCount = (candidates?.length ?? 0) - visibleCandidates.length;

  return (
    <div className="fwd-assign">
      <div className="fwd-assign-head">
        <strong>포워더 선택</strong>
        <span>제휴 포워더를 먼저, 거래 조건에 맞는 순서로 추천합니다.</span>
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
          <button type="button" className="fwd-cond-add" aria-expanded={showAllConditions} onClick={() => setShowAllConditions((v) => !v)}>
            <Plus size={12} aria-hidden="true" />
            조건 추가
          </button>
        </div>
        {reasons.length > 0 && <p className="fwd-cond-reason">거래 정보에서 골랐습니다 · {reasons.join(', ')}</p>}
        {showAllConditions && (
          <div className="fwd-cond-more" role="group" aria-label="조건 추가">
            {extraOptions.map((item) => (
              <button key={item.key} type="button" role="checkbox" aria-checked="false" className="fwd-cond-chip" onClick={() => toggleSpecialty(item.key)}>
                {item.label}
              </button>
            ))}
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
              // 직접 적은 분야 — 배정 점수와 무관해 일치 태그와 다르게 보인다.
              ...(candidate.customSpecialties ?? []).map((label) => ({ key: `custom-${label}`, label, match: false })),
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

      {picked && (
        <p className="fwd-assign-note" aria-live="polite">
          {picked.matchedSpecialties.length === 0 && (selectedSpecialties.length > 0
            ? '조건과 일치하는 특화 담당자가 없어, 업무 여유가 있는 담당자를 먼저 추천했습니다. '
            : '조건을 고르지 않아, 업무 여유가 있는 담당자를 먼저 추천했습니다. ')}
          {preferExperienced && `서류 검증에서 확인 항목이 ${issueCount}건 있어 처리 경험이 많은 담당자를 우선했습니다. `}
        </p>
      )}
    </div>
  );
}
