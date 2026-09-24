/**
 * 포워더 수입 워크스페이스 — 여러 수입 건을 관리하는 업무 큐 + 건별 상세.
 *
 * 화주의 3단계 위저드와 달리 진행 상태·다음 조치 중심으로 구성한다.
 *  - 목록: ETA·수입 건·상태·다음 조치
 *  - 상세: 서류 확인 / 업무 진행 / 업무 메시지 (상태 변경 규칙은 유지)
 * 운영 상태는 forwarderCaseService를 통해 workflow_data.forwarderCase에 저장한다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink, Mail } from 'lucide-react';
import {
  FORWARDER_STAGE_ORDER,
  FORWARDER_STAGE_LABEL,
  IMPORT_DECLARATION_STATUS_LABEL,
  IMPORT_DO_STATUS_LABEL,
  type ForwarderCaseStage,
  type ForwarderCaseState,
  type ForwarderImportCase,
} from '../../types/forwarderCase';
import type {
  ArrivalNoticeMeta,
  ImportDocumentMeta,
} from '../../types/importTrade';
import {
  deriveForwarderCase,
  listForwarderCases,
  saveForwarderCaseState,
} from '../../services/forwarderCaseService';
import ForwarderImportOperations from './ForwarderImportOperations';
import ForwarderExtractedSummary from './ForwarderExtractedSummary';
import { IMPORT_DOCUMENT_TYPE_LABELS } from '../../services/importDocumentAnalysisService';
import { loadTradeAttachmentFile } from '../../services/tradeAttachmentStorageService';
import { downloadArrivalNoticeDocx } from '../../services/arrivalNoticeDocxService';
import ArrivalNoticeUploader from './ArrivalNoticeUploader';
import ForwarderImportInbox from './ForwarderImportInbox';
import ImportHandoffReadyCard from './ImportHandoffReadyCard';
import { scrollPageToTop } from '../../utils/scrollPageToTop';
import ForwarderDocumentThumbnail from './ForwarderDocumentThumbnail';
import ForwarderRequestMessages from './ForwarderRequestMessages';
import TradeMessageThread from '../forwarder/TradeMessageThread';
import { listIncomingTradeRequests } from '../../services/forwarderRequestService';
import type { TradeRequest } from '../../types/forwarderRequest';
import { getInboxImporterName } from '../../utils/forwarderInbox';
import '../../styles/forwarderPolish.css';
import '../../styles/forwarderRequest.css';
import '../../styles/forwarderImportRefresh.css';
import SentConfirmation from '../common/SentConfirmation';

interface Props {
  userId: string;
  /** A/N 레터헤드에 들어갈 발행 포워더 상호 */
  issuerName?: string;
  senderContactName?: string;
  /** Pre-alert를 화주 의뢰 없이 직접 등록해야 할 때 기존 업로드 플로우로 전환 */
  onDirectUpload: () => void;
  /** 겸용 계정이면 자기 화주 제출 건도 의뢰 없이 큐에 표시 (단일 계정 시연) */
  includeOwnShipperTrades?: boolean;
  /** 알림에서 들어온 경우 해당 의뢰 상세를 바로 연다. */
  initialTradeId?: string | null;
  /** 알림에서 요청한 상세 탭 */
  initialTab?: 'review' | 'messages';
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
  includeOwnShipperTrades = false,
  initialTradeId = null,
  initialTab = 'messages',
  onInitialTradeOpened,
}: Props) {
  const [cases, setCases] = useState<ForwarderImportCase[] | null>(null);
  const [requests, setRequests] = useState<TradeRequest[]>([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 이미 보낸 보완 요청의 전송 완료 안내 — 기존 데이터 표시용으로만 남긴다.
  const [returnSentOpen, setReturnSentOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('review');
  const [docBusyId, setDocBusyId] = useState<string | null>(null);
  const [anBusy, setAnBusy] = useState(false);
  const [anFileBusy, setAnFileBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      setCases(await listForwarderCases({ includeOwnShipperTrades }));
    } catch (err) {
      console.error('포워더 업무 큐 조회 실패:', err);
      setError('업무 목록을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.');
    } finally {
      setRefreshing(false);
    }
    // 의뢰 조회 실패는 업무 목록을 막지 않는다 — 대화 탭만 비워진다.
    try {
      setRequests(await listIncomingTradeRequests());
    } catch (err) {
      console.warn('받은 의뢰 조회 실패:', err);
      setRequests([]);
    }
  }, [includeOwnShipperTrades]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!initialTradeId || !cases) return;
    // 아직 수락 전이라 내 업무 목록에 없는 건은 열 수 없다 — 대상을 비워 나중에 뜬금없이 열리지 않게 한다.
    if (!cases.some((item) => item.tradeId === initialTradeId)) {
      onInitialTradeOpened?.();
      return;
    }
    setSelectedId(initialTradeId);
    setDetailTab(initialTab);
    onInitialTradeOpened?.();
  }, [cases, initialTradeId, initialTab, onInitialTradeOpened]);

  const selected = useMemo(
    () => cases?.find((item) => item.tradeId === selectedId) ?? null,
    [cases, selectedId],
  );

  /** 선택한 건의 의뢰 — 수락된 것이 있으면 그것, 없으면 가장 최근 것. 직접 등록 건은 null. */
  const selectedRequest = useMemo(() => {
    if (!selected) return null;
    const mine = requests.filter((item) => item.tradeId === selected.tradeId);
    return mine.find((item) => item.status === 'accepted') ?? mine[0] ?? null;
  }, [requests, selected]);

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
      review: '서류 확인 시작',
      clearance: '신고·통관 업무 시작',
      done: '포워더 업무 완료',
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
    setDetailTab('review');
    scrollPageToTop();
  };

  const finishClearance = (caseItem: ForwarderImportCase) => {
    const operations = (caseItem.trade.forwarderCase as ForwarderCaseState | null)?.importOperations;
    const declarationStatus = operations?.declarationStatus;
    const doStatus = operations?.doStatus;
    const warnings = [
      ...(!caseItem.arrivalNotice?.storagePath ? ['도착통지서(A/N): 미첨부'] : []),
      ...(declarationStatus !== 'cleared'
        ? [`신고 상태: ${declarationStatus ? IMPORT_DECLARATION_STATUS_LABEL[declarationStatus] : '미기록'}`]
        : []),
      ...(doStatus !== 'received'
        ? [`D/O 상태: ${doStatus ? `${IMPORT_DO_STATUS_LABEL[doStatus]} (미수령)` : '미기록'}`]
        : []),
    ];
    const warningNote = warnings.length ? `\n\n완료 전 확인할 항목:\n${warnings.map((warning) => `• ${warning}`).join('\n')}` : '';
    if (window.confirm(`이 건의 포워더 업무를 완료 처리할까요?${warningNote}\n\n이 처리는 실제 세관 신고·화물 반출 상태를 변경하지 않습니다. 완료 후에는 업무 큐의 업무 완료 목록으로 이동합니다.`)) {
      void moveToStage(caseItem, 'done', 'clearance');
    }
  };

  // ---------- 상세 화면 ----------
  if (selected) {
    const stageIndex = FORWARDER_STAGE_ORDER.indexOf(selected.stage);
    const sourceDocs = selected.snapshot.documents.filter((doc) => doc.storagePath);
    const returnPending = Boolean(selected.returnRequest && !selected.returnRequest.resolvedAt);
    const documentsLocked = stageIndex < FORWARDER_STAGE_ORDER.indexOf('clearance') || returnPending;
    const documentLockReason = returnPending ? '화주 회신·재검토 후 사용 가능' : '서류 검토 후 사용 가능';

    return (
      <div className="fwd-workspace fwd-import-refresh">
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
            <p className="fwd-next-banner">다음 조치: <strong>{selected.returnRequest ? selected.returnRequest.resolvedAt ? '화주가 보낸 회신과 수정 서류를 확인하세요.' : '화주의 보완 회신을 기다리고 있습니다.' : selected.stage === 'clearance' ? '신고자료를 준비하고 통관·D/O 진행을 기록하세요.' : '제출 서류와 추출 정보를 확인한 뒤 신고자료를 준비하세요.'}</strong></p>
          )}
        </section>

        {error && <div className="form-message error">{error}</div>}

        <nav className="fwd-tabs" aria-label="수입 업무 상세 탭">
          <button type="button" aria-current={detailTab === 'review' ? 'page' : undefined} className={detailTab === 'review' ? 'is-active' : ''} onClick={() => setDetailTab('review')}>서류 확인</button>
          <button type="button" aria-current={detailTab === 'clearance' ? 'page' : undefined} className={detailTab === 'clearance' ? 'is-active' : ''} onClick={() => setDetailTab('clearance')}>업무 진행</button>
          <button type="button" aria-current={detailTab === 'messages' ? 'page' : undefined} className={detailTab === 'messages' ? 'is-active' : ''} onClick={() => setDetailTab('messages')}>업무 메시지{selected.returnRequest?.resolvedAt && <span className="fwd-tab-notice">회신 도착</span>}</button>
        </nav>

        {detailTab === 'messages' && <div className="fwd-message-toolbar"><span>화주와 주고받은 대화와 보완 요청</span><button type="button" className="btn btn-secondary" disabled={refreshing} onClick={() => void load()}>{refreshing ? '확인 중…' : '새 회신 확인'}</button></div>}

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

        {detailTab === 'messages' && selectedRequest && (
          <section className="form-card import-card">
            <TradeMessageThread
              tradeRequestId={selectedRequest.id}
              currentUserId={userId}
              currentRole="forwarder"
              counterpartLabel={getInboxImporterName(selected) === '화주명 미입력' ? '화주 담당자' : `${getInboxImporterName(selected)} 담당자`}
              readOnly={selectedRequest.status !== 'pending' && selectedRequest.status !== 'accepted'}
            />
          </section>
        )}


        {detailTab === 'messages' && !selected.returnRequest && !selectedRequest && (
          <section className="form-card import-card fwd-message-empty">
            <span className="fwd-message-empty-icon" aria-hidden="true"><Mail size={22} /></span>
            <div className="fwd-message-empty-copy">
              <h2>아직 보낸 요청이 없습니다.</h2>
              <p>화주와 주고받은 대화가 여기에 모입니다.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setDetailTab('review')}>서류 확인으로 이동 <span aria-hidden="true">→</span></button>
          </section>
        )}

        {detailTab === 'review' && selected.returnRequest && <div className="fwd-message-link">
          <span>{selected.returnRequest.resolvedAt ? '화주의 보완 회신이 도착했습니다.' : selected.shipperEditing ? '화주가 서류를 수정하고 있습니다.' : '화주에게 보완을 요청했습니다. 회신 대기 중입니다.'}</span>
          <button type="button" onClick={() => setDetailTab('messages')}>업무 메시지 보기 →</button>
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

        {detailTab === 'review' && <ForwarderExtractedSummary item={selected} />}

        {detailTab === 'review' && (
          <ImportHandoffReadyCard
            documentTypes={selected.snapshot.documents.map((document) => document.type)}
            fields={selected.snapshot.analysis.extracted}
            readyTitle="전달 자료 확인 완료"
            readyNote="필요한 서류와 신고 준비 정보가 모두 있습니다. 통관 업무를 진행하세요."
          />
        )}

        {detailTab === 'review' && !selected.returnRequest && (selected.stage === 'received' || selected.stage === 'review') && (
          <section className="fwd-batch-review" aria-label="다음 업무로 이동">
            <div className="fwd-batch-toolbar">
              <span>서류와 추출 정보를 확인했으면 통관 업무로 넘어갑니다.</span>
              <div>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={async () => {
                  if (saving) return;
                  if (await persist(selected, { stage: 'clearance' }, ['전달 자료 확인 완료'])) setDetailTab('clearance');
                }}>{saving ? '처리 중…' : '확인 완료 · 업무 진행'}</button>
              </div>
            </div>
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

        <div hidden={detailTab !== 'clearance'}>
          {documentsLocked && <div className="fwd-document-lock" role="status"><span>{returnPending ? '화주 회신을 확인한 뒤 신고자료와 인도 서류를 준비하세요.' : '서류 확인을 완료하면 신고자료 다운로드와 업무 기록이 가능합니다.'}</span><button type="button" className="btn btn-secondary" onClick={() => setDetailTab('review')}>서류 확인으로 이동</button></div>}
          <ForwarderImportOperations key={selected.tradeId} item={selected} userId={userId} saving={saving} locked={documentsLocked}
            onSave={(importOperations, activity) => persist(selected, { importOperations }, [activity])}
            arrivalNotice={
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
            />
            }
          />
        </div>

        <div className="import-actions fwd-actions">
          {detailTab === 'review' && returnPending && (
            <p className="fwd-action-hint">화주 보완 회신을 기다리는 중에는 단계를 진행하지 않습니다.</p>
          )}
          {detailTab === 'clearance' && !returnPending && selected.stage === 'clearance' && (
            <>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => finishClearance(selected)}>
                <CheckCircle2 size={15} /> 포워더 업무 완료
              </button>
              <p className="fwd-action-hint">신고 진행과 A/N·D/O를 확인한 뒤 완료하세요. 실제 세관·반출 상태는 변경되지 않습니다.</p>
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
                message="화주가 서류를 고쳐 회신하면 업무 메시지 탭에 표시돼요."
                actions={(
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => setReturnSentOpen(false)}>닫기</button>
                    <button type="button" className="btn btn-primary" onClick={() => { setDetailTab('messages'); setReturnSentOpen(false); }}>업무 메시지 보기</button>
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
