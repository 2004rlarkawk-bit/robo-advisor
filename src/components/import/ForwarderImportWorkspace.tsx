/**
 * 포워더 수입 워크스페이스 — 여러 수입 건을 관리하는 업무 큐 + 건별 상세.
 *
 * 화주의 3단계 위저드와 달리 진행 상태·다음 조치 중심으로 구성한다.
 *  - 목록: ETA·수입 건·상태·다음 조치
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
  MoreHorizontal,
  RefreshCw,
  Search,
  Ship,
} from 'lucide-react';
import {
  FORWARDER_STAGE_LABEL,
  FORWARDER_STAGE_ORDER,
  type ForwarderCaseStage,
  type ForwarderCaseState,
  type ForwarderImportCase,
} from '../../types/forwarderCase';
import type { CargoTrackingResult, ImportDocumentMeta } from '../../types/importTrade';
import {
  deriveForwarderCase,
  listForwarderCases,
  saveForwarderCaseState,
} from '../../services/forwarderCaseService';
import { lookupImportCargo } from '../../services/cargoProgressService';
import { IMPORT_DOCUMENT_TYPE_LABELS } from '../../services/importDocumentAnalysisService';
import { loadTradeAttachmentFile } from '../../services/tradeAttachmentStorageService';
import { downloadArrivalNoticeDocx } from '../../services/arrivalNoticeDocxService';
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

type DetailTab = 'overview' | 'review' | 'clearance';
type QueueFilter = 'active' | 'received' | 'blockers' | 'done';

function formatEta(eta: string): string {
  return eta ? eta.slice(0, 10) : '미정';
}

/** ETA까지 남은 날짜 배지 — 임박(D-3 이내)·지남을 색으로 구분해 우선순위를 보여준다 */
function etaDday(eta: string): { label: string; tone: 'overdue' | 'imminent' | 'normal' } | null {
  const date = new Date(eta.slice(0, 10));
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: `D+${-days}`, tone: 'overdue' };
  if (days === 0) return { label: 'D-DAY', tone: 'imminent' };
  return { label: `D-${days}`, tone: days <= 3 ? 'imminent' : 'normal' };
}

export default function ForwarderImportWorkspace({ userId, onDirectUpload }: Props) {
  const [cases, setCases] = useState<ForwarderImportCase[] | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cargo, setCargo] = useState<CargoTrackingResult | null>(null);
  const [cargoBusy, setCargoBusy] = useState(false);
  // 조회용 B/L — 추출값을 기본으로 쓰되, 추출이 틀리거나 비어 있으면 직접 고쳐서 조회할 수 있게 한다.
  const [cargoBlNo, setCargoBlNo] = useState('');
  const [returnFormOpen, setReturnFormOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [docBusyId, setDocBusyId] = useState<string | null>(null);
  const [anBusy, setAnBusy] = useState(false);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('active');

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
  ): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setError('');
    try {
      const next = await saveForwarderCaseState(caseItem.tradeId, patch);
      applyState(caseItem.tradeId, next);
      return true;
    } catch (err) {
      console.error('포워더 운영 상태 저장 실패:', err);
      setError('상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [applyState, saving]);

  const moveToStage = useCallback(async (
    caseItem: ForwarderImportCase,
    stage: ForwarderCaseStage,
    nextTab: DetailTab,
  ) => {
    if (await persist(caseItem, { stage })) setDetailTab(nextTab);
  }, [persist]);

  // 화주가 올린 원본 서류를 새 탭에서 연다 — 대사 결과의 근거를 눈으로 확인하는 실무 필수 동작
  const openSourceDocument = useCallback(async (documentMeta: ImportDocumentMeta) => {
    if (!documentMeta.storageBucket || !documentMeta.storagePath) return;
    setDocBusyId(documentMeta.id);
    setError('');
    try {
      const file = await loadTradeAttachmentFile({
        storageBucket: documentMeta.storageBucket,
        storagePath: documentMeta.storagePath,
        fileName: documentMeta.name,
        mimeType: documentMeta.mimeType,
        documentType: documentMeta.type === 'unknown' ? 'other' : documentMeta.type,
      }, userId);
      const url = URL.createObjectURL(file);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('원본 서류 열기 실패:', err);
      setError('원본 파일을 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDocBusyId(null);
    }
  }, [userId]);

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
    const opened = cases?.find((item) => item.tradeId === tradeId);
    setCargoBlNo(opened && opened.blNo !== '-' ? opened.blNo : '');
    setReturnFormOpen(false);
    setReturnReason('');
    setDetailTab('overview');
  };

  const finishClearance = (caseItem: ForwarderImportCase) => {
    const arrivalNoticeNote = caseItem.arrivalNotice?.storagePath
      ? ''
      : '\n\n도착통지서(A/N)가 첨부되지 않았습니다.';
    if (window.confirm(`실제 통관·반출 확인이 끝난 건인가요?${arrivalNoticeNote}\n\n완료 처리 후에는 업무 큐의 완료 건으로 이동합니다.`)) {
      void moveToStage(caseItem, 'done', 'overview');
    }
  };

  // ---------- 상세 화면 ----------
  if (selected) {
    const stageIndex = FORWARDER_STAGE_ORDER.indexOf(selected.stage);
    const blockers = selected.issues.filter((issue) => issue.severity === 'blocker');
    const unresolvedBlockers = blockers.filter((issue) => !issue.resolved);
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
            <div><dt>ETA</dt><dd>
              {formatEta(selected.eta)}
              {(() => {
                const dday = etaDday(selected.eta);
                return dday && selected.stage !== 'done'
                  ? <span className={`fwd-dday is-${dday.tone}`}>{dday.label}</span>
                  : null;
              })()}
            </dd></div>
            <div><dt>접수일</dt><dd>{selected.requestedAt.slice(0, 10)}</dd></div>
          </dl>
          <div className="fwd-progress" aria-label="업무 진행 단계">
            {FORWARDER_STAGE_ORDER.map((stage, index) => (
              <span
                key={stage}
                className={`fwd-progress-step${index === stageIndex ? ' is-current' : ''}${index < stageIndex ? ' is-done' : ''}`}
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

        <nav className="fwd-tabs" aria-label="수입 업무 상세 탭">
          <button type="button" className={detailTab === 'overview' ? 'is-active' : ''} onClick={() => setDetailTab('overview')}>개요</button>
          <button type="button" className={detailTab === 'review' ? 'is-active' : ''} onClick={() => setDetailTab('review')}>서류 검토</button>
          <button
            type="button"
            className={detailTab === 'clearance' ? 'is-active' : ''}
            disabled={stageIndex < FORWARDER_STAGE_ORDER.indexOf('clearance')}
            title={stageIndex < FORWARDER_STAGE_ORDER.indexOf('clearance') ? '서류 검토를 완료하면 열립니다.' : undefined}
            onClick={() => setDetailTab('clearance')}
          >
            통관 처리
          </button>
        </nav>

        {detailTab === 'overview' && (blockers.length > 0 || checks.length > 0 || infos.length > 0) && (
          <section className="form-card import-card">
            <div className="import-card-heading">
              <div><h2>이슈 점검</h2></div>
              <span className="source-badge">{selected.blockerCount + selected.checkCount}건 미처리</span>
            </div>
            {unresolvedBlockers.length > 0 && (
              <div className="fwd-blocker-alert" role="alert">
                <AlertTriangle size={17} />
                <div>
                  <strong>통관 진행 전 해결할 차단 이슈 {unresolvedBlockers.length}건</strong>
                  <span>{unresolvedBlockers.map((issue) => issue.title).join(' · ')}</span>
                </div>
              </div>
            )}
            {[
              { label: '업무 차단', items: blockers, className: 'is-blocker' },
              { label: '확인 필요', items: checks, className: 'is-check' },
              { label: '참고', items: infos, className: 'is-info' },
            ].filter((group) => group.items.length > 0).map((group) => (
              <details key={group.label} className="fwd-issue-group" open={group.label === '업무 차단'}>
                <summary>{group.label} <span>{group.items.length}</span></summary>
                <div className="fwd-issue-list">
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
              </details>
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
                      // 자동 채움은 화주가 읽을 문장 — 차단·확인 필요를 구분해 담되, 같은 항목 중복 없이 요약한다.
                      const seenTitles = new Set<string>();
                      const dedupe = (severity: 'blocker' | 'check') => selected.issues
                        .filter((issue) => issue.severity === severity && !issue.resolved)
                        .filter((issue) => {
                          if (seenTitles.has(issue.title)) return false;
                          seenTitles.add(issue.title);
                          return true;
                        });
                      const blockerLines = dedupe('blocker').slice(0, 4).map((issue) => `· ${issue.detail}`);
                      const checkLines = dedupe('check').slice(0, 4).map((issue) => `· ${issue.detail}`);
                      const sections: string[] = [];
                      if (blockerLines.length > 0) sections.push(`[반드시 수정]\n${blockerLines.join('\n')}`);
                      if (checkLines.length > 0) sections.push(`[함께 확인 요청]\n${checkLines.join('\n')}`);
                      setReturnReason(sections.join('\n\n'));
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

        {detailTab === 'overview' && blockers.length === 0 && checks.length === 0 && infos.length === 0 && (
          <section className="form-card import-card fwd-clear-overview">
            <CheckCircle2 size={20} /> <div><strong>지금 확인할 이슈가 없습니다.</strong><span>다음 조치를 진행해 주세요.</span></div>
          </section>
        )}

        {detailTab === 'review' && (
          <>
            <section className="form-card import-card">
              <div className="import-card-heading">
                <div><h2>원본 서류</h2><p>화주가 제출한 원본을 열어 대사 결과의 근거를 직접 확인합니다.</p></div>
              </div>
              {selected.snapshot.documents.filter((doc) => doc.storagePath).length === 0 ? (
                <p className="fwd-doc-empty">보관된 원본 파일이 없습니다.</p>
              ) : (
                <ul className="fwd-doc-list">
                  {selected.snapshot.documents.filter((doc) => doc.storagePath).map((doc) => (
                    <li key={doc.id}>
                      <span className="fwd-doc-type">{IMPORT_DOCUMENT_TYPE_LABELS[doc.type] ?? '기타서류'}</span>
                      <span className="fwd-doc-name">{doc.name}</span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={docBusyId !== null}
                        onClick={() => void openSourceDocument(doc)}
                      >
                        {docBusyId === doc.id ? '여는 중…' : '원본 열기'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <ImportDocumentComparison rows={selected.snapshot.analysis.comparison} />
          </>
        )}

        {detailTab === 'clearance' && stageIndex >= FORWARDER_STAGE_ORDER.indexOf('clearance') && (
          <>
            <section className="form-card import-card">
              <div className="import-card-heading"><div><h2>통관 진행 현황</h2></div></div>
              <div className="cargo-query">
                <label className="form-group">
                  <span className="form-label">M/H B/L 번호</span>
                  <input
                    className="form-input"
                    value={cargoBlNo}
                    onChange={(event) => setCargoBlNo(event.target.value)}
                    placeholder="B/L 번호 입력"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={cargoBusy || cargoBlNo.trim() === ''}
                  onClick={() => void lookupCargo(cargoBlNo.trim())}
                >
                  <Search size={16} /> {cargoBusy ? '조회 중…' : '조회'}
                </button>
              </div>
              {cargo && (
                <div className="cargo-result">
                  <p className="cargo-status-text">
                    <strong>{cargo.status}</strong> · {cargo.detail}
                    {cargo.source === 'simulation' && <span className="da-sim-badge">시뮬레이션</span>}
                  </p>
                  {cargo.lookupStatus !== 'empty' && (
                    <ol className="cargo-steps">
                      {cargo.timeline.map((step) => (
                        <li key={step.label} className={`${step.completed ? 'is-done' : ''}${step.current ? ' is-current' : ''}`}>
                          {step.label}
                        </li>
                      ))}
                    </ol>
                  )}
                  {cargo.arrivalPort && <p className="cargo-meta">도착항 {cargo.arrivalPort} · 화물관리번호 {cargo.cargoNo}</p>}
                </div>
              )}
            </section>
            <ArrivalNoticeUploader
              value={selected.arrivalNotice}
              onChange={(arrivalNotice) => void persist(selected, { arrivalNotice })}
              userId={userId}
              tradeId={selected.tradeId}
              readOnly={saving}
              headerAction={(
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={anBusy}
                  onClick={() => {
                    setAnBusy(true);
                    void downloadArrivalNoticeDocx(selected)
                      .catch((err) => {
                        console.error('A/N 생성 실패:', err);
                        setError('도착통지서를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
                      })
                      .finally(() => setAnBusy(false));
                  }}
                >
                  {anBusy ? '생성 중…' : 'A/N 생성·다운로드'}
                </button>
              )}
              notice="이 건의 B/L·선박·화물 정보로 도착통지서를 생성해 화주에게 전달하세요. 청구 금액란은 비워서 발행되며, 전달본은 아래에 첨부해 이력으로 보관할 수 있습니다."
            />
          </>
        )}

        <div className="import-actions fwd-actions">
          {returnPending && (
            <p className="fwd-action-hint">화주 보완 회신을 기다리는 중에는 단계를 진행하지 않습니다.</p>
          )}
          {!returnPending && selected.stage === 'received' && (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void moveToStage(selected, 'review', 'review')}>
              서류 검토 시작
            </button>
          )}
          {!returnPending && selected.stage === 'review' && (
            <>
              <button type="button" className="btn btn-primary" disabled={saving || !canFinishReview} onClick={() => void moveToStage(selected, 'clearance', 'clearance')}>
                검토 완료 — 통관 진행
              </button>
              {!canFinishReview && <p className="fwd-action-hint">차단 이슈를 모두 확인 처리해야 통관 진행으로 넘어갈 수 있습니다.</p>}
            </>
          )}
          {!returnPending && selected.stage === 'clearance' && (
            <>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => finishClearance(selected)}>
                <CheckCircle2 size={15} /> 통관 완료 처리
              </button>
              {!selected.arrivalNotice?.storagePath && <p className="fwd-action-hint">도착통지서(A/N)를 첨부해 두면 완료 이력에 함께 보관됩니다.</p>}
            </>
          )}
          {!returnPending && selected.stage === 'done' && (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void moveToStage(selected, 'clearance', 'clearance')}>
              통관 진행으로 되돌리기
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------- 업무 큐(목록) 화면 ----------
  const summary = {
    active: cases?.filter((item) => item.stage !== 'done').length ?? 0,
    blockers: cases?.reduce((total, item) => total + item.blockerCount, 0) ?? 0,
  };
  const visibleCases = (cases ?? []).filter((item) => {
    if (queueFilter === 'active') return item.stage !== 'done';
    if (queueFilter === 'received') return item.stage === 'received';
    if (queueFilter === 'blockers') return item.blockerCount > 0;
    return item.stage === 'done';
  });
  const filterOptions: { value: QueueFilter; label: string; count: number }[] = [
    { value: 'active', label: '진행 중', count: summary.active },
    { value: 'received', label: '신규 접수', count: cases?.filter((item) => item.stage === 'received').length ?? 0 },
    { value: 'blockers', label: '차단', count: cases?.filter((item) => item.blockerCount > 0).length ?? 0 },
    { value: 'done', label: '완료', count: cases?.filter((item) => item.stage === 'done').length ?? 0 },
  ];

  return (
    <div className="fwd-workspace">
      <section className="form-card import-card">
        <div className="import-card-heading fwd-queue-heading">
          <div>
            <h2><Ship size={18} /> 수입 업무 큐</h2>
            <p className="fwd-queue-status"><strong>처리 필요 {summary.active}건</strong>{summary.blockers > 0 && <> · <span>{summary.blockers}건 차단</span></>}</p>
          </div>
          <div className="fwd-queue-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void load()}><RefreshCw size={15} /> 새로고침</button>
            <details className="fwd-more-menu">
              <summary aria-label="추가 작업"><MoreHorizontal size={19} /></summary>
              <button type="button" onClick={onDirectUpload}>직접 등록</button>
            </details>
          </div>
        </div>

        {error && <div className="form-message error">{error}</div>}

        {cases !== null && cases.length > 0 && (
          <div className="fwd-filter-bar" aria-label="업무 목록 필터">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={queueFilter === option.value ? 'is-active' : ''}
                onClick={() => setQueueFilter(option.value)}
              >
                {option.label} <span>{option.count}</span>
              </button>
            ))}
            <span className="fwd-sort-note">차단 건 · 업무 단계 · ETA 순</span>
          </div>
        )}

        {cases === null && <p className="fwd-empty">업무 목록을 불러오는 중…</p>}

        {cases !== null && cases.length === 0 && (
          <div className="fwd-empty">
            <Inbox size={28} />
            <p><strong>접수된 수입 건이 없습니다.</strong></p>
            <p>화주가 수입 서류 분석을 완료해 전송하면 이곳에 의뢰로 도착합니다.<br />의뢰 없이 받은 서류는 [직접 등록]으로 시작할 수 있습니다.</p>
          </div>
        )}

        {cases !== null && visibleCases.length === 0 && (
          <p className="fwd-filter-empty">이 조건에 해당하는 업무가 없습니다.</p>
        )}

        {cases !== null && visibleCases.length > 0 && (
          <div className="import-table-wrap">
            <table className="import-table fwd-queue-table">
              <thead>
                <tr><th>ETA</th><th>수입 건</th><th>상태</th><th>다음 조치</th></tr>
              </thead>
              <tbody>
                {visibleCases.map((item) => {
                  const dday = etaDday(item.eta);
                  return (
                    <tr key={item.tradeId} className="fwd-row" onClick={() => openCase(item.tradeId)}>
                      <td className="fwd-eta-cell">
                        {formatEta(item.eta)}
                        {dday && item.stage !== 'done' && <span className={`fwd-dday is-${dday.tone}`}>{dday.label}</span>}
                      </td>
                      <td className="fwd-case-cell">
                        <strong>{item.importer}</strong>
                        <span>{item.blNo} · {item.vesselName || '선박 미정'}</span>
                        {item.origin === 'shipper_request' && <span className="fwd-origin is-request">화주 의뢰</span>}
                      </td>
                      <td>
                        <span className={`fwd-stage-badge ${STAGE_BADGE_CLASS[item.stage]}`}>{FORWARDER_STAGE_LABEL[item.stage]}</span>
                        {item.returnRequest && (
                          <span className={`fwd-return-badge${item.returnRequest.resolvedAt ? ' is-resolved' : ''}`}>
                            {item.returnRequest.resolvedAt ? '재제출됨' : item.shipperEditing ? '화주 수정 중' : '보완 요청'}
                          </span>
                        )}
                      </td>
                      <td className="fwd-next-cell">{item.nextAction}{item.blockerCount > 0 && <span className="fwd-blocker-inline">차단 {item.blockerCount}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
