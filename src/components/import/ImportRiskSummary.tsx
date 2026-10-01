import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileText, OctagonAlert, PenLine, RotateCcw } from 'lucide-react';
import { cleanRiskTitle, displayRelatedDocuments } from '../../utils/riskDisplay';
import type { ImportRisk, ImportRiskFixTarget, ImportRiskPickGroup } from '../../types/importTrade';
import { FTA_CHOICE_KEY } from '../../types/importTrade';

/** 고른 값과 서류 값이 같은지 — '4,631 KG'와 '4631', '550.00 KG'와 '550'도 같은 값으로 본다. */
export function sameChoiceValue(a: string, b: string): boolean {
  if (a.trim() === b.trim()) return true;
  const numeric = (value: string) => /\d/.test(value) && /^[\d.,\s]*[A-Za-z]*\s*$/.test(value.trim());
  // 글자로 비교하면 '550.00'과 '550'이 달라 보이므로 숫자 값으로 비교한다.
  const amount = (value: string) => Number(value.replace(/[^\d.]/g, ''));
  return numeric(a) && numeric(b) && amount(a) === amount(b);
}

const FULL_DOC_LABEL: Record<string, string> = {
  'C/I': 'Commercial Invoice (CI)', 'Commercial Invoice': 'Commercial Invoice (CI)',
  'P/L': 'Packing List (PL)', 'Packing List': 'Packing List (PL)',
  'B/L': 'Bill of Lading (B/L)', 'Bill of Lading': 'Bill of Lading (B/L)',
  'C/O': 'Certificate of Origin (C/O)', 'Certificate of Origin': 'Certificate of Origin (C/O)',
};
const fullDocLabel = (source: string) => FULL_DOC_LABEL[source] ?? source;

/** 수입 '반드시 수정' — 두 서류 값을 ≠로 나란히 보여주고 [수정하기]로 맞는 값을 고른다. */
function BlockerCompareCard({ risk, num, group, onChoose, onClearChoice }: {
  risk: ImportRisk;
  num: number;
  group: ImportRiskPickGroup;
  onChoose: (key: string, value: string) => void;
  onClearChoice?: (key: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState('');
  const resolved = risk.status === 'resolved';
  const [left, right] = group.choices;
  const selected = group.selected;
  const isPicked = (value: string) => !!selected && sameChoiceValue(selected, value);
  const customPicked = !!selected && !group.choices.some((choice) => sameChoiceValue(selected, choice.value));
  const pick = (value: string) => {
    if (isPicked(value)) onClearChoice?.(group.key);
    else onChoose(group.key, value);
    setEditing(false);
  };
  const applyCustom = () => {
    if (!custom.trim()) return;
    onChoose(group.key, custom.trim());
    setCustom('');
    setEditing(false);
  };
  const side = (choice: { source: string; value: string }) => (
    <button
      type="button"
      className={`risk-compare__side${isPicked(choice.value) ? ' is-selected' : ''}`}
      aria-pressed={isPicked(choice.value)}
      disabled={!editing}
      onClick={() => pick(choice.value)}
    >
      <span className="risk-compare__doc">{fullDocLabel(choice.source)}</span>
      <strong className="risk-compare__value">{choice.value}</strong>
      {isPicked(choice.value) && <span className="risk-compare__picked"><CheckCircle2 size={13} /> 이 값으로 통일</span>}
    </button>
  );
  return (
    <div className={`mobile-fix-card fix-card risk-compare-card sev-error${resolved ? ' risk-resolved' : ''}`}>
      <div className="risk-compare__head">
        <span className="fix-card__marker fix-card__marker--num">{num}</span>
        <div className="risk-compare__titles">
          <span className="fix-card__title">{cleanRiskTitle(risk.item)}</span>
          <p className="fix-card__desc">{group.label} 정보가 서류 간에 일치하지 않습니다.</p>
        </div>
        <button
          type="button"
          className="risk-compare__collapse"
          aria-expanded={!collapsed}
          aria-label={collapsed ? '펼치기' : '접기'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="risk-compare__row">
            <div className="risk-compare">
              {side(left)}
              <span className="risk-compare__neq" aria-label="다름">≠</span>
              {side(right)}
            </div>
            {selected ? (
              <button type="button" className="risk-compare__action is-done" onClick={() => onClearChoice?.(group.key)}>
                <RotateCcw size={14} /> 선택 취소
              </button>
            ) : (
              <button type="button" className="risk-compare__action" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>
                {editing ? '닫기' : <><PenLine size={14} /> 수정하기</>}
              </button>
            )}
          </div>
          {customPicked && (
            <p className="risk-compare__custom-picked"><CheckCircle2 size={13} /> 직접 입력한 값으로 통일: <strong>{selected}</strong></p>
          )}
          {editing && !selected && (
            <div className="risk-compare__edit">
              <p>맞는 쪽 값을 누르면 그 값으로 통일돼요. 둘 다 틀렸다면 직접 입력하세요.</p>
              <div className="risk-pick-custom">
                <input
                  className="form-input"
                  value={custom}
                  placeholder="둘 다 틀렸다면 직접 입력"
                  aria-label={`${group.label} 직접 입력`}
                  onChange={(event) => setCustom(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      applyCustom();
                    }
                  }}
                />
                <button type="button" className="risk-pick-apply" disabled={!custom.trim()} onClick={applyCustom}>적용</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ImportRiskSummary({ risks, onToggle, onChoose, onClearChoice, onFix, onGoHs, onGoUpload, collapseAdvisories = false }: {
  risks: ImportRisk[];
  /** 화주 수입: '확인 권장' 목록을 처음엔 접어 두고 헤더를 눌러 펼친다 */
  collapseAdvisories?: boolean;
  onToggle?: (id: string) => void;
  /** 불일치 카드에서 맞는 값을 골랐을 때 */
  onChoose?: (key: string, value: string) => void;
  /** 고른 값 되돌리기 — 눌린 버튼을 다시 누르거나 [선택 취소] */
  onClearChoice?: (key: string) => void;
  /** 카드 안에서 값을 입력해 고쳤을 때 */
  onFix?: (target: ImportRiskFixTarget, value: string) => void;
  onGoHs?: (itemId: string, fromRiskId?: string) => void;
  onGoUpload?: () => void;
}) {
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [advisoriesOpen, setAdvisoriesOpen] = useState(!collapseAdvisories);
  // 수출 결과 페이지의 확인 항목과 같은 문법: 반드시 수정(high) / 확인 권장(그 외) 두 그룹.
  // 값을 이미 정한 항목은 '확인 필요'에서 빼고 따로 묶는다 — 다 정했는데 4건 남은 것처럼 보이지 않게.
  const pending = risks.filter((risk) => risk.status !== 'resolved');
  const settled = risks.filter((risk) => risk.status === 'resolved');
  const blockers = pending.filter((risk) => risk.level === 'high');
  const advisories = pending.filter((risk) => risk.level === 'medium' || risk.level === 'low');
  const nothingFound = pending.length === 0 && settled.length === 0;
  const [settledOpen, setSettledOpen] = useState(false);

  let advisorySeq = 0;
  let blockerSeq = 0;
  const renderCard = (risk: ImportRisk) => {
    const isBlocker = risk.level === 'high';
    const resolved = risk.status === 'resolved';
    const num = isBlocker ? ++blockerSeq : ++advisorySeq;
    const hasDetail = !!risk.differentValues?.length || !!risk.recommendation;
    // FTA 적용 안 함을 고른 카드는 흐리게 — 검토 완료는 화주가 직접 누른다.
    const dimmed = !resolved && risk.ftaChoice === 'FTA 적용 안 함';
    // 반드시 수정 중 서류 두 곳의 값이 다른 카드는 두 값을 나란히(≠) 보여주는 비교형으로 그린다.
    const compareGroup = isBlocker && onChoose && risk.pickGroups?.length === 1 && risk.pickGroups[0].choices.length === 2
      ? risk.pickGroups[0]
      : undefined;
    if (compareGroup && onChoose) {
      return (
        <BlockerCompareCard
          key={risk.id}
          risk={risk}
          num={num}
          group={compareGroup}
          onChoose={onChoose}
          onClearChoice={onClearChoice}
        />
      );
    }
    return (
      <div key={risk.id} id={`import-risk-${risk.id}`} className={`mobile-fix-card fix-card ${isBlocker ? 'sev-error' : 'sev-warning'}${resolved ? ' risk-resolved' : ''}${dimmed ? ' risk-dimmed' : ''}`}>
        <div className="fix-card__head">
          <span className={`fix-card__marker fix-card__marker--${isBlocker ? 'icon' : 'num'}`}>
            {isBlocker ? <FileText size={17} /> : num}
          </span>
          <div className="fix-card__text">
            <div className="fix-card__titlerow">
              <span className="fix-card__title">{cleanRiskTitle(risk.item)}</span>
              {displayRelatedDocuments(risk.relatedDocuments).slice(0, 3).map((doc) => (
                <span key={doc} className="fix-card__doc">{doc}</span>
              ))}
            </div>
            <p className="fix-card__desc">{risk.cause}</p>
            {onChoose && (!resolved || risk.chosen) && risk.pickGroups?.map((group) => {
              const customKey = `${risk.id}::${group.key}`;
              const custom = customValues[customKey] ?? '';
              const selected = group.selected;
              const selectedIsChoice = !!selected && group.choices.some((choice) => sameChoiceValue(selected, choice.value));
              return (
                <div key={group.key} className="risk-pick">
                  <span className="risk-pick-label">맞는 {group.label} 고르기</span>
                  <div className="risk-pick-choices">
                    {group.choices.map((choice) => {
                      const isSelected = !!selected && sameChoiceValue(selected, choice.value);
                      return (
                        <button
                          key={`${choice.source}-${choice.value}`}
                          type="button"
                          className={`risk-pick-choice${isSelected ? ' is-selected' : ''}`}
                          aria-pressed={isSelected}
                          onClick={() => (isSelected ? onClearChoice?.(group.key) : onChoose(group.key, choice.value))}
                        >
                          <em>{choice.source}</em>{choice.value}
                        </button>
                      );
                    })}
                    {selected && !selectedIsChoice && (
                      <button
                        type="button"
                        className="risk-pick-choice is-selected"
                        aria-pressed
                        onClick={() => onClearChoice?.(group.key)}
                      >
                        <em>직접 입력</em>{selected}
                      </button>
                    )}
                  </div>
                  <div className="risk-pick-custom">
                    <input
                      className="form-input"
                      value={custom}
                      placeholder="둘 다 틀렸다면 직접 입력"
                      aria-label={`${group.label} 직접 입력`}
                      onChange={(event) => setCustomValues((current) => ({ ...current, [customKey]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing && custom.trim()) {
                          event.preventDefault();
                          onChoose(group.key, custom);
                        }
                      }}
                    />
                    <button type="button" className="risk-pick-apply" disabled={!custom.trim()} onClick={() => onChoose(group.key, custom)}>
                      적용
                    </button>
                  </div>
                </div>
              );
            })}
            {(!resolved || risk.chosen) && risk.fixes?.map((fix, fixIndex) => {
              // 해결된 카드에서는 고른 선택(FTA)만 다시 바꿀 수 있게 남긴다.
              if (resolved && fix.kind !== 'fta') return null;
              if (fix.kind === 'hs') {
                return onGoHs ? (
                  <div key={`${risk.id}-hs`} className="risk-fix-actions">
                    <button type="button" className="risk-fix-link" onClick={() => onGoHs(fix.itemId, risk.id)}>HS Code 확정하러 가기 →</button>
                  </div>
                ) : null;
              }
              if (fix.kind === 'upload') {
                if (risk.ftaChoice === 'FTA 적용 요청') {
                  return (
                    <div key={`${risk.id}-upload`} className="risk-co-required" role="status">
                      <strong><AlertTriangle size={15} /> 원산지증명서(C/O)가 필요합니다</strong>
                      <span>FTA 협정세율을 적용하려면 원산지증명서를 서류로 추가해 주세요. 올리면 이 카드는 서류 대조 결과로 바뀝니다.</span>
                      {onGoUpload && (
                        <button type="button" className="btn btn-primary risk-co-required__btn" onClick={onGoUpload}>원산지증명서 올리러 가기 →</button>
                      )}
                    </div>
                  );
                }
                return onGoUpload ? (
                  <div key={`${risk.id}-upload`} className="risk-fix-actions">
                    <button type="button" className="risk-fix-link" onClick={onGoUpload}>서류 추가하러 가기 →</button>
                  </div>
                ) : null;
              }
              // FTA 선택은 3단계 'FTA 적용 여부' 카드에서 다룬다 — 카드에는 값 입력만 남긴다.
              if (fix.kind !== 'value' || !onFix) return null;
              const fixKey = `${risk.id}::fix${fixIndex}`;
              const draft = customValues[fixKey] ?? '';
              const setDraft = (value: string) => setCustomValues((current) => ({ ...current, [fixKey]: value }));
              return (
                <div key={fixKey} className="risk-pick">
                  <span className="risk-pick-label">{fix.label}</span>
                  {!!fix.choices?.length && (
                    <div className="risk-pick-choices">
                      {fix.choices.map((choice) => (
                        <button key={`${choice.source}-${choice.value}`} type="button" className="risk-pick-choice" onClick={() => onFix(fix.target, choice.value)}>
                          <em>{choice.source}</em>{choice.value}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="risk-pick-custom">
                    {fix.options ? (
                      <select className="form-input" value={draft} aria-label={fix.label} onChange={(event) => setDraft(event.target.value)}>
                        <option value="">선택하세요</option>
                        {fix.options.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input
                        className="form-input"
                        value={draft}
                        placeholder={fix.placeholder ?? '값 입력'}
                        aria-label={fix.label}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.nativeEvent.isComposing && draft.trim()) {
                            event.preventDefault();
                            onFix(fix.target, draft);
                          }
                        }}
                      />
                    )}
                    <button type="button" className="risk-pick-apply" disabled={!draft.trim()} onClick={() => onFix(fix.target, draft)}>적용</button>
                  </div>
                </div>
              );
            })}
            {hasDetail && (
              <details className="risk-detail">
                <summary>값 비교·해결 방법</summary>
                <div className="risk-detail-body">
                  {!!risk.differentValues?.length && (
                    <ul>
                      {risk.differentValues.map((value, index) => <li key={index}>{value}</li>)}
                    </ul>
                  )}
                  {risk.recommendation && <p>{risk.recommendation}</p>}
                </div>
              </details>
            )}
          </div>
          {risk.autoResolved ? (
            <span className="risk-check-btn on"><CheckCircle2 size={14} /> 확정됨</span>
          ) : risk.chosen && onClearChoice ? (
            <button
              type="button"
              className="risk-check-btn on"
              onClick={() => {
                if (risk.ftaChoice) onClearChoice(FTA_CHOICE_KEY);
                risk.pickGroups?.forEach((group) => { if (group.selected) onClearChoice(group.key); });
              }}
            >
              <RotateCcw size={14} /> 선택 취소
            </button>
          ) : onToggle ? (
            <button
              type="button"
              className={`risk-check-btn${resolved ? ' on' : ''}`}
              onClick={() => onToggle(risk.id)}
            >
              {resolved ? <><RotateCcw size={14} /> 검토 취소</> : <><CheckCircle2 size={14} /> 검토 완료</>}
            </button>
          ) : resolved ? (
            <span className="risk-check-btn on" aria-hidden><CheckCircle2 size={14} /> 확인됨</span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section className="form-card import-card" id="import-risk-summary">
      <div className="import-card-heading">
        <div><h2>신고 전 확인사항</h2></div>
        <p>수입신고에 직접 영향을 주는 값만 확인합니다. 회사명·주소·연락처 같은 표기 차이는 확인 대상이 아닙니다.</p>
      </div>
      {nothingFound ? (
        <div className="risk-pass">
          <CheckCircle2 size={20} />
          <div>
            <strong>확인할 항목이 없습니다</strong>
            <p>관세사에게 보내기 전에 원본 서류와 한 번 더 대조하세요.</p>
          </div>
        </div>
      ) : (
        <div className="mobile-fix-list">
          {blockers.length > 0 && (
            <div className="sev-section-header sev-error">
              <span className="sev-section-icon"><OctagonAlert size={17} strokeWidth={2.4} /></span>
              <span className="sev-section-label">확인 필요</span>
              <span className="sev-section-count">{blockers.length}</span>
            </div>
          )}
          {blockers.map(renderCard)}
          {advisories.length > 0 && (collapseAdvisories ? (
            <button
              type="button"
              className={`sev-section-header sev-warning sev-section-toggle${advisoriesOpen ? ' is-open' : ''}`}
              aria-expanded={advisoriesOpen}
              onClick={() => setAdvisoriesOpen((open) => !open)}
            >
              <span className="sev-section-icon"><AlertTriangle size={17} strokeWidth={2.4} /></span>
              <span className="sev-section-label">참고 항목</span>
              <span className="sev-section-count">{advisories.length}</span>
              <span className="sev-section-toggle-hint">{advisoriesOpen ? '접기' : '펼쳐 보기'}<ChevronDown size={16} /></span>
            </button>
          ) : (
            <div className="sev-section-header sev-warning">
              <span className="sev-section-icon"><AlertTriangle size={17} strokeWidth={2.4} /></span>
              <span className="sev-section-label">참고 항목</span>
              <span className="sev-section-count">{advisories.length}</span>
            </div>
          ))}
          {advisoriesOpen && advisories.map(renderCard)}
          {settled.length > 0 && (
            <>
              <button
                type="button"
                className={`sev-section-header sev-section-toggle${settledOpen ? ' is-open' : ''}`}
                aria-expanded={settledOpen}
                onClick={() => setSettledOpen((open) => !open)}
              >
                <span className="sev-section-icon"><CheckCircle2 size={17} strokeWidth={2.4} /></span>
                <span className="sev-section-label">정한 항목</span>
                <span className="sev-section-count">{settled.length}</span>
                <span className="sev-section-toggle-hint">{settledOpen ? '접기' : '펼쳐 보기'}<ChevronDown size={16} /></span>
              </button>
              {settledOpen && settled.map(renderCard)}
            </>
          )}
        </div>
      )}
    </section>
  );
}
