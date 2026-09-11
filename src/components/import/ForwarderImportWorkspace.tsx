/**
 * 포워더 수입 워크스페이스 — 여러 수입 건을 관리하는 업무 큐 + 건별 상세.
 *
 * 화주가 보낸 서류를 검토하고 후속 서류를 작성한다.
 *  - 목록: 받은 서류·의뢰와 다음 조치 담당
 *  - 상세: 서류 대사·보완 → A/N 초안 작성 → 보조 진행 기록
 * 운영 상태는 forwarderCaseService를 통해 workflow_data.forwarderCase에 저장한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CornerUpLeft,
  FileText,
  Inbox,
  MoreHorizontal,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  type ForwarderCaseStage,
  type ForwarderCaseState,
  type ForwarderImportCase,
} from '../../types/forwarderCase';
import type { CargoTrackingResult, ImportDocumentMeta } from '../../types/importTrade';
import {
  deriveForwarderCase,
  listForwarderCases,
  saveForwarderCaseState,
  sortForwarderCases,
} from '../../services/forwarderCaseService';
import { lookupImportCargo } from '../../services/cargoProgressService';
import { IMPORT_DOCUMENT_TYPE_LABELS } from '../../services/importDocumentAnalysisService';
import { loadTradeAttachmentFile } from '../../services/tradeAttachmentStorageService';
import { downloadArrivalNoticeDocx } from '../../services/arrivalNoticeDocxService';
import ForwarderDocumentReview from './ForwarderDocumentReview';
import ForwarderIssueList from './ForwarderIssueList';
import ForwarderCompletionForm from './ForwarderCompletionForm';
import { firstDocumentValue, formatForwarderDate, forwarderDateKey } from '../../utils/forwarderPresentation';
import ArrivalNoticeUploader from './ArrivalNoticeUploader';
import { documentTask, DOCUMENT_STAGE_LABEL } from '../../utils/forwarderDocumentWorkflow';

interface Props {
  userId: string;
  /** A/N 레터헤드에 들어갈 발행 포워더 상호 */
  issuerName?: string;
  /** Pre-alert를 화주 의뢰 없이 직접 등록해야 할 때 기존 업로드 플로우로 전환 */
  onDirectUpload: () => void;
}

const STAGE_BADGE_CLASS: Record<ForwarderCaseStage, string> = {
  received: 'fwd-stage-received',
  review: 'fwd-stage-review',
  clearance: 'fwd-stage-clearance',
  done: 'fwd-stage-done',
};

type DetailTab = 'overview' | 'review' | 'documents';
type QueueFilter = 'active' | 'mine' | 'waiting' | 'done';

function formatEta(eta: string): string {
  return formatForwarderDate(eta);
}

/** ETA까지 남은 날짜 배지 — 임박(D-3 이내)·지남을 색으로 구분해 우선순위를 보여준다 */
function etaDday(eta: string): { label: string; tone: 'overdue' | 'imminent' | 'normal' } | null {
  const key = forwarderDateKey(eta);
  if (!key) return null;
  const date = new Date(`${key}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: `D+${-days}`, tone: 'overdue' };
  if (days === 0) return { label: 'D-DAY', tone: 'imminent' };
  return { label: `D-${days}`, tone: days <= 3 ? 'imminent' : 'normal' };
}

export default function ForwarderImportWorkspace({ userId, issuerName = '', onDirectUpload }: Props) {
  const [cases, setCases] = useState<ForwarderImportCase[] | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cargo, setCargo] = useState<CargoTrackingResult | null>(null);
  const [cargoBusy, setCargoBusy] = useState(false);
  // 조회용 B/L — 추출값을 기본으로 쓰되, 추출이 틀리거나 비어 있으면 직접 고쳐서 조회할 수 있게 한다.
  const [cargoBlNo, setCargoBlNo] = useState('');
  const [returnFormOpen, setReturnFormOpen] = useState(false);
  // 보완 요청은 이슈를 골라 보낸다 — 선택된 이슈가 곧 요청 내용, 메모는 부가 안내.
  const [returnPicks, setReturnPicks] = useState<Record<string, boolean>>({});
  const [returnMemo, setReturnMemo] = useState('');
  const [detailTab, setDetailTab] = useState<DetailTab>('review');
  const [docBusyId, setDocBusyId] = useState<string | null>(null);
  const [anBusy, setAnBusy] = useState(false);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [cargoQueriedBl, setCargoQueriedBl] = useState('');
  const cargoRequest = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCases(await listForwarderCases());
    } catch (err) {
      console.error('포워더 업무 큐 조회 실패:', err);
      setError('업무 목록을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.');
    } finally {
      setLoading(false);
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
      return sortForwarderCases(current.map((item) => {
        if (item.tradeId !== tradeId) return item;
        return deriveForwarderCase({ ...item.trade, forwarderCase: state }) ?? item;
      }));
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
    const request = ++cargoRequest.current;
    setCargoBusy(true);
    setCargo(null);
    setError('');
    try {
      const result = await lookupImportCargo(blNo);
      if (request === cargoRequest.current) { setCargo(result); setCargoQueriedBl(blNo); }
    } catch {
      if (request === cargoRequest.current) setError('화물 진행 정보를 조회하지 못했습니다. B/L 번호를 확인하고 다시 시도해 주세요.');
    } finally {
      if (request === cargoRequest.current) setCargoBusy(false);
    }
  }, []);

  const openCase = (tradeId: string) => {
    ++cargoRequest.current;
    setCargoBusy(false);
    setSelectedId(tradeId);
    setError('');
    setCompletionOpen(false);
    setCargo(null);
    const opened = cases?.find((item) => item.tradeId === tradeId);
    setCargoBlNo(opened && opened.blNo !== '-' ? opened.blNo : '');
    setReturnFormOpen(false);
    setReturnPicks({});
    setReturnMemo('');
    setDetailTab('review');
  };

  const finishClearance = (caseItem: ForwarderImportCase) => {
    if (caseItem.blockerCount > 0 || (caseItem.returnRequest && !caseItem.returnRequest.resolvedAt)) return;
    setDetailTab('overview');
    setCompletionOpen(true);
  };

  // ---------- 상세 화면 ----------
  if (selected) {
    const blockers = selected.issues.filter((issue) => issue.severity === 'blocker');
    const unresolvedBlockers = blockers.filter((issue) => !issue.resolved);
    const checks = selected.issues.filter((issue) => issue.severity === 'check');
    const infos = selected.issues.filter((issue) => issue.severity === 'info');
    const canFinishReview = selected.blockerCount === 0;
    const returnPending = Boolean(selected.returnRequest && !selected.returnRequest.resolvedAt);
    const completion = selected.trade.forwarderCase?.completion;
    const task = documentTask(selected);
    const consignee = firstDocumentValue(selected.snapshot.analysis.extracted.consignee, selected.snapshot.analysis.extracted.consigneeDetails?.name);

    return (
      <div className="fwd-workspace">
        <div className="fwd-detail-top">
          <button type="button" className="btn btn-secondary" onClick={() => setSelectedId(null)}>
            <ArrowLeft size={15} /> 업무 목록
          </button>
          <span className={`fwd-stage-badge ${STAGE_BADGE_CLASS[selected.stage]}`}>
            {DOCUMENT_STAGE_LABEL[selected.stage]}
          </span>
        </div>

        <section className="form-card import-card fwd-head-card">
          <div className="fwd-head-main">
            <div><span className="fwd-eyebrow">BILL OF LADING</span><h2>{selected.blNo === '-' ? 'B/L 번호 미등록' : selected.blNo}</h2></div>
            <span className={`fwd-origin ${selected.origin === 'shipper_request' ? 'is-request' : ''}`}>
              {selected.origin === 'shipper_request' ? '화주 의뢰' : '직접 등록'}
            </span>
          </div>
          <dl className="fwd-head-grid">
            <div><dt>수입자</dt><dd>{selected.importer}</dd></div>
            {consignee && <div><dt>수하인</dt><dd>{consignee}</dd></div>}
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
            <div><dt>접수일</dt><dd>{formatForwarderDate(selected.requestedAt)}</dd></div>
          </dl>
          <p className="fwd-next-banner"><FileText size={14} /><span>다음 조치 · <strong>{task.owner}</strong> — {task.action}</span></p>
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
              {selected.returnRequest.resolvedAt ? (selected.stage === 'received' || selected.stage === 'review') && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => void moveToStage(selected, 'review', 'review')}
                >
                  수정 서류 검토
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

        <nav className="fwd-tabs" aria-label="수입 서류 작업 탭">
          <button type="button" aria-pressed={detailTab === 'review'} className={detailTab === 'review' ? 'is-active' : ''} onClick={() => setDetailTab('review')}>받은 서류 검토</button>
          <button type="button" aria-pressed={detailTab === 'documents'} className={detailTab === 'documents' ? 'is-active' : ''} onClick={() => setDetailTab('documents')}>도착통지서 작성</button>
          <button type="button" aria-pressed={detailTab === 'overview'} className={detailTab === 'overview' ? 'is-active' : ''} onClick={() => setDetailTab('overview')}>진행·기록</button>
        </nav>

        {detailTab === 'overview' && selected.stage === 'done' && <section className="form-card import-card fwd-completion-summary">
          <div className="import-card-heading"><div><span className="fwd-eyebrow">COMPLETED</span><h2>수입 업무 완료 내역</h2></div><CheckCircle2 size={22} /></div>
          <p className="fwd-caption">담당자의 업무 처리 기록입니다. 실제 화물 진행 상태와 서류 작성·검토 결과는 별개입니다.</p>
          <dl className="fwd-head-grid"><div><dt>완료 기록일</dt><dd>{formatForwarderDate(completion?.confirmedAt)}</dd></div><div><dt>반출 확인일</dt><dd>{formatForwarderDate(completion?.releasedOn)}</dd></div><div><dt>도착통지서</dt><dd>{selected.arrivalNotice?.fileName ?? '첨부 없음'}</dd></div></dl>
          <p className="fwd-resolution-note">{completion ? `신고수리 확인 근거: ${completion.customsReference}` : '이전 완료 기록에는 신고수리·반출 확인 근거가 등록되어 있지 않습니다.'}</p>
        </section>}

        {detailTab === 'review' && (
          <>
            <ForwarderDocumentReview rows={selected.snapshot.analysis.comparison} />
            <details className="form-card import-card fwd-source-documents">
              <summary><FileText size={17} />원본 서류<span>{selected.snapshot.documents.filter((doc) => doc.storagePath).length}개 첨부</span></summary>
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
            </details>
          </>
        )}
        {detailTab === 'review' && (blockers.length > 0 || checks.length > 0 || infos.length > 0) && (
          <section className="form-card import-card">
            <div className="import-card-heading">
              <div><h2>검토 기록·보완 요청</h2></div>
              <span className="source-badge">{selected.blockerCount + selected.checkCount}건 미처리</span>
            </div>
            {unresolvedBlockers.length > 0 && (
              <div className="fwd-blocker-alert" role="alert">
                <AlertTriangle size={17} />
                <div>
                  <strong>서류 검토 완료 전 확인할 항목 {unresolvedBlockers.length}건</strong>
                  <span>{unresolvedBlockers.map((issue) => issue.title).join(' · ')}</span>
                </div>
              </div>
            )}
            <ForwarderIssueList issues={selected.issues} notes={selected.trade.forwarderCase?.issueNotes}
              busy={saving} readOnly={selected.stage === 'done' || returnPending}
              onResolve={(issue, note, resolved) => persist(selected, {
                issueResolutions: { [issue.id]: resolved },
                ...(resolved ? { issueNotes: { [issue.id]: { note, confirmedAt: new Date().toISOString(), issueDetail: issue.detail } } } : {}),
              })} />

            {!returnPending && (selected.stage === 'received' || selected.stage === 'review') && (() => {
              // 같은 제목의 중복 이슈(검증·규칙·리스크가 겹치는 경우)는 하나만 고르게 한다.
              const seenTitles = new Set<string>();
              const pickable = selected.issues
                .filter((issue) => issue.severity !== 'info' && !issue.resolved)
                .filter((issue) => {
                  if (seenTitles.has(issue.title)) return false;
                  seenTitles.add(issue.title);
                  return true;
                });
              const picked = pickable.filter((issue) => returnPicks[issue.id]);
              const buildReason = () => {
                const blockerLines = picked.filter((issue) => issue.severity === 'blocker').map((issue) => `· ${issue.detail}`);
                const checkLines = picked.filter((issue) => issue.severity === 'check').map((issue) => `· ${issue.detail}`);
                const sections: string[] = [];
                if (blockerLines.length > 0) sections.push(`[반드시 수정]\n${blockerLines.join('\n')}`);
                if (checkLines.length > 0) sections.push(`[함께 확인 요청]\n${checkLines.join('\n')}`);
                if (returnMemo.trim() !== '') sections.push(`(추가 안내) ${returnMemo.trim()}`);
                return sections.join('\n\n');
              };
              return (
                <div className="fwd-return-form">
                  {returnFormOpen ? (
                    <>
                      <p className="form-label">화주에게 보완을 요청할 항목을 선택하세요</p>
                      <div className="fwd-pick-list">
                        {pickable.map((issue) => (
                          <label key={issue.id} className={`fwd-pick${returnPicks[issue.id] ? ' on' : ''}`}>
                            <input
                              type="checkbox"
                              checked={Boolean(returnPicks[issue.id])}
                              onChange={(event) => setReturnPicks((current) => ({ ...current, [issue.id]: event.target.checked }))}
                            />
                            <span className={`fwd-pick-sev ${issue.severity === 'blocker' ? 'is-blocker' : 'is-check'}`}>
                              {issue.severity === 'blocker' ? '반드시 수정' : '확인 요청'}
                            </span>
                            <span className="fwd-pick-text"><strong>{issue.title}</strong> — {issue.detail}</span>
                          </label>
                        ))}
                      </div>
                      <label className="form-group">
                        <span className="form-label">추가 안내 (선택)</span>
                        <textarea
                          className="form-input fwd-return-textarea"
                          rows={2}
                          value={returnMemo}
                          onChange={(event) => setReturnMemo(event.target.value)}
                          placeholder="예: 수정한 P/L을 다시 첨부해 주세요."
                        />
                      </label>
                      <div className="fwd-return-actions">
                        <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setReturnFormOpen(false)}>취소</button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={saving || picked.length === 0}
                          onClick={() => {
                            void persist(selected, {
                              returnRequest: {
                                reason: buildReason(),
                                issueTitles: picked.map((issue) => issue.title),
                                requestedAt: new Date().toISOString(),
                              },
                            }).then((saved) => { if (saved) setReturnFormOpen(false); });
                          }}
                        >
                          <CornerUpLeft size={15} /> 보완 요청 보내기{picked.length > 0 ? ` (${picked.length}건)` : ''}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={saving || pickable.length === 0}
                      onClick={() => {
                        const defaults: Record<string, boolean> = {};
                        pickable.forEach((issue) => { defaults[issue.id] = true; });
                        setReturnPicks(defaults);
                        setReturnMemo('');
                        setReturnFormOpen(true);
                      }}
                    >
                      <CornerUpLeft size={15} /> 화주에게 보완 요청
                    </button>
                  )}
                  <p className="fwd-action-hint">직접 확인한 항목은 검토 근거를 기록하고, 서류 수정이 필요한 항목은 화주에게 보완을 요청하세요.</p>
                </div>
              );
            })()}
          </section>
        )}

        {detailTab === 'review' && selected.stage !== 'done' && blockers.length === 0 && checks.length === 0 && infos.length === 0 && (
          <section className="form-card import-card fwd-clear-overview">
            <CheckCircle2 size={20} /> <div><strong>지금 확인할 이슈가 없습니다.</strong><span>원본과 대사 결과를 확인한 뒤 검토를 완료해 주세요.</span></div>
          </section>
        )}
        {detailTab === 'documents' && (
          <>
            <p className="fwd-caption" role="status">{selected.stage === 'received' || selected.stage === 'review' || returnPending
              ? '아직 서류 검토가 끝나지 않았습니다. 초안을 미리 작성할 수 있지만, 보완된 내용을 확인한 뒤 최종본을 사용하세요.'
              : '검토한 거래 정보를 활용해 후속 서류를 작성합니다. 서류 작성이 실제 통관·반출 완료를 의미하지는 않습니다.'}</p>
            <ArrivalNoticeUploader
              value={selected.arrivalNotice}
              onChange={(arrivalNotice) => void persist(selected, { arrivalNotice })}
              userId={userId}
              tradeId={selected.tradeId}
              readOnly={saving || selected.stage === 'done' || returnPending}
              description="받은 서류의 거래·선박·화물 정보를 불러와 도착통지서 초안을 만듭니다."
              attachmentLabel="확인·수정한 A/N 최종본 첨부"
              headerAction={(
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={anBusy}
                  onClick={() => {
                    setAnBusy(true);
                    void downloadArrivalNoticeDocx(selected, issuerName)
                      .catch((err) => {
                        console.error('A/N 생성 실패:', err);
                        setError('도착통지서를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
                      })
                      .finally(() => setAnBusy(false));
                  }}
                >
                  {anBusy ? '생성 중…' : 'A/N 초안 생성 (.docx)'}
                </button>
              )}
              notice="초안 생성 → DOCX에서 수하인·B/L 구분·운임 조건·청구 금액 확인 및 수정 → 최종본 첨부. 화주에게는 별도로 전달해야 하며, 생성·첨부만으로 발송되지 않습니다."
            />
          </>
        )}

        {detailTab === 'overview' && (
          <>
            <section className="form-card import-card fwd-exchange-history">
              <div className="import-card-heading"><div><h2>서류 접수·보완 기록</h2><p>현재 의뢰에 저장된 최근 요청·회신을 보여줍니다.</p></div></div>
              <dl className="fwd-head-grid">
                <div><dt>{selected.origin === 'shipper_request' ? '화주 의뢰 접수' : '직접 등록'}</dt><dd>{formatForwarderDate(selected.requestedAt)}</dd></div>
                <div><dt>서류 상태</dt><dd>{DOCUMENT_STAGE_LABEL[selected.stage]}</dd></div>
                <div><dt>다음 조치 담당</dt><dd>{task.owner}</dd></div>
                {selected.returnRequest && <>
                  <div><dt>포워더 보완 요청</dt><dd>{formatForwarderDate(selected.returnRequest.requestedAt)}</dd></div>
                  <div><dt>화주 재제출</dt><dd>{selected.returnRequest.resolvedAt ? formatForwarderDate(selected.returnRequest.resolvedAt) : '회신 대기'}</dd></div>
                </>}
                <div><dt>A/N 최종본</dt><dd>{selected.arrivalNotice?.fileName ?? '미첨부'}</dd></div>
              </dl>
              <p className="fwd-caption">서류별 확인 근거는 ‘받은 서류 검토’에서 확인할 수 있습니다. A/N 첨부는 화주에게 발송했다는 기록이 아닙니다.</p>
            </section>
            <details className="form-card import-card fwd-source-documents">
              <summary><Search size={17} />화물 진행 조회<span>참고 정보</span></summary>
              <div className="import-card-heading"><div><h2>화물 진행 조회</h2><p>외부 조회 결과와 내부 업무 상태를 구분해 확인합니다.</p></div></div>
              <div className="cargo-query">
                <label className="form-group">
                  <span className="form-label">M/H B/L 번호</span>
                  <input
                    className="form-input"
                    value={cargoBlNo}
                    disabled={cargoBusy}
                    onChange={(event) => { setCargoBlNo(event.target.value); setCargo(null); }}
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
                  {(cargo.source === 'simulation' || cargo.lookupStatus === 'simulation') && <div className="fwd-simulation-notice"><strong>시연용 조회 결과</strong><p>이 B/L은 예시 데이터입니다. 실제 신고수리·반출 여부를 증명하지 않습니다.</p></div>}
                  <p className="fwd-caption">조회 B/L · {cargoQueriedBl}{cargo.source !== 'simulation' && cargo.lookupStatus === 'success' ? ' · 외부 조회 결과' : ''}</p>
                  <p className="cargo-status-text">
                    <strong>{cargo.status}</strong> · {cargo.detail}
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
            </details>
            {completionOpen && selected.stage === 'clearance' && <ForwarderCompletionForm busy={saving} onCancel={() => setCompletionOpen(false)} onConfirm={async (customsReference, releasedOn) => {
              if (selected.blockerCount > 0 || returnPending) return;
              if (await persist(selected, { stage: 'done', completion: { confirmedAt: new Date().toISOString(), confirmedBy: userId, customsReference, releasedOn } })) {
                setCompletionOpen(false); setDetailTab('overview');
              }
            }} />}
          </>
        )}

        <div className="import-actions fwd-actions">
          {returnPending && (
            <p className="fwd-action-hint">화주 보완 회신을 기다리는 중에는 단계를 진행하지 않습니다.</p>
          )}
          {detailTab === 'review' && !returnPending && selected.stage === 'received' && (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void moveToStage(selected, 'review', 'review')}>
              서류 검토 시작
            </button>
          )}
          {detailTab === 'review' && !returnPending && selected.stage === 'review' && (
            <>
              <button type="button" className="btn btn-primary" disabled={saving || !canFinishReview} onClick={() => void moveToStage(selected, 'clearance', 'documents')}>
                검토 완료 · 도착통지서 작성
              </button>
              {!canFinishReview && <p className="fwd-action-hint">필수 확인 항목의 검토 근거를 기록하거나 화주에게 보완을 요청해 주세요.</p>}
            </>
          )}
          {detailTab === 'overview' && !returnPending && selected.stage === 'clearance' && !completionOpen && (
            <>
              <button type="button" className="btn btn-primary" disabled={saving || selected.blockerCount > 0 || returnPending} onClick={() => finishClearance(selected)}>
                <CheckCircle2 size={15} /> 수입 업무 완료
              </button>
              <p className="fwd-action-hint">{selected.blockerCount > 0 ? '미해결 차단 이슈를 먼저 검토해 주세요.' : '실제 신고수리·반출을 확인한 뒤 완료 근거를 남깁니다.'}</p>
            </>
          )}
          {detailTab === 'overview' && !returnPending && selected.stage === 'done' && (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void moveToStage(selected, 'clearance', 'overview')}>
              업무 다시 열기
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------- 업무 큐(목록) 화면 ----------
  const summary = {
    active: cases?.filter((item) => item.stage !== 'done').length ?? 0,
    blockers: cases?.filter((item) => item.stage !== 'done' && item.blockerCount > 0).length ?? 0,
  };
  const visibleCases = (cases ?? []).filter((item) => {
    if (search.trim() && ![item.importer, item.blNo, item.vesselName].join(' ').toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (queueFilter === 'active') return item.stage !== 'done';
    if (queueFilter === 'mine') return item.stage !== 'done' && documentTask(item).owner === '포워더';
    if (queueFilter === 'waiting') return item.stage !== 'done' && documentTask(item).owner === '화주';
    return item.stage === 'done';
  });
  const filterOptions: { value: QueueFilter; label: string; count: number }[] = [
    { value: 'active', label: '진행 중', count: summary.active },
    { value: 'mine', label: '포워더 처리', count: cases?.filter((item) => item.stage !== 'done' && documentTask(item).owner === '포워더').length ?? 0 },
    { value: 'waiting', label: '화주 회신 대기', count: cases?.filter((item) => item.stage !== 'done' && documentTask(item).owner === '화주').length ?? 0 },
    { value: 'done', label: '완료', count: cases?.filter((item) => item.stage === 'done').length ?? 0 },
  ];

  return (
    <div className="fwd-workspace">
      <section className="form-card import-card">
        <div className="import-card-heading fwd-queue-heading">
          <div>
            <h2><FileText size={18} /> 받은 서류·의뢰</h2>
            <p className="fwd-queue-status"><strong>진행 중 {summary.active}건</strong>{summary.blockers > 0 && <> · <span>우선 확인 {summary.blockers}건</span></>}</p>
          </div>
          <div className="fwd-queue-actions">
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />{loading ? '조회 중' : '새로고침'}</button>
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
                aria-pressed={queueFilter === option.value}
                onClick={() => setQueueFilter(option.value)}
              >
                {option.label} <span>{option.count}</span>
              </button>
            ))}
          </div>
        )}

        {cases !== null && cases.length > 0 && <div className="fwd-search-row"><label className="fwd-search"><Search size={16} /><input aria-label="수입 의뢰 검색" placeholder="B/L 번호, 수입자, 선박 검색" value={search} onChange={(e) => setSearch(e.target.value)} /></label><span className="fwd-sort-note">우선 확인 · 업무 단계 · ETA 순</span></div>}
        {cases === null && loading && <p className="fwd-empty" role="status">업무 목록을 불러오는 중…</p>}

        {cases !== null && cases.length === 0 && (
          <div className="fwd-empty">
            <Inbox size={28} />
            <p><strong>접수된 수입 건이 없습니다.</strong></p>
            <p>화주가 수입 서류 분석을 완료해 전송하면 이곳에 의뢰로 도착합니다.<br />의뢰 없이 받은 서류는 [직접 등록]으로 시작할 수 있습니다.</p>
          </div>
        )}

        {cases !== null && cases.length > 0 && visibleCases.length === 0 && (
          <div className="fwd-empty"><Inbox size={30} /><p><strong>{search ? '검색 결과가 없습니다.' : queueFilter === 'active' ? '진행 중인 수입 의뢰가 없습니다.' : '이 조건에 해당하는 의뢰가 없습니다.'}</strong></p>
            {!search && queueFilter === 'active' && filterOptions[3].count > 0 && <button type="button" className="fwd-text-button" onClick={() => setQueueFilter('done')}>완료된 의뢰 {filterOptions[3].count}건 보기 <ChevronRight size={14} /></button>}
          </div>
        )}

        {cases !== null && visibleCases.length > 0 && (
          <div className="import-table-wrap">
            <table className="import-table fwd-queue-table">
              <thead>
                <tr><th>ETA</th><th>수입 건</th><th>상태</th><th>담당 · 다음 서류 작업</th></tr>
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
                      <button type="button" className="fwd-case-link" onClick={(e) => { e.stopPropagation(); openCase(item.tradeId); }}>{item.blNo === '-' ? 'B/L 미등록' : item.blNo}<ChevronRight size={14} /></button>
                      <span>{item.importer} · {item.vesselName || '선박 미등록'}</span>
                        {item.origin === 'shipper_request' && <span className="fwd-origin is-request">화주 의뢰</span>}
                        <small className="fwd-mobile-next">{documentTask(item).owner} · {documentTask(item).action}</small>
                      </td>
                      <td>
                        <span className={`fwd-stage-badge ${STAGE_BADGE_CLASS[item.stage]}`}>{DOCUMENT_STAGE_LABEL[item.stage]}</span>
                        {item.returnRequest && (
                          <span className={`fwd-return-badge${item.returnRequest.resolvedAt ? ' is-resolved' : ''}`}>
                            {item.returnRequest.resolvedAt ? '재제출됨' : item.shipperEditing ? '화주 수정 중' : '보완 요청'}
                          </span>
                        )}
                      </td>
                      <td className="fwd-next-cell"><strong>{documentTask(item).owner}</strong><br />{documentTask(item).action}{item.blockerCount > 0 && <span className="fwd-blocker-inline">차단 {item.blockerCount}</span>}</td>
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
