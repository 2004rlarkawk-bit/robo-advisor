import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowRight,
  FileCheck2,
  FolderOpen,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Ship,
  Trash2,
  X,
} from 'lucide-react';
import type { SavedTrade } from '../../types';
import {
  EXPORT_PROGRESS_STAGE_LABEL,
  EXPORT_PROGRESS_STAGE_ORDER,
  type ExportForwarderCaseState,
} from '../../types/exportForwarderCase';
import { FORWARDER_STAGE_LABEL, type ForwarderCaseState } from '../../types/forwarderCase';
import type { ExternalForwarderRequest, TradeRequest } from '../../types/forwarderRequest';
import { listExternalForwarderRequests } from '../../services/externalForwarderEmailService';
import { listOutgoingTradeRequests } from '../../services/forwarderRequestService';
import { listUnreadTradeMessageCounts } from '../../services/tradeMessageService';
import { fetchSubmittedTrades } from '../../services/storageService';
import { filterDocumentManagerTrades } from '../../services/tradeListPolicy';
import ForwarderRequestModal from './ForwarderRequestModal';
import TradeMessageThread from './TradeMessageThread';
import ShipperReturnRequestCard from './ShipperReturnRequestCard';
import TrashBin from '../common/TrashBin';
import { formatKstDate } from '../../utils/formatDate';
import '../../styles/forwarderRequest.css';

type RequestFilter = 'all' | 'ready' | 'active' | 'done';
type RequestCategory = 'ready' | 'waiting' | 'progress' | 'done';
type RequestTone = 'neutral' | 'warning' | 'info' | 'success' | 'danger';

interface Props {
  /** 대화에서 내 말풍선을 구분하는 데 쓴다. */
  currentUserId: string;
  onOpenTrade: (trade: SavedTrade) => void;
  onRevise?: (trade: SavedTrade) => void;
  /** 알림에서 들어온 거래 — 목록을 불러온 뒤 그 거래의 보완 요청·대화 창을 바로 연다. */
  focusTradeId?: string | null;
  onFocusHandled?: () => void;
  /** 목록에 없는 거래(이미 수정하려고 다시 연 건 등)면 호출한다. */
  onFocusMissing?: (tradeId: string) => void;
}

interface TradeRequestView {
  category: RequestCategory;
  statusLabel: string;
  statusTone: RequestTone;
  forwarderLabel: string;
  requestedAt: string | null;
  canRequest: boolean;
  needsRevision: boolean;
}

const FILTER_LABELS: Array<{ key: RequestFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'ready', label: '의뢰 전' },
  { key: 'active', label: '처리 중' },
  { key: 'done', label: '완료' },
];

/** 행을 이만큼 왼쪽으로 밀고 놓으면 삭제를 묻는다. */
const SWIPE_DELETE_PX = 140;
/** 행이 따라 움직이는 최대 거리 */
const SWIPE_MAX_PX = 240;

function timeValue(iso: string | null | undefined): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function latestForTrade<T extends { tradeId: string; createdAt: string }>(items: T[], tradeId: string): T | null {
  return items
    .filter((item) => item.tradeId === tradeId)
    .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))[0] ?? null;
}

/** 한 거래의 내부 요청·외부 이메일·포워더 처리 상태를 화주가 이해할 한 줄 상태로 바꾼다. */
export function deriveTradeRequestView(
  trade: SavedTrade,
  internal: TradeRequest | null,
  external: ExternalForwarderRequest | null,
): TradeRequestView {
  const latestKind = timeValue(internal?.createdAt) >= timeValue(external?.createdAt) ? 'internal' : 'external';
  const latestInternal = latestKind === 'internal' ? internal : null;
  const latestExternal = latestKind === 'external' ? external : null;
  const returnRequest = (trade.forwarderCase as ForwarderCaseState | null)?.returnRequest;
  const needsRevision = Boolean(returnRequest && !returnRequest.resolvedAt);

  if (needsRevision) {
    return {
      category: 'progress',
      statusLabel: '화주 보완 필요',
      statusTone: 'danger',
      forwarderLabel: '지정 포워더',
      requestedAt: latestInternal?.createdAt ?? latestExternal?.createdAt ?? null,
      canRequest: false,
      needsRevision: true,
    };
  }

  // 이미 맡은 포워더가 있으면, 뒤에 보낸 이메일이 실패했거나 다른 의뢰가 자동 취소됐어도 진행 중으로 본다.
  const externalActive = latestExternal?.status === 'sent' || latestExternal?.status === 'pending';
  if (latestInternal?.status === 'accepted' || (trade.forwarderUserId && !externalActive)) {
    const direction = trade.tradeDirection ?? trade.profile.tradeType;
    const importState = trade.forwarderCase as ForwarderCaseState | null;
    const exportState = trade.exportForwarderCase as ExportForwarderCaseState | null;
    const completed = direction === 'import'
      ? importState?.stage === 'done'
      : Boolean(exportState?.completedAt);
    // 수출도 수입처럼 현재 진행 단계를 이름으로 보여준다 — 가장 뒤에 있는 진행·완료 단계 기준.
    const exportStage = [...EXPORT_PROGRESS_STAGE_ORDER].reverse()
      .find((key) => exportState?.progress?.[key] === 'in_progress' || exportState?.progress?.[key] === 'done');
    const statusLabel = completed
      ? '업무 완료'
      : direction === 'import' && importState?.stage
        ? FORWARDER_STAGE_LABEL[importState.stage]
        : exportStage
          ? `${EXPORT_PROGRESS_STAGE_LABEL[exportStage]}${exportState?.progress?.[exportStage] === 'in_progress' ? ' 진행 중' : ''}`
          : '포워더 진행 중';
    return {
      category: completed ? 'done' : 'progress',
      statusLabel,
      statusTone: completed ? 'success' : 'info',
      forwarderLabel: '지정 포워더',
      requestedAt: latestInternal?.acceptedAt ?? latestInternal?.createdAt ?? null,
      canRequest: false,
      needsRevision: false,
    };
  }

  if (latestInternal?.status === 'pending') {
    return {
      category: 'waiting',
      statusLabel: '수락 대기',
      statusTone: 'warning',
      forwarderLabel: '회원 포워더',
      requestedAt: latestInternal.createdAt,
      canRequest: false,
      needsRevision: false,
    };
  }

  if (latestExternal && (latestExternal.status === 'sent' || latestExternal.status === 'pending')) {
    return {
      category: 'waiting',
      statusLabel: latestExternal.status === 'sent' ? '이메일 전송 완료' : '이메일 전송 중',
      statusTone: 'warning',
      forwarderLabel: latestExternal.recipientCompany || latestExternal.recipientEmail,
      requestedAt: latestExternal.sentAt ?? latestExternal.createdAt,
      canRequest: true,
      needsRevision: false,
    };
  }

  // 의뢰가 닿지 못하고 끝난 원인을 그대로 보여준다 — 화주가 왜 다시 의뢰해야 하는지 알 수 있게.
  // 모두 다시 의뢰하면 되는 상태라 경고(노랑)로 두고, 아직 의뢰하지 않은 건은 배지 없이 둔다.
  const rejected = latestInternal?.status === 'rejected';
  const cancelled = latestInternal?.status === 'cancelled';
  const emailFailed = latestExternal?.status === 'failed';
  const statusLabel = rejected ? '거절됨' : emailFailed ? '전송 실패' : cancelled ? '재의뢰 필요' : '';
  return {
    category: 'ready',
    statusLabel,
    statusTone: statusLabel ? 'warning' : 'neutral',
    // 회원 포워더 이름은 의뢰 기록에 없고 화주가 상대 프로필을 읽을 수 없어 '회원 포워더'로 둔다.
    forwarderLabel: emailFailed
      ? latestExternal?.recipientCompany || latestExternal?.recipientEmail || '이메일 포워더'
      : rejected || cancelled ? '회원 포워더' : '미지정',
    requestedAt: latestInternal?.createdAt ?? latestExternal?.createdAt ?? null,
    canRequest: true,
    needsRevision: false,
  };
}

export default function ShipperForwarderRequestsPanel({ currentUserId, onOpenTrade, onRevise, focusTradeId = null, onFocusHandled, onFocusMissing }: Props) {
  const [trades, setTrades] = useState<SavedTrade[]>([]);
  const [internalRequests, setInternalRequests] = useState<TradeRequest[]>([]);
  const [externalRequests, setExternalRequests] = useState<ExternalForwarderRequest[]>([]);
  const [activeFilter, setActiveFilter] = useState<RequestFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [requestTrade, setRequestTrade] = useState<SavedTrade | null>(null);
  /** 대화창을 연 거래 — 의뢰(trade_request)는 렌더 시점에 다시 찾는다. */
  const [threadTrade, setThreadTrade] = useState<SavedTrade | null>(null);
  const [unreadByRequest, setUnreadByRequest] = useState<Record<string, number>>({});

  // 행을 꾹 누른 채 왼쪽으로 밀면 목록에서 지운다. DB의 거래는 그대로 두고 이 브라우저에서만 숨긴다
  // (포워더 쪽 의뢰·대화를 건드리지 않게). 버튼 위에서 시작한 드래그는 무시한다.
  const hiddenKey = `portai:hidden-shipper-requests:${currentUserId}`;
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(hiddenKey);
      return new Set(raw ? JSON.parse(raw) as string[] : []);
    } catch {
      return new Set();
    }
  });
  const saveHidden = (next: Set<string>) => {
    setHiddenIds(next);
    try { window.localStorage.setItem(hiddenKey, JSON.stringify([...next])); } catch { /* 저장 실패는 무시 */ }
  };
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; dx: number; active: boolean } | null>(null);

  const hideTrade = (trade: SavedTrade) => saveHidden(new Set(hiddenIds).add(trade.id));

  const handleSwipeStart = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a')) return;
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, dx: 0, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleSwipeMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      // 세로 스크롤과 구분 — 가로로 확실히 움직였을 때만 밀기로 본다.
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
      drag.active = true;
    }
    drag.dx = Math.max(Math.min(dx, 0), -SWIPE_MAX_PX);
    setSwipe({ id: drag.id, dx: drag.dx });
  };
  const handleSwipeEnd = (trade: SavedTrade) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setSwipe(null);
    if (drag?.active && drag.dx <= -SWIPE_DELETE_PX) hideTrade(trade);
  };

  const loadUnread = useCallback(async () => {
    try {
      setUnreadByRequest(await listUnreadTradeMessageCounts('shipper'));
    } catch (err) {
      console.warn('안 읽은 메시지 수 조회 실패:', err);
    }
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [loadedTrades, internal, external] = await Promise.all([
        fetchSubmittedTrades(),
        listOutgoingTradeRequests(),
        listExternalForwarderRequests(),
      ]);
      setTrades(
        filterDocumentManagerTrades(loadedTrades)
          // RLS는 내가 화주로서 낸 거래뿐 아니라 forwarder_user_id로 배정받은 남의 거래도 함께 돌려준다.
          // tradeRole은 "누가 어떤 화면에서 이 거래를 만들었는지"만 기록하므로, 남의 거래에도 그대로
          // 'shipper'로 남아 있다. 실제 소유자(userId)가 나 자신인 거래만 "내 의뢰" 목록에 남긴다.
          .filter((trade) => (trade.tradeRole ?? 'shipper') === 'shipper' && trade.userId === currentUserId)
          .sort((a, b) => timeValue(b.submittedAt ?? b.createdAt) - timeValue(a.submittedAt ?? a.createdAt)),
      );
      setInternalRequests(internal);
      setExternalRequests(external);
    } catch (caught) {
      console.error('[ShipperForwarderRequestsPanel] 의뢰 목록 조회 실패:', caught);
      setError('포워더 의뢰 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 보완 요청 알림으로 들어오면 그 거래의 요청 카드와 대화를 바로 연다.
  // 숨긴 행이어도 알림으로 찾아온 건은 보여준다.
  useEffect(() => {
    if (!focusTradeId || isLoading) return;
    const target = trades.find((trade) => trade.id === focusTradeId);
    if (target) setThreadTrade(target);
    else onFocusMissing?.(focusTradeId);
    onFocusHandled?.();
  }, [focusTradeId, isLoading, trades, onFocusHandled, onFocusMissing]);
  useEffect(() => { void loadUnread(); }, [loadUnread, internalRequests]);

  const rows = useMemo(() => trades.filter((trade) => !hiddenIds.has(trade.id)).map((trade) => {
    const internal = latestForTrade(internalRequests, trade.id);
    return {
      trade,
      internal,
      view: deriveTradeRequestView(trade, internal, latestForTrade(externalRequests, trade.id)),
    };
  }), [trades, internalRequests, externalRequests, hiddenIds]);

  const counts = useMemo(() => ({
    all: rows.length,
    ready: rows.filter((row) => row.view.category === 'ready').length,
    active: rows.filter((row) => row.view.category === 'waiting' || row.view.category === 'progress').length,
    done: rows.filter((row) => row.view.category === 'done').length,
  }), [rows]);

  const filteredRows = activeFilter === 'all'
    ? rows
    : activeFilter === 'active'
      ? rows.filter((row) => row.view.category === 'waiting' || row.view.category === 'progress')
      : rows.filter((row) => row.view.category === activeFilter);
  const requestableTrades = rows.filter((row) => row.view.canRequest).map((row) => row.trade);

  const openRequest = (trade: SavedTrade) => {
    setPickerOpen(false);
    setRequestTrade(trade);
  };

  return (
    <section className="shipper-requests-page">
      <header className="shipper-requests-head">
        <div>
          <h1>포워더 의뢰</h1>
          <p>완성된 문서를 지정 포워더에게 전달하고, 수락 이후 진행 상태를 확인합니다.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary shipper-requests-new"
          disabled={requestableTrades.length === 0}
          onClick={() => setPickerOpen(true)}
        >
          <Plus size={18} /> 새 의뢰
        </button>
      </header>

      <div className="shipper-request-relationship" aria-label="화주와 포워더 업무 연결">
        <div className="shipper-request-parties">
          <span><FileCheck2 size={17} /><strong>화주</strong></span>
          <ArrowRight size={17} />
          <span className="is-forwarder"><Ship size={17} /><strong>지정 포워더</strong></span>
        </div>
        <p>완성 서류 전달 · 포워더 수락 · 운송과 통관 진행</p>
      </div>

      <div className="shipper-requests-card">
        <div className="shipper-requests-toolbar">
          <div className="shipper-request-filters" role="tablist" aria-label="포워더 의뢰 상태">
            {FILTER_LABELS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeFilter === key}
                className={activeFilter === key ? 'active' : ''}
                onClick={() => setActiveFilter(key)}
              >
                {label} <span>{counts[key]}</span>
              </button>
            ))}
          </div>
          <span className="shipper-requests-trash">
            <TrashBin
              items={trades.filter((trade) => hiddenIds.has(trade.id)).map((trade) => ({
                id: trade.id,
                title: trade.profile.itemName || '품목명 미입력',
                detail: `${trade.profile.blNo || trade.profile.invoiceNo || trade.profile.documentNo || `거래 ${trade.id.slice(0, 8)}`} · 제출 ${formatKstDate(trade.submittedAt ?? trade.createdAt)}`,
              }))}
              onRestore={(id) => { const next = new Set(hiddenIds); next.delete(id); saveHidden(next); }}
              onRestoreAll={() => saveHidden(new Set())}
            />
          </span>
          <button type="button" className="shipper-requests-refresh" aria-label="의뢰 목록 새로고침" onClick={() => void load()}>
            <RefreshCw size={17} />
          </button>
        </div>

        {error && <div className="form-message error" role="alert">{error}</div>}
        {isLoading ? (
          <div className="shipper-requests-empty">의뢰 목록을 불러오는 중입니다.</div>
        ) : rows.length === 0 ? (
          <div className="shipper-requests-empty">
            <FolderOpen size={35} />
            <strong>의뢰할 완료 문서가 없습니다.</strong>
            <span>AI 통관 작업실에서 문서를 완성하고 최종 제출해 주세요.</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="shipper-requests-empty">이 상태의 의뢰가 없습니다.</div>
        ) : (
          <div className="shipper-request-table">
            <div className="shipper-request-table-head">
              <span>거래·문서</span><span>포워더·상태</span><span>작업</span>
            </div>
            {filteredRows.map(({ trade, view, internal }) => {
              const profile = trade.profile;
              const unread = internal ? unreadByRequest[internal.id] ?? 0 : 0;
              const reference = profile.blNo || profile.invoiceNo || profile.documentNo || `거래 ${trade.id.slice(0, 8)}`;
              const direction = trade.tradeDirection ?? profile.tradeType;
              return (
                <div key={trade.id} className="shipper-request-swipe">
                <div className={`shipper-request-swipe-bg${swipe?.id === trade.id && swipe.dx <= -SWIPE_DELETE_PX ? ' is-armed' : ''}`} aria-hidden="true">
                  <Trash2 size={17} /> {swipe?.id === trade.id && swipe.dx <= -SWIPE_DELETE_PX ? '놓으면 삭제' : '삭제'}
                </div>
                <article
                  className={`shipper-request-row${swipe?.id === trade.id ? ' is-swiping' : ''}`}
                  style={swipe?.id === trade.id ? { transform: `translateX(${swipe.dx}px)` } : undefined}
                  onPointerDown={(event) => handleSwipeStart(event, trade.id)}
                  onPointerMove={handleSwipeMove}
                  onPointerUp={() => handleSwipeEnd(trade)}
                  onPointerCancel={() => { dragRef.current = null; setSwipe(null); }}
                >
                  <div className="shipper-request-trade">
                    <div>
                      <span className={`trade-type-badge ${direction}`}>{direction === 'export' ? '수출' : '수입'}</span>
                      <strong>{profile.itemName || '품목명 미입력'}</strong>
                    </div>
                    <span>{reference} · 제출 {formatKstDate(trade.submittedAt ?? trade.createdAt)}</span>
                  </div>
                  <div className="shipper-request-forwarder">
                    <div><strong>{view.forwarderLabel}</strong>{view.statusLabel && <span className={`shipper-request-status is-${view.statusTone}`}>{view.statusLabel}</span>}</div>
                    {/* 의뢰일이 없어도 줄을 유지해 행마다 라벨 높이가 어긋나지 않게 한다 */}
                    <span>{view.requestedAt ? `의뢰 ${formatKstDate(view.requestedAt)}` : ' '}</span>
                  </div>
                  <div className="shipper-request-next">
                    {(internal || view.needsRevision) && (
                      <button type="button" className="shipper-request-action" onClick={() => setThreadTrade(trade)}>
                        <MessageSquare size={15} /> {internal ? '대화' : '요청 보기'}{unread > 0 && <span className="tm-badge" aria-label={`안 읽은 메시지 ${unread}건`}>{unread}</span>}
                      </button>
                    )}
                    {view.needsRevision && onRevise ? (
                      <button type="button" className="shipper-request-action is-danger" onClick={() => onRevise(trade)}>
                        <RotateCcw size={15} /> 문서 수정
                      </button>
                    ) : view.canRequest ? (
                      <button type="button" className="shipper-request-action is-primary" onClick={() => openRequest(trade)}>
                        <Send size={15} /> {view.category === 'ready' ? '포워더 지정' : '추가 의뢰'}
                      </button>
                    ) : (
                      <button type="button" className="shipper-request-action" onClick={() => onOpenTrade(trade)}>
                        <FolderOpen size={15} /> 문서 보기
                      </button>
                    )}
                  </div>
                </article>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pickerOpen && (
        <div className="fwd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}>
          <div className="fwd-modal shipper-request-picker" role="dialog" aria-modal="true" aria-labelledby="request-picker-title">
            <div className="fwd-modal-head">
              <div><h2 id="request-picker-title">의뢰할 문서 선택</h2><p>최종 제출이 끝난 거래만 표시됩니다.</p></div>
              <button type="button" className="fwd-modal-close" aria-label="닫기" onClick={() => setPickerOpen(false)}><X size={22} /></button>
            </div>
            <div className="shipper-request-picker-list">
              {requestableTrades.map((trade) => (
                <button key={trade.id} type="button" onClick={() => openRequest(trade)}>
                  <span className={`trade-type-badge ${trade.tradeDirection ?? trade.profile.tradeType}`}>
                    {(trade.tradeDirection ?? trade.profile.tradeType) === 'export' ? '수출' : '수입'}
                  </span>
                  <span><strong>{trade.profile.itemName || '품목명 미입력'}</strong><small>{trade.profile.blNo || trade.profile.invoiceNo || `제출 ${formatKstDate(trade.submittedAt)}`}</small></span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}


      {threadTrade && (() => {
        const internal = latestForTrade(internalRequests, threadTrade.id);
        const returnRequest = (threadTrade.forwarderCase as ForwarderCaseState | null)?.returnRequest ?? null;
        if (!internal && !returnRequest) return null;
        const closed = internal ? internal.status !== 'pending' && internal.status !== 'accepted' : true;
        const reference = threadTrade.profile.blNo || threadTrade.profile.invoiceNo || threadTrade.profile.documentNo || '';
        const requestCard = returnRequest ? (
          <ShipperReturnRequestCard
            request={returnRequest}
            onRevise={onRevise ? () => { setThreadTrade(null); onRevise(threadTrade); } : undefined}
          />
        ) : null;
        return (
          <div className="fwd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setThreadTrade(null); }}>
            <div className="fwd-modal tm-modal" role="dialog" aria-modal="true" aria-labelledby="thread-modal-title">
              <div className="fwd-modal-head">
                <div>
                  <h2 id="thread-modal-title">{threadTrade.profile.itemName || '품목명 미입력'}</h2>
                  {reference && <p>{reference}</p>}
                </div>
                <button type="button" className="fwd-modal-close" aria-label="닫기" onClick={() => setThreadTrade(null)}><X size={22} /></button>
              </div>
              {internal ? (
                <TradeMessageThread
                  tradeRequestId={internal.id}
                  currentUserId={currentUserId}
                  currentRole="shipper"
                  counterpartLabel="지정 포워더"
                  readOnly={closed}
                  pinned={requestCard}
                  onMessagesChanged={() => void loadUnread()}
                />
              ) : requestCard}
            </div>
          </div>
        );
      })()}

      {requestTrade && (
        <ForwarderRequestModal
          trade={requestTrade}
          onClose={() => setRequestTrade(null)}
          onSent={() => void load()}
          onViewRequests={() => {
            setRequestTrade(null);
            setActiveFilter('all');
          }}
        />
      )}
    </section>
  );
}
