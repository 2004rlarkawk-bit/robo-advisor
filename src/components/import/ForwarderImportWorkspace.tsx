/**
 * 포워더 수입 워크스페이스 — 여러 수입 건을 관리하는 업무 큐 + 건별 상세.
 *
 * 화주의 3단계 위저드와 달리 진행 상태·다음 조치 중심으로 구성한다.
 *  - 목록: ETA·수입자·B/L·상태·차단 이슈·다음 조치
 *  - 상세: 이슈(차단/확인/참고) → 문서 대사 → 통관·도착 관리 → 완료
 * 운영 상태는 forwarderCaseService를 통해 workflow_data.forwarderCase에 저장한다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CornerUpLeft,
  Inbox,
  RefreshCw,
  Search,
  Ship,
  Upload,
} from 'lucide-react';
import {
  FORWARDER_STAGE_LABEL,
  FORWARDER_STAGE_ORDER,
  type ForwarderCaseStage,
  type ForwarderCaseState,
  type ForwarderImportCase,
} from '../../types/forwarderCase';
import type { CargoTrackingResult } from '../../types/importTrade';
import {
  deriveForwarderCase,
  listForwarderCases,
  saveForwarderCaseState,
} from '../../services/forwarderCaseService';
import { lookupImportCargo } from '../../services/cargoProgressService';
import ImportDocumentComparison from './ImportDocumentComparison';
import ArrivalNoticeUploader from './ArrivalNoticeUploader';

interface Props {
  userId: string;
  /** Pre-alert를 화주 의뢰 없이 직접 등록해야 할 때 기존 업로드 플로우로 전환 */
  onDirectUpload: () => void;
}

const STAGE_BADGE_CLASS: Record<ForwarderCaseStage, string> = {
  received: 'fwd-stage-received',
  review: 'fwd-stage-review',
  clearance: 'fwd-stage-clearance',
  done: 'fwd-stage-done',
};

function formatEta(eta: string): string {
  return eta ? eta.slice(0, 10) : '미정';
}

export default function ForwarderImportWorkspace({ userId, onDirectUpload }: Props) {
  const [cases, setCases] = useState<ForwarderImportCase[] | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cargo, setCargo] = useState<CargoTrackingResult | null>(null);
  const [cargoBusy, setCargoBusy] = useState(false);
  const [returnFormOpen, setReturnFormOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setCases(await listForwarderCases());
    } catch (err) {
      console.error('포워더 업무 큐 조회 실패:', err);
      setCases([]);
      setError('업무 목록을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => cases?.find((item) => item.tradeId === selectedId) ?? null,
    [cases, selectedId],
  );

  // 저장된 운영 상태를 목록에 반영 — 전체 재조회 없이 해당 건만 다시 계산한다.
  const applyState = useCallback((tradeId: string, state: ForwarderCaseState) => {
    setCases((current) => {
      if (!current) return current;
      return current.map((item) => {
        if (item.tradeId !== tradeId) return item;
        return deriveForwarderCase({ ...item.trade, forwarderCase: state }) ?? item;
      });
    });
  }, []);

  const persist = useCallback(async (
    caseItem: ForwarderImportCase,
    patch: Partial<Omit<ForwarderCaseState, 'updatedAt'>>,
  ) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const next = await saveForwarderCaseState(caseItem.tradeId, patch);
      applyState(caseItem.tradeId, next);
    } catch (err) {
      console.error('포워더 운영 상태 저장 실패:', err);
      setError('상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }, [applyState, saving]);

  const lookupCargo = useCallback(async (blNo: string) => {
    setCargoBusy(true);
    try {
      setCargo(await lookupImportCargo(blNo));
    } finally {
      setCargoBusy(false);
    }
  }, []);

  const openCase = (tradeId: string) => {
    setSelectedId(tradeId);
    setCargo(null);
    setReturnFormOpen(false);
    setReturnReason('');
  };

  // ---------- 상세 화면 ----------
  if (selected) {
    const stageIndex = FORWARDER_STAGE_ORDER.indexOf(selected.stage);
    const blockers = selected.issues.filter((issue) => issue.severity === 'blocker');
    const checks = selected.issues.filter((issue) => issue.severity === 'check');
    const infos = selected.issues.filter((issue) => issue.severity === 'info');
    const canFinishReview = selected.blockerCount === 0;
    const returnPending = Boolean(selected.returnRequest && !selected.returnRequest.resolvedAt);

    return (
      <div className="fwd-workspace">
        <div className="fwd-detail-top">
          <button type="button" className="btn btn-secondary" onClick={() => setSelectedId(null)}>
            <ArrowLeft size={15} /> 업무 목록
          </button>
          <span className={`fwd-stage-badge ${STAGE_BADGE_CLASS[selected.stage]}`}>
            {FORWARDER_STAGE_LABEL[selected.stage]}
          </span>
        </div>

        <section className="form-card import-card fwd-head-card">
          <div className="fwd-head-main">
            <h2>{selected.importer} · {selected.blNo}</h2>
            <span className={`fwd-origin ${selected.origin === 'shipper_request' ? 'is-request' : ''}`}>
              {selected.origin === 'shipper_request' ? '화주 의뢰' : '직접 등록'}
            </span>
          </div>
          <dl className="fwd-head-grid">
            <div><dt>송하인</dt><dd>{selected.shipperName}</dd></div>
            <div><dt>선박</dt><dd>{selected.vesselName || '-'}</dd></div>
            <div><dt>ETA</dt><dd>{formatEta(selected.eta)}</dd></div>
            <div><dt>접수일</dt><dd>{selected.requestedAt.slice(0, 10)}</dd></div>
          </dl>
          <div className="fwd-stepper">
            {FORWARDER_STAGE_ORDER.map((stage, index) => (
              <span
                key={stage}
                className={`fwd-step${index === stageIndex ? ' is-current' : ''}${index < stageIndex ? ' is-done' : ''}`}
              >
                {FORWARDER_STAGE_LABEL[stage]}
              </span>
            ))}
          </div>
          {selected.stage !== 'done' && (
            <p className="fwd-next-banner"><AlertTriangle size={14} /> 다음 조치: <strong>{selected.nextAction}</strong></p>
          )}
        </section>

        {error && <div className="form-message error">{error}</div>}

        {selected.returnRequest && (
          <section className={`fwd-return-banner${selected.returnRequest.resolvedAt ? ' is-resolved' : ''}`}>
            <div className="fwd-return-head">
              <CornerUpLeft size={16} />
              <strong>
                {selected.returnRequest.resolvedAt
                  ? '화주가 수정 후 재제출했습니다'
                  : selected.shipperEditing
                    ? '화주가 서류를 수정하고 있습니다'
                    : '화주에게 보완을 요청했습니다 — 회신 대기 중'}
              </strong>
              <span className="fwd-return-date">{selected.returnRequest.requestedAt.slice(0, 10)} 요청</span>
            </div>
            <p className="fwd-return-reason">{selected.returnRequest.reason}</p>
            <div className="fwd-return-actions">
              {selected.returnRequest.resolvedAt ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => void persist(selected, { returnRequest: null, stage: 'review' })}
                >
                  재검토 시작
                </button>
              ) : (
                !selected.shipperEditing && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={saving}
                    onClick={() => void persist(selected, { returnRequest: null })}
                  >
                    요청 취소
                  </button>
                )
              )}
            </div>
          </section>
        )}

        {(blockers.length > 0 || checks.length > 0 || infos.length > 0) && (
          <section className="form-card import-card">
            <div className="import-card-heading">
              <div><h2>이슈 점검</h2></div>
              <span className="source-badge">{selected.blockerCount + selected.checkCount}건 미처리</span>
            </div>
            {[
              { label: '업무 차단', items: blockers, className: 'is-blocker' },
              { label: '확인 필요', items: checks, className: 'is-check' },
              { label: '참고', items: infos, className: 'is-info' },
            ].filter((group) => group.items.length > 0).map((group) => (
              <div key={group.label} className="fwd-issue-group">
                <h3>{group.label} <span>{group.items.length}</span></h3>
                {group.items.map((issue) => (
                  <label key={issue.id} className={`fwd-issue ${group.className}${issue.resolved ? ' is-resolved' : ''}`}>
                    <input
                      type="checkbox"
                      checked={issue.resolved}
                      disabled={saving}
                      onChange={(event) => void persist(selected, {
                        issueResolutions: { [issue.id]: event.target.checked },
                      })}
                    />
                    <span className="fwd-issue-body">
                      <span className="fwd-issue-title">{issue.title}</span>
                      <span className="fwd-issue-detail">{issue.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}

            {!selected.returnRequest && (selected.stage === 'received' || selected.stage === 'review') && (
              <div className="fwd-return-form">
                {returnFormOpen ? (
                  <>
                    <label className="form-group">
                      <span className="form-label">화주에게 전달할 보완 요청 사유</span>
                      <textarea
                        className="form-input fwd-return-textarea"
                        rows={3}
                        value={returnReason}
                        onChange={(event) => setReturnReason(event.target.value)}
                        placeholder="예: B/L과 P/L의 총중량이 달라 확인이 필요합니다."
                      />
                    </label>
                    <div className="fwd-return-actions">
                      <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setReturnFormOpen(false)}>취소</button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={saving || returnReason.trim() === ''}
                        onClick={() => {
                          const openIssues = selected.issues.filter((issue) => issue.severity !== 'info' && !issue.resolved);
                          void persist(selected, {
                            returnRequest: {
                              reason: returnReason.trim(),
                              issueTitles: openIssues.map((issue) => issue.title),
                              requestedAt: new Date().toISOString(),
                            },
                          }).then(() => setReturnFormOpen(false));
                        }}
                      >
                        <CornerUpLeft size={15} /> 보완 요청 보내기
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={saving}
                    onClick={() => {
                      const openIssues = selected.issues.filter((issue) => issue.severity !== 'info' && !issue.resolved);
                      setReturnReason(openIssues.map((issue) => `· ${issue.title}: ${issue.detail}`).join('\n'));
                      setReturnFormOpen(true);
                    }}
                  >
                    <CornerUpLeft size={15} /> 화주에게 보완 요청
                  </button>
                )}
                <p className="fwd-action-hint">서류 자체를 고쳐야 하는 문제는 확인 처리 대신 화주에게 돌려보내 수정·재제출을 받으세요.</p>
              </div>
            )}
          </section>
        )}

        <ImportDocumentComparison rows={selected.snapshot.analysis.comparison} />

        {stageIndex >= FORWARDER_STAGE_ORDER.indexOf('clearance') && (
          <>
            <section className="form-card import-card">
              <div className="import-card-heading"><div><h2>통관 진행 현황</h2></div></div>
              <div className="cargo-query">
                <label className="form-group">
                  <span className="form-label">M/H B/L 번호</span>
                  <input className="form-input" value={selected.blNo} readOnly />
                </label>
                <button type="button" className="btn btn-primary" disabled={cargoBusy} onClick={() => void lookupCargo(selected.blNo)}>
                  <Search size={16} /> {cargoBusy ? '조회 중…' : '조회'}
                </button>
              </div>
              {cargo && <p className="cargo-status-text"><strong>{cargo.status}</strong> · {cargo.detail}</p>}
            </section>
            <ArrivalNoticeUploader
              value={selected.arrivalNotice}
              onChange={(arrivalNotice) => void persist(selected, { arrivalNotice })}
              userId={userId}
              tradeId={selected.tradeId}
              readOnly={saving}
            />
          </>
        )}

        <div className="import-actions fwd-actions">
          {returnPending && (
            <p className="fwd-action-hint">화주 보완 회신을 기다리는 중에는 단계를 진행하지 않습니다.</p>
          )}
          {!returnPending && selected.stage === 'received' && (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void persist(selected, { stage: 'review' })}>
              서류 검토 시작
            </button>
          )}
          {!returnPending && selected.stage === 'review' && (
            <>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void persist(selected, { stage: 'received' })}>이전</button>
              <button type="button" className="btn btn-primary" disabled={saving || !canFinishReview} onClick={() => void persist(selected, { stage: 'clearance' })}>
                검토 완료 — 통관 진행
              </button>
              {!canFinishReview && <p className="fwd-action-hint">차단 이슈를 모두 확인 처리해야 통관 진행으로 넘어갈 수 있습니다.</p>}
            </>
          )}
          {!returnPending && selected.stage === 'clearance' && (
            <>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void persist(selected, { stage: 'review' })}>이전</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void persist(selected, { stage: 'done' })}>
                <CheckCircle2 size={15} /> 통관 완료 처리
              </button>
              {!selected.arrivalNotice?.storagePath && <p className="fwd-action-hint">도착통지서(A/N)를 첨부해 두면 완료 이력에 함께 보관됩니다.</p>}
            </>
          )}
          {!returnPending && selected.stage === 'done' && (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void persist(selected, { stage: 'clearance' })}>
              통관 진행으로 되돌리기
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------- 업무 큐(목록) 화면 ----------
  const summary = {
    received: cases?.filter((item) => item.stage === 'received').length ?? 0,
    review: cases?.filter((item) => item.stage === 'review').length ?? 0,
    clearance: cases?.filter((item) => item.stage === 'clearance').length ?? 0,
    blockers: cases?.reduce((total, item) => total + item.blockerCount, 0) ?? 0,
  };

  return (
    <div className="fwd-workspace">
      <section className="form-card import-card">
        <div className="import-card-heading fwd-queue-heading">
          <div>
            <h2><Ship size={18} /> 수입 업무 큐</h2>
            <p>화주가 전송한 의뢰와 직접 등록한 수입 건의 진행 상태를 한 화면에서 관리합니다.</p>
          </div>
          <div className="fwd-queue-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void load()}><RefreshCw size={15} /> 새로고침</button>
            <button type="button" className="btn btn-primary" onClick={onDirectUpload}><Upload size={15} /> 직접 등록</button>
          </div>
        </div>

        <div className="fwd-summary">
          <div className="fwd-tile"><strong>{summary.received}</strong><span>신규 의뢰</span></div>
          <div className="fwd-tile"><strong>{summary.review}</strong><span>서류 검토</span></div>
          <div className="fwd-tile"><strong>{summary.clearance}</strong><span>통관 진행</span></div>
          <div className={`fwd-tile${summary.blockers > 0 ? ' is-alert' : ''}`}><strong>{summary.blockers}</strong><span>차단 이슈</span></div>
        </div>

        {error && <div className="form-message error">{error}</div>}

        {cases === null && <p className="fwd-empty">업무 목록을 불러오는 중…</p>}

        {cases !== null && cases.length === 0 && (
          <div className="fwd-empty">
            <Inbox size={28} />
            <p><strong>접수된 수입 건이 없습니다.</strong></p>
            <p>화주가 수입 서류 분석을 완료해 전송하면 이곳에 의뢰로 도착합니다.<br />의뢰 없이 받은 서류는 [직접 등록]으로 시작할 수 있습니다.</p>
          </div>
        )}

        {cases !== null && cases.length > 0 && (
          <div className="import-table-wrap">
            <table className="import-table fwd-queue-table">
              <thead>
                <tr><th>ETA</th><th>수입자</th><th>B/L</th><th>선박</th><th>상태</th><th>차단</th><th>다음 조치</th></tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr key={item.tradeId} className="fwd-row" onClick={() => openCase(item.tradeId)}>
                    <td>{formatEta(item.eta)}</td>
                    <td>
                      {item.importer}
                      {item.origin === 'shipper_request' && <span className="fwd-origin is-request">화주 의뢰</span>}
                    </td>
                    <td>{item.blNo}</td>
                    <td>{item.vesselName || '-'}</td>
                    <td>
                      <span className={`fwd-stage-badge ${STAGE_BADGE_CLASS[item.stage]}`}>{FORWARDER_STAGE_LABEL[item.stage]}</span>
                      {item.returnRequest && (
                        <span className={`fwd-return-badge${item.returnRequest.resolvedAt ? ' is-resolved' : ''}`}>
                          {item.returnRequest.resolvedAt ? '재제출됨' : item.shipperEditing ? '화주 수정 중' : '보완 요청'}
                        </span>
                      )}
                    </td>
                    <td>{item.blockerCount > 0 ? <span className="fwd-blocker-count">{item.blockerCount}</span> : '-'}</td>
                    <td className="fwd-next-cell">{item.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
