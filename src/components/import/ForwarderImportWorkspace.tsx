/**
 * 포워더 수입 워크스페이스 — 여러 수입 건을 관리하는 업무 큐 + 건별 상세.
 *
 * 화주의 3단계 위저드와 달리 진행 상태·다음 조치 중심으로 구성한다.
 *  - 목록: ETA·수입 건·상태·다음 조치
 *  - 상세: 서류 검토 / 요청·회신 / 후속 서류 (상태 변경 규칙은 유지)
 * 운영 상태는 forwarderCaseService를 통해 workflow_data.forwarderCase에 저장한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, CornerUpLeft, Download, ExternalLink, Mail } from 'lucide-react';
import {
  FORWARDER_STAGE_LABEL,
  FORWARDER_STAGE_ORDER,
  type ForwarderCaseStage,
  type ForwarderCaseState,
  type ForwarderImportCase,
} from '../../types/forwarderCase';
import type {
  ArrivalNoticeMeta,
  DispatchSettlement,
  DispatchVehicleType,
  ImportDispatchRequest,
  ImportDocumentMeta,
} from '../../types/importTrade';
import { downloadDispatchRequestDocx } from '../../services/importDispatchDocxService';
import {
  deriveForwarderCase,
  listForwarderCases,
  saveForwarderCaseState,
} from '../../services/forwarderCaseService';
import ForwarderCargoPanel from './ForwarderCargoPanel';
import { IMPORT_DOCUMENT_TYPE_LABELS } from '../../services/importDocumentAnalysisService';
import { loadTradeAttachmentFile } from '../../services/tradeAttachmentStorageService';
import { downloadArrivalNoticeDocx } from '../../services/arrivalNoticeDocxService';
import ImportDocumentComparison from './ImportDocumentComparison';
import ArrivalNoticeUploader from './ArrivalNoticeUploader';
import ForwarderImportInbox from './ForwarderImportInbox';
import ForwarderIssueReview from './ForwarderIssueReview';
import ForwarderDocumentThumbnail from './ForwarderDocumentThumbnail';
import ForwarderReturnRequestContent, { buildReturnRequestLetter } from './ForwarderReturnRequestContent';
import ForwarderRequestMessages from './ForwarderRequestMessages';
import { getInboxImporterName } from '../../utils/forwarderInbox';
import '../../styles/forwarderPolish.css';
import '../../styles/forwarderRequest.css';
import SentConfirmation from '../common/SentConfirmation';

interface Props {
  userId: string;
  /** A/N 레터헤드에 들어갈 발행 포워더 상호 */
  issuerName?: string;
  senderContactName?: string;
  /** Pre-alert를 화주 의뢰 없이 직접 등록해야 할 때 기존 업로드 플로우로 전환 */
  onDirectUpload: () => void;
  /** 알림에서 들어온 경우 해당 의뢰 상세를 바로 연다. */
  initialTradeId?: string | null;
  onInitialTradeOpened?: () => void;
}

const STAGE_BADGE_CLASS: Record<ForwarderCaseStage, string> = {
  received: 'fwd-stage-received',
  review: 'fwd-stage-review',
  clearance: 'fwd-stage-clearance',
  done: 'fwd-stage-done',
};

type DetailTab = 'review' | 'messages' | 'clearance';

/** 원본 미리보기 하단의 서류 약칭. */
const DOC_THUMB_ABBR: Record<string, string> = {
  commercial_invoice: 'C/I',
  packing_list: 'P/L',
  bill_of_lading: 'B/L',
  certificate_of_origin: 'C/O',
};

// AI 추출 ETA는 ISO(2026-09-20)일 수도, 원문 표기(SEP. 20, 2026)일 수도 있다.
// ISO가 아닌 문자열을 10글자로 자르면 연도가 잘려 엉뚱한 날짜가 되므로 ISO일 때만 자른다.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function formatEta(eta: string): string {
  if (!eta) return '미정';
  return ISO_DATE.test(eta) ? eta.slice(0, 10) : eta;
}

/** ETA까지 남은 날짜 배지 — 임박(D-3 이내)·지남을 색으로 구분해 우선순위를 보여준다 */
function etaDday(eta: string): { label: string; tone: 'overdue' | 'imminent' | 'normal' } | null {
  if (!eta) return null;
  const date = new Date(ISO_DATE.test(eta) ? eta.slice(0, 10) : eta);
  if (Number.isNaN(date.getTime())) return null;
  // 연도가 잘리거나 빠진 추출값이 과거·미래의 엉뚱한 연도로 파싱되면 배지를 숨긴다
  const year = date.getFullYear();
  const thisYear = new Date().getFullYear();
  if (year < thisYear - 1 || year > thisYear + 1) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: `D+${-days}`, tone: 'overdue' };
  if (days === 0) return { label: 'D-DAY', tone: 'imminent' };
  return { label: `D-${days}`, tone: days <= 3 ? 'imminent' : 'normal' };
}

export default function ForwarderImportWorkspace({
  userId,
  issuerName = '',
  senderContactName = '',
  onDirectUpload,
  initialTradeId = null,
  onInitialTradeOpened,
}: Props) {
  const [cases, setCases] = useState<ForwarderImportCase[] | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [returnFormOpen, setReturnFormOpen] = useState(false);
  // 보완 요청 전송 완료 안내 — 요청·회신 탭으로 넘어간 뒤 그 위에 띄운다.
  const [returnSentOpen, setReturnSentOpen] = useState(false);
  const returnFormRef = useRef<HTMLDivElement>(null);
  const [returnFormFocusKey, setReturnFormFocusKey] = useState(0);
  useEffect(() => {
    if (returnFormFocusKey > 0 && returnFormOpen) {
      returnFormRef.current?.scrollIntoView({ block: 'nearest' });
      returnFormRef.current?.focus({ preventScroll: true });
    }
  }, [returnFormFocusKey, returnFormOpen]);
  // 보완 요청은 이슈를 골라 보낸다 — 선택된 이슈가 곧 요청 내용, 메모는 부가 안내.
  const [returnPicks, setReturnPicks] = useState<Record<string, boolean>>({});
  const [returnMemo, setReturnMemo] = useState('');
  const [finishReviewOpen, setFinishReviewOpen] = useState(false);
  const [finishReviewReason, setFinishReviewReason] = useState('');
  const [detailTab, setDetailTab] = useState<DetailTab>('review');
  const [docBusyId, setDocBusyId] = useState<string | null>(null);
  const [anBusy, setAnBusy] = useState(false);
  const [anFileBusy, setAnFileBusy] = useState(false);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  /** 배차 의뢰 입력 — 저장 전까지 화면에만 두고, 생성 시 케이스에 기록한다. */
  const [dispatchDraft, setDispatchDraft] = useState<Record<string, ImportDispatchRequest>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      setCases(await listForwarderCases());
    } catch (err) {
      console.error('포워더 업무 큐 조회 실패:', err);
      setError('업무 목록을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!initialTradeId || !cases?.some((item) => item.tradeId === initialTradeId)) return;
    setSelectedId(initialTradeId);
    setDetailTab('messages');
    onInitialTradeOpened?.();
  }, [cases, initialTradeId, onInitialTradeOpened]);

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
    patch: Partial<Omit<ForwarderCaseState, 'updatedAt' | 'activity'>>,
    appendActivity: string[] = [],
  ): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setError('');
    try {
      const next = await saveForwarderCaseState(caseItem.tradeId, patch, appendActivity);
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
    const STAGE_ACTIVITY: Record<ForwarderCaseStage, string> = {
      received: '의뢰 접수 단계로 이동',
      review: '서류 검토 시작',
      clearance: '통관·도착 관리 시작',
      done: '서류 업무 완료',
    };
    if (await persist(caseItem, { stage }, [STAGE_ACTIVITY[stage]])) setDetailTab(nextTab);
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

  const openArrivalFile = async (meta: ArrivalNoticeMeta, download: boolean) => {
    if (!meta.storageBucket || !meta.storagePath || anFileBusy) return;
    const previewWindow = download ? null : window.open('', '_blank');
    if (previewWindow) previewWindow.opener = null;
    setAnFileBusy(true);
    setError('');
    try {
      const file = await loadTradeAttachmentFile({ storageBucket: meta.storageBucket, storagePath: meta.storagePath, fileName: meta.fileName, mimeType: meta.mimeType, documentType: 'arrival_notice' }, userId);
      const url = URL.createObjectURL(file);
      if (download) {
        const link = document.createElement('a'); link.href = url; link.download = meta.fileName; document.body.appendChild(link); link.click(); link.remove();
      } else if (previewWindow) previewWindow.location.href = url;
      else setError('팝업이 차단되었습니다. 팝업을 허용하거나 다운로드를 이용하세요.');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      previewWindow?.close();
      setError('도착통지서를 열지 못했습니다. 다시 시도해 주세요.');
    } finally { setAnFileBusy(false); }
  };

  const openCase = (tradeId: string) => {
    setSelectedId(tradeId);
    setFinishReviewOpen(false);
    setFinishReviewReason('');
    setReturnFormOpen(false);
    setReturnPicks({});
    setReturnMemo('');
    setDetailTab('review');
  };

  const finishClearance = (caseItem: ForwarderImportCase) => {
    const arrivalNoticeNote = caseItem.arrivalNotice?.storagePath
      ? ''
      : '\n\n도착통지서(A/N)가 첨부되지 않았습니다.';
    if (window.confirm(`이 건의 서류 업무를 완료 처리할까요?${arrivalNoticeNote}\n\n실제 통관 상태는 바뀌지 않습니다. 완료 후에는 업무 큐의 서류 완료 목록으로 이동합니다.`)) {
      void moveToStage(caseItem, 'done', 'clearance');
    }
  };

  // ---------- 상세 화면 ----------
  if (selected) {
    const stageIndex = FORWARDER_STAGE_ORDER.indexOf(selected.stage);
    const blockers = selected.issues.filter((issue) => issue.severity === 'blocker');
    const checks = selected.issues.filter((issue) => issue.severity === 'check');
    const infos = selected.issues.filter((issue) => issue.severity === 'info');
    const sourceDocs = selected.snapshot.documents.filter((doc) => doc.storagePath);
    const pendingIssues = selected.issues.filter(issue => !issue.resolved);
    const pendingBlockers = pendingIssues.filter(issue => issue.severity === 'blocker');
    const pickedIssues = pendingIssues.filter(issue => issue.severity !== 'info' && returnPicks[issue.id]);
    // 화주가 입력한 배송 요청 — 배차 의뢰서의 배송지 칸으로 그대로 넘어간다.
    const deliveryRequest = selected.snapshot.deliveryRequest;
    const dispatch: ImportDispatchRequest = dispatchDraft[selected.tradeId]
      ?? (selected.trade.forwarderCase as ForwarderCaseState | null)?.dispatchRequest
      ?? {
        carrierCompany: '', attention: '', doNo: '', terminal: '',
        pickupPlace: '', pickupAt: '', emptyReturnPlace: '', emptyReturnDue: '',
        vehicleType: '', settlement: '', remarks: '',
        vehicleNo: '', driverName: '', driverTel: '', issuedAt: '',
      };
    const patchDispatch = (patch: Partial<ImportDispatchRequest>) => {
      setDispatchDraft((current) => ({
        ...current,
        [selected.tradeId]: { ...dispatch, ...patch },
      }));
    };
    const returnPending = Boolean(selected.returnRequest && !selected.returnRequest.resolvedAt);
    const documentsLocked = stageIndex < FORWARDER_STAGE_ORDER.indexOf('clearance') || returnPending;
    const documentLockReason = returnPending ? '화주 회신·재검토 후 사용 가능' : '서류 검토 후 사용 가능';

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
            <h2>{getInboxImporterName(selected) === '화주명 미입력' ? '' : `${getInboxImporterName(selected)} · `}B/L {selected.blNo}</h2>
            <span className={`fwd-origin ${selected.origin === 'shipper_request' ? 'is-request' : ''}`}>
              {selected.origin === 'shipper_request' ? '화주 의뢰' : '직접 등록'}
            </span>
          </div>
          <dl className="fwd-head-grid">
            <div><dt>송하인</dt><dd>{selected.shipperName || '미입력'}</dd></div>
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

        <nav className="fwd-tabs" aria-label="수입 업무 상세 탭">
          <button type="button" aria-current={detailTab === 'review' ? 'page' : undefined} className={detailTab === 'review' ? 'is-active' : ''} onClick={() => setDetailTab('review')}>서류 검토</button>
          <button type="button" aria-current={detailTab === 'messages' ? 'page' : undefined} className={detailTab === 'messages' ? 'is-active' : ''} onClick={() => setDetailTab('messages')}>요청·회신{selected.returnRequest?.resolvedAt && <span className="fwd-tab-notice">회신 도착</span>}</button>
          <button type="button" aria-current={detailTab === 'clearance' ? 'page' : undefined} className={detailTab === 'clearance' ? 'is-active' : ''} onClick={() => setDetailTab('clearance')}>통관·도착</button>
        </nav>

        {detailTab === 'messages' && <div className="fwd-message-toolbar"><span>화주와 주고받은 보완 요청 및 회신</span><button type="button" className="btn btn-secondary" disabled={refreshing} onClick={() => void load()}>{refreshing ? '확인 중…' : '새 회신 확인'}</button></div>}

        {detailTab === 'messages' && selected.returnRequest && (
          <ForwarderRequestMessages
            item={selected}
            documents={sourceDocs}
            documentBusy={docBusyId !== null}
            saving={saving}
            onOpenDocument={doc => void openSourceDocument(doc)}
            onReview={async () => { if (await persist(selected, { returnRequest: null, stage: 'review' }, ['재검토 시작'])) setDetailTab('review'); }}
            onCancel={() => void persist(selected, { returnRequest: null }, ['보완 요청 취소'])}
          />
        )}

        {detailTab === 'messages' && !selected.returnRequest && (
          <section className="form-card import-card fwd-message-empty">
            <span className="fwd-message-empty-icon" aria-hidden="true"><Mail size={22} /></span>
            <div className="fwd-message-empty-copy">
              <h2>아직 보낸 요청이 없습니다.</h2>
              <p>서류 검토에서 필요한 항목을 선택하면 보완 요청을 보낼 수 있어요.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setDetailTab('review')}>서류 검토로 이동 <span aria-hidden="true">→</span></button>
          </section>
        )}

        {detailTab === 'review' && selected.returnRequest && <div className="fwd-message-link">
          <span>{selected.returnRequest.resolvedAt ? '화주의 보완 회신이 도착했습니다.' : selected.shipperEditing ? '화주가 서류를 수정하고 있습니다.' : '화주에게 보완을 요청했습니다. 회신 대기 중입니다.'}</span>
          <button type="button" onClick={() => setDetailTab('messages')}>요청·회신 보기 →</button>
        </div>}

        {detailTab === 'review' && (
          <section className="form-card import-card">
            <div className="import-card-heading">
              <div><h2>화주가 제출한 서류 <span className="fwd-doc-count">{sourceDocs.length}</span></h2></div>
            </div>
            {sourceDocs.length === 0 && <p className="fwd-doc-empty">보관된 원본 파일이 없습니다.</p>}
            <div className="fwd-doc-gallery">
              {sourceDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  className="fwd-doc-thumb"
                  disabled={docBusyId !== null}
                  title={doc.name}
                  aria-label={`${doc.name} 원본 서류 열기`}
                  onClick={() => void openSourceDocument(doc)}
                >
                  <ForwarderDocumentThumbnail document={doc} userId={userId} />
                  <span className="fwd-doc-thumb-foot">
                    {DOC_THUMB_ABBR[doc.type] ?? IMPORT_DOCUMENT_TYPE_LABELS[doc.type] ?? '기타'}
                    {docBusyId === doc.id ? <span className="fwd-doc-opening">여는 중…</span> : <ExternalLink size={14} />}
                  </span>
                  <span className="fwd-doc-filename">{doc.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {detailTab === 'review' && (blockers.length > 0 || checks.length > 0 || infos.length > 0) && (
          <section className="form-card import-card">
            <ForwarderIssueReview
              key={selected.tradeId}
              issues={selected.issues}
              notes={selected.issueNotes}
              saving={saving}
              comparisons={selected.snapshot.analysis.comparison}
              documents={selected.snapshot.documents}
              documentBusyId={docBusyId}
              onOpenDocument={(document) => void openSourceDocument(document)}
              requestPicks={returnPicks}
              onToggleRequest={!selected.returnRequest && (selected.stage === 'received' || selected.stage === 'review') ? (issue, checked) => {
                setReturnPicks(current => ({ ...current, [issue.id]: checked }));
                setFinishReviewOpen(false);
              } : undefined}
              onResolve={(issue, note) => persist(
                selected,
                { issueResolutions: { [issue.id]: true }, ...(note ? { issueNotes: { [issue.id]: note } } : {}) },
                [`'${issue.title}' 확인 종결${note ? ` — ${note}` : ''}`],
              )}
              onReopen={(issue) => persist(
                selected,
                { issueResolutions: { [issue.id]: false } },
                [`'${issue.title}' 종결 취소`],
              )}
            />


          </section>
        )}


        {detailTab === 'review' && !selected.returnRequest && (selected.stage === 'received' || selected.stage === 'review') && (
          <section className="fwd-batch-review" aria-label="검토 후 다음 작업">
            {!finishReviewOpen && !returnFormOpen && <div className="fwd-batch-toolbar">
              <span>{pickedIssues.length ? `보완 요청 ${pickedIssues.length}건 선택` : '보완이 필요한 항목만 체크하세요.'}</span>
              <div>
                <button type="button" className={`btn ${pickedIssues.length ? 'btn-primary' : 'btn-secondary'}`} disabled={saving || pickedIssues.length === 0} onClick={() => { setReturnFormOpen(true); setFinishReviewOpen(false); setReturnFormFocusKey(current => current + 1); }}>선택한 {pickedIssues.length}건 보완 요청</button>
                <button type="button" className="btn btn-primary" disabled={saving || pickedIssues.length > 0} onClick={() => { setFinishReviewOpen(true); setReturnFormOpen(false); }}>전체 검토 완료 → 통관·도착</button>
              </div>
            </div>}
            {returnFormOpen && (() => {
              const sections = [
                pickedIssues.filter(issue => issue.severity === 'blocker').length ? '[반드시 수정]\n' + pickedIssues.filter(issue => issue.severity === 'blocker').map(issue => `· ${issue.title} — ${issue.detail}`).join('\n') : '',
                pickedIssues.filter(issue => issue.severity === 'check').length ? '[함께 확인 요청]\n' + pickedIssues.filter(issue => issue.severity === 'check').map(issue => `· ${issue.title} — ${issue.detail}`).join('\n') : '',
                returnMemo.trim() ? '(추가 안내) ' + returnMemo.trim() : '',
              ].filter(Boolean);
              const reason = buildReturnRequestLetter(sections.join('\n\n'), issuerName, senderContactName);
              return <div className="fwd-batch-composer" ref={returnFormRef} tabIndex={-1} aria-label="보완 요청문 확인">
                <h3>보완 요청문 · {pickedIssues.length}건</h3>
                <ForwarderReturnRequestContent reason={reason} />
                <label className="form-group"><span className="form-label">추가 안내 (선택)</span><textarea className="form-input fwd-return-textarea" rows={2} value={returnMemo} onChange={event => setReturnMemo(event.target.value)} /></label>
                <div className="fwd-return-actions">
                  <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setReturnFormOpen(false)}>닫기</button>
                  <button type="button" className="btn btn-primary" disabled={saving || pickedIssues.length === 0} onClick={async () => {
                    if (saving || pickedIssues.length === 0 || selected.returnRequest) return;
                    const saved = await persist(selected, { stage: 'review', returnRequest: { reason, issueTitles: pickedIssues.map(issue => issue.title), requestedAt: new Date().toISOString() } }, [`화주에게 보완 요청 (${pickedIssues.length}건: ${pickedIssues.map(issue => issue.title).join(', ')})`]);
                    if (saved) { setReturnFormOpen(false); setReturnPicks({}); setReturnMemo(''); setDetailTab('messages'); setReturnSentOpen(true); }
                  }}><CornerUpLeft size={15} />{saving ? '보내는 중…' : `보완 요청 보내기 (${pickedIssues.length}건)`}</button>
                </div>
              </div>;
            })()}
            {finishReviewOpen && <div className="fwd-batch-confirm" role="region" aria-label="전체 검토 완료 확인">
              <h3>서류 검토 완료 확인</h3>
              {pendingBlockers.length > 0
                ? <><p>필수 확인 항목이 남아 있습니다. 보완 없이 완료 처리하려면 확인한 근거를 남겨주세요.</p><div className="fwd-batch-outstanding"><strong>남은 필수 확인 · {pendingBlockers.length}건</strong><ul>{pendingBlockers.map(issue => <li key={issue.id}><b>{issue.title}</b><span>{issue.detail}</span></li>)}</ul></div></>
                : <p>서류 검토를 완료하고 다음 업무로 이동합니다.</p>}
              <label className="form-group"><span className="form-label">{pendingBlockers.length ? '검토 근거 (필수)' : '검토 메모 (선택)'}</span><textarea className="form-input" aria-label="전체 검토 근거" rows={2} value={finishReviewReason} onChange={event => setFinishReviewReason(event.target.value)} placeholder="원본이나 담당자에게 확인한 내용과 보완이 필요 없는 이유" /></label>
              <div className="fwd-return-actions">
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setFinishReviewOpen(false)}>계속 검토</button>
                <button type="button" className="btn btn-primary" disabled={saving || pickedIssues.length > 0 || (pendingBlockers.length > 0 && !finishReviewReason.trim())} onClick={async () => {
                  if (saving || selected.returnRequest || pickedIssues.length || (pendingBlockers.length && !finishReviewReason.trim())) return;
                  const note = finishReviewReason.trim();
                  if (await persist(selected, { stage: 'clearance', issueResolutions: Object.fromEntries(pendingIssues.map(issue => [issue.id, true])), ...(note ? { issueNotes: Object.fromEntries(pendingIssues.map(issue => [issue.id, [selected.issueNotes[issue.id], note].filter(Boolean).join('\n')])) } : {}) }, [`전체 서류 검토 완료${note ? ' — ' + note : ''}`])) {
                    setFinishReviewOpen(false); setFinishReviewReason(''); setDetailTab('clearance');
                  }
                }}>검토 완료 · 통관·도착으로</button>
              </div>
            </div>}
          </section>
        )}

        {detailTab === 'messages' && selected.activity.length > 0 && (
          <section className="form-card import-card">
            <div className="import-card-heading"><div><h2>처리 이력</h2><p>이 건에 대한 판단·요청·회신이 시간순으로 기록됩니다.</p></div></div>
            <ol className="fwd-activity">
              {[...selected.activity].reverse().map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <span className="fwd-activity-time">
                    {new Date(entry.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="fwd-activity-text">{entry.text}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {detailTab === 'review' && <details className="fwd-all-comparisons"><summary>전체 비교 결과 보기 · {selected.snapshot.analysis.comparison.length}개 항목</summary><ImportDocumentComparison title="서류 간 정보 비교" rows={selected.snapshot.analysis.comparison} /></details>}

        {detailTab === 'review' && blockers.length === 0 && checks.length === 0 && infos.length === 0 && (
          <section className="form-card import-card fwd-clear-overview">
            <CheckCircle2 size={20} /> <div><strong>지금 확인할 이슈가 없습니다.</strong><span>다음 조치를 진행해 주세요.</span></div>
          </section>
        )}

        <div hidden={detailTab !== 'clearance'}><ForwarderCargoPanel key={selected.tradeId} initialBlNo={selected.blNo} /></div>

        {detailTab === 'clearance' && (
          <>
            {documentsLocked && <div className="fwd-document-lock" role="status"><span>{returnPending ? '화주 회신을 재검토하면 도착통지서와 배차 의뢰서를 작성할 수 있습니다.' : '서류 검토를 완료하면 도착통지서와 배차 의뢰서를 작성할 수 있습니다.'}</span><button type="button" className="btn btn-secondary" onClick={() => setDetailTab('review')}>서류 검토로 이동</button></div>}
            <ArrivalNoticeUploader
              workspaceMode
              showDisabledReason={false}
              disabledReason={documentsLocked ? documentLockReason : undefined}
              fileActions={selected.arrivalNotice?.storagePath ? <div className="fwd-an-file-actions"><button type="button" className="btn btn-secondary" disabled={anFileBusy} onClick={() => void openArrivalFile(selected.arrivalNotice!, false)}>원본 열기</button><button type="button" className="btn btn-secondary" disabled={anFileBusy} onClick={() => void openArrivalFile(selected.arrivalNotice!, true)}>다운로드</button></div> : undefined}
              value={selected.arrivalNotice}
              onChange={(arrivalNotice) => void persist(selected, { arrivalNotice })}
              userId={userId}
              tradeId={selected.tradeId}
              readOnly={saving || documentsLocked}
              headerAction={(
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={anBusy || documentsLocked || saving}
                  title={documentsLocked ? documentLockReason : undefined}
                  onClick={() => {
                    if (documentsLocked || saving) return;
                    setAnBusy(true);
                    void downloadArrivalNoticeDocx(selected, issuerName, senderContactName)
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
              notice={documentsLocked ? undefined : '한영 병기 · 비용 제외 · 도착 정보 확인 후 사용'}
            />

            {/* 배차 의뢰서 — D/O를 받은 뒤 운송사에 보내는 서류.
                상차지·공컨 반납지·차량은 포워더가 선사·터미널과 정하고,
                배송지 관련 칸은 화주가 입력한 배송 요청에서 자동으로 채워진다. */}
            <section className="form-card import-card">
              <div className="import-card-heading">
                <div><h2><span className="fwd-section-number">3</span> 국내 운송 준비</h2></div>
              </div>

              {deliveryRequest ? (
                <div className="fwd-delivery-note">
                  <strong>화주 배송 요청</strong>
                  <p>
                    {deliveryRequest.deliveryAddress || '(배송지 미입력)'}
                    {deliveryRequest.deliveryAt ? ` · 희망 ${deliveryRequest.deliveryAt.replace('T', ' ').slice(0, 16)}` : ''}
                  </p>
                  {(deliveryRequest.contactName || deliveryRequest.contactTel) && (
                    <p>수령 담당자 {deliveryRequest.contactName} {deliveryRequest.contactTel}</p>
                  )}
                  {deliveryRequest.remarks && <p>요청사항: {deliveryRequest.remarks}</p>}
                </div>
              ) : (
                <p className="fwd-action-hint">배송 요청 미등록</p>
              )}

              <fieldset className="fwd-dispatch-fields" disabled={documentsLocked || saving || dispatchBusy} aria-label="배차 의뢰서 작성">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-carrier">수신 운송사</label>
                  <input id="dr-carrier" className="form-input" value={dispatch.carrierCompany}
                    onChange={(e) => patchDispatch({ carrierCompany: e.target.value })} placeholder="운송사 상호" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-attn">참조 (담당자)</label>
                  <input id="dr-attn" className="form-input" value={dispatch.attention}
                    onChange={(e) => patchDispatch({ attention: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-do">D/O 번호</label>
                  <input id="dr-do" className="form-input" value={dispatch.doNo}
                    onChange={(e) => patchDispatch({ doNo: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-terminal">터미널 / 장치장</label>
                  <input id="dr-terminal" className="form-input" value={dispatch.terminal}
                    onChange={(e) => patchDispatch({ terminal: e.target.value })} placeholder="예: 부산신항 PNIT" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-pickup">상차지</label>
                  <input id="dr-pickup" className="form-input" value={dispatch.pickupPlace}
                    onChange={(e) => patchDispatch({ pickupPlace: e.target.value })} placeholder="비우면 터미널과 동일" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-pickup-at">상차 요청일시</label>
                  <input id="dr-pickup-at" type="datetime-local" className="form-input" value={dispatch.pickupAt}
                    onChange={(e) => patchDispatch({ pickupAt: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-empty">공컨테이너 반납지</label>
                  <input id="dr-empty" className="form-input" value={dispatch.emptyReturnPlace}
                    onChange={(e) => patchDispatch({ emptyReturnPlace: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-empty-due">반납기한</label>
                  <input id="dr-empty-due" type="date" className="form-input" value={dispatch.emptyReturnDue}
                    onChange={(e) => patchDispatch({ emptyReturnDue: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-vehicle">요청 차량</label>
                  <select id="dr-vehicle" className="form-input" value={dispatch.vehicleType}
                    onChange={(e) => patchDispatch({ vehicleType: e.target.value as DispatchVehicleType })}>
                    <option value="">선택하세요</option>
                    <option value="트랙터">트랙터</option>
                    <option value="카고">카고</option>
                    <option value="윙바디">윙바디</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-settle">운임 정산</label>
                  <select id="dr-settle" className="form-input" value={dispatch.settlement}
                    onChange={(e) => patchDispatch({ settlement: e.target.value as DispatchSettlement })}>
                    <option value="">선택하세요</option>
                    <option value="선불">선불</option>
                    <option value="착불">착불</option>
                    <option value="월마감">월마감</option>
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label" htmlFor="dr-remarks">특이사항</label>
                  <input id="dr-remarks" className="form-input" value={dispatch.remarks}
                    onChange={(e) => patchDispatch({ remarks: e.target.value })} />
                </div>
              </div>

              <details className="fwd-dispatch-reply"><summary>배차 회신 입력 · 차량·기사 정보</summary>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-vno">차량번호</label>
                  <input id="dr-vno" className="form-input" value={dispatch.vehicleNo}
                    onChange={(e) => patchDispatch({ vehicleNo: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-driver">기사명</label>
                  <input id="dr-driver" className="form-input" value={dispatch.driverName}
                    onChange={(e) => patchDispatch({ driverName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dr-driver-tel">기사 연락처</label>
                  <input id="dr-driver-tel" className="form-input" value={dispatch.driverTel}
                    onChange={(e) => patchDispatch({ driverTel: e.target.value })} />
                </div>
              </div>

              </details>
              <div className="document-preview-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={documentsLocked || saving || dispatchBusy || !dispatch.carrierCompany.trim()}
                  onClick={() => {
                    if (documentsLocked || saving) return;
                    setDispatchBusy(true);
                    void persist(
                      selected,
                      { dispatchRequest: { ...dispatch, issuedAt: new Date().toISOString() } },
                      [`배차 의뢰서 생성 — ${dispatch.carrierCompany.trim()}`],
                    )
                      .then(() => downloadDispatchRequestDocx(selected, dispatch, deliveryRequest, issuerName))
                      .catch((err) => {
                        console.error('배차 의뢰서 생성 실패:', err);
                        setError('배차 의뢰서를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
                      })
                      .finally(() => setDispatchBusy(false));
                  }}
                >
                  <Download size={16} /> {dispatchBusy ? '생성 중…' : '배차 의뢰서 생성·다운로드'}
                </button>
                {!documentsLocked && !dispatch.carrierCompany.trim() && (
                  <p className="fwd-action-hint">수신 운송사 입력 필요</p>
                )}
              </div>
              </fieldset>
            </section>

          </>
        )}

        <div className="import-actions fwd-actions">
          {detailTab === 'review' && returnPending && (
            <p className="fwd-action-hint">화주 보완 회신을 기다리는 중에는 단계를 진행하지 않습니다.</p>
          )}
          {detailTab === 'clearance' && !returnPending && selected.stage === 'clearance' && (
            <>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => finishClearance(selected)}>
                <CheckCircle2 size={15} /> 서류 업무 완료
              </button>
              <p className="fwd-action-hint">서류 업무 완료는 실제 통관 완료와 별개입니다.</p>
            </>
          )}
          {detailTab === 'clearance' && !returnPending && selected.stage === 'done' && (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void moveToStage(selected, 'clearance', 'clearance')}>
              서류 작업으로 되돌리기
            </button>
          )}
        </div>
        {returnSentOpen && (
          <div className="fwd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReturnSentOpen(false); }}>
            <div className="fwd-modal" role="dialog" aria-modal="true" aria-label="보완 요청 전송 완료">
              <SentConfirmation
                title="보완 요청을 보냈어요"
                message="화주가 서류를 고쳐 회신하면 요청·회신 탭에 표시돼요."
                actions={(
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => setReturnSentOpen(false)}>닫기</button>
                    <button type="button" className="btn btn-primary" onClick={() => { setDetailTab('messages'); setReturnSentOpen(false); }}>요청·회신 보기</button>
                  </>
                )}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return <ForwarderImportInbox cases={cases} error={error} refreshing={refreshing}
    onRefresh={() => void load()} onDirectUpload={onDirectUpload} onOpen={openCase} />;
}
