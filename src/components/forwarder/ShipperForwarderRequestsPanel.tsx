import { useCallback, useEffect, useMemo, useState } from 'react';
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
  X,
} from 'lucide-react';
import type { SavedTrade } from '../../types';
import type { ExportForwarderCaseState } from '../../types/exportForwarderCase';
import { FORWARDER_STAGE_LABEL, type ForwarderCaseState } from '../../types/forwarderCase';
import type { ExternalForwarderRequest, TradeRequest } from '../../types/forwarderRequest';
import { listExternalForwarderRequests } from '../../services/externalForwarderEmailService';
import { listOutgoingTradeRequests } from '../../services/forwarderRequestService';
import { listUnreadTradeMessageCounts } from '../../services/tradeMessageService';
import { fetchSubmittedTrades } from '../../services/storageService';
import { filterDocumentManagerTrades } from '../../services/tradeListPolicy';
import ForwarderRequestModal from './ForwarderRequestModal';
import TradeMessageThread from './TradeMessageThread';
import '../../styles/forwarderRequest.css';

type RequestFilter = 'all' | 'ready' | 'active' | 'done';
type RequestCategory = 'ready' | 'waiting' | 'progress' | 'done';
type RequestTone = 'neutral' | 'warning' | 'info' | 'success' | 'danger';

interface Props {
  /** 대화에서 내 말풍선을 구분하는 데 쓴다. */
  currentUserId: string;
  onOpenTrade: (trade: SavedTrade) => void;
  onRevise?: (trade: SavedTrade) => void;
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

function timeValue(iso: string | null | undefined): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
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

  if (latestInternal?.status === 'accepted' || (trade.forwarderUserId && !latestExternal)) {
    const direction = trade.tradeDirection ?? trade.profile.tradeType;
    const importState = trade.forwarderCase as ForwarderCaseState | null;
    const exportState = trade.exportForwarderCase as ExportForwarderCaseState | null;
    const completed = direction === 'import'
      ? importState?.stage === 'done'
      : Boolean(exportState?.completedAt);
    const statusLabel = completed
      ? '업무 완료'
      : direction === 'import' && importState?.stage
        ? FORWARDER_STAGE_LABEL[importState.stage]
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

  const failed = latestInternal?.status === 'rejected'
    || latestInternal?.status === 'cancelled'
    || latestExternal?.status === 'failed';
  return {
    category: 'ready',
    statusLabel: failed ? '재의뢰 필요' : '의뢰 전',
    statusTone: failed ? 'danger' : 'neutral',
    forwarderLabel: failed
      ? latestExternal?.recipientCompany || latestExternal?.recipientEmail || '이전 포워더'
      : '미지정',
    requestedAt: latestInternal?.createdAt ?? latestExternal?.createdAt ?? null,
    canRequest: true,
    needsRevision: false,
  };
}

export default function ShipperForwarderRequestsPanel({ currentUserId, onOpenTrade, onRevise }: Props) {
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

  const loadUnread = useCallback(async () => {
    try {
      setUnreadByRequest(await listUnreadTradeMessageCounts());
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
          .filter((trade) => (trade.tradeRole ?? 'shipper') === 'shipper')
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
  useEffect(() => { void loadUnread(); }, [loadUnread, internalRequests]);

  const rows = useMemo(() => trades.map((trade) => {
    const internal = latestForTrade(internalRequests, trade.id);
    return {
      trade,
      internal,
      view: deriveTradeRequestView(trade, internal, latestForTrade(externalRequests, trade.id)),
    };
  }), [trades, internalRequests, externalRequests]);

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
                <article key={trade.id} className="shipper-request-row">
                  <div className="shipper-request-trade">
                    <div>
                      <span className={`trade-type-badge ${direction}`}>{direction === 'export' ? '수출' : '수입'}</span>
                      <strong>{profile.itemName || '품목명 미입력'}</strong>
                    </div>
                    <span>{reference} · 제출 {formatDate(trade.submittedAt ?? trade.createdAt)}</span>
                  </div>
                  <div className="shipper-request-forwarder">
                    <div><strong>{view.forwarderLabel}</strong><span className={`shipper-request-status is-${view.statusTone}`}>{view.statusLabel}</span></div>
                    {view.requestedAt && <span>의뢰 {formatDate(view.requestedAt)}</span>}
                  </div>
                  <div className="shipper-request-next">
                    {internal && (
                      <button type="button" className="shipper-request-action" onClick={() => setThreadTrade(trade)}>
                        <MessageSquare size={15} /> 대화{unread > 0 && <span className="tm-badge" aria-label={`안 읽은 메시지 ${unread}건`}>{unread}</span>}
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
                  <span><strong>{trade.profile.itemName || '품목명 미입력'}</strong><small>{trade.profile.blNo || trade.profile.invoiceNo || `제출 ${formatDate(trade.submittedAt)}`}</small></span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {threadTrade && (() => {
        const internal = latestForTrade(internalRequests, threadTrade.id);
        if (!internal) return null;
        const closed = internal.status !== 'pending' && internal.status !== 'accepted';
        return (
          <div className="fwd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setThreadTrade(null); }}>
            <div className="fwd-modal tm-modal" role="dialog" aria-modal="true" aria-labelledby="thread-modal-title">
              <div className="fwd-modal-head">
                <div>
                  <h2 id="thread-modal-title">{threadTrade.profile.itemName || '품목명 미입력'}</h2>
                </div>
                <button type="button" className="fwd-modal-close" aria-label="닫기" onClick={() => setThreadTrade(null)}><X size={22} /></button>
              </div>
              <TradeMessageThread
                tradeRequestId={internal.id}
                currentUserId={currentUserId}
                counterpartLabel="지정 포워더"
                readOnly={closed}
                onMessagesChanged={() => void loadUnread()}
              />
            </div>
          </div>
        );
      })()}

      {requestTrade && (
        <ForwarderRequestModal
          trade={requestTrade}
          currentUserId={currentUserId}
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
