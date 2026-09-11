import { useCallback, useEffect, useState } from 'react';
import { FileText, FolderOpen, Trash2, CheckCircle2, ChevronDown, Copy, CornerUpLeft } from 'lucide-react';
import type { SavedTrade } from '../types';
import {
  FORWARDER_STAGE_LABEL,
  FORWARDER_STAGE_ORDER,
  type ForwarderCaseState,
} from '../types/forwarderCase';
import { deleteSavedTrade, fetchSubmittedTrades } from '../services/storageService';
import { filterDocumentManagerTrades } from '../services/tradeListPolicy';

interface Props {
  onLoad: (trade: SavedTrade) => void;
  onCopy: (trade: SavedTrade) => void;
  /** 포워더 보완 요청을 받은 수입 거래를 다시 열어 수정하러 이동 */
  onRevise?: (trade: SavedTrade) => void;
  onListReady?: () => void;
}

/** 포워더 보완 요청이 걸려 있어 화주 조치가 필요한 거래인지 */
function hasActiveReturnRequest(trade: SavedTrade): boolean {
  if ((trade.tradeDirection ?? trade.profile.tradeType) !== 'import') return false;
  if (trade.tradeRole === 'forwarder') return false;
  const state = (trade.forwarderCase as ForwarderCaseState | null) ?? null;
  return Boolean(state?.returnRequest && !state.returnRequest.resolvedAt);
}

/** 화주가 제출한 수입 거래의 포워더 진행 상태 — 문서관리 행에 타임라인으로 보여준다. */
function ForwarderProgress({ trade, onRevise }: { trade: SavedTrade; onRevise?: (trade: SavedTrade) => void }) {
  if ((trade.tradeDirection ?? trade.profile.tradeType) !== 'import') return null;
  if (trade.tradeRole === 'forwarder') return null;

  const state = (trade.forwarderCase as ForwarderCaseState | null) ?? null;
  const stage = state?.stage ?? 'received';
  const stageIndex = FORWARDER_STAGE_ORDER.indexOf(stage);
  const returnRequest = state?.returnRequest;
  const returnPending = Boolean(returnRequest && !returnRequest.resolvedAt);

  return (
    <div className="dm-fwd">
      <div className="dm-fwd-line">
        <span className="dm-fwd-label">포워더 진행</span>
        {FORWARDER_STAGE_ORDER.map((item, index) => (
          <span
            key={item}
            className={`dm-fwd-step${index === stageIndex ? ' is-current' : ''}${index < stageIndex ? ' is-done' : ''}`}
          >
            {FORWARDER_STAGE_LABEL[item]}
          </span>
        ))}
      </div>
      {returnPending && returnRequest && (
        <div className="dm-fwd-return">
          <div className="dm-fwd-return-text">
            <strong><CornerUpLeft size={13} /> 포워더가 보완을 요청했습니다</strong>
            <p>{returnRequest.reason}</p>
          </div>
          {onRevise && (
            <button type="button" className="btn btn-primary dm-fwd-revise" onClick={() => onRevise(trade)}>
              수정하러 가기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocumentManagerPanel({
  onLoad,
  onCopy,
  onRevise,
  onListReady,
}: Props) {
  const [trades, setTrades] = useState<SavedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  // 문서 관리 탭 진입 시 임시보관함이 먼저 보이도록 기본 접힘
  const [open, setOpen] = useState(false);

  const loadTrades = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const loaded = filterDocumentManagerTrades(await fetchSubmittedTrades());
      setTrades(loaded);
      // 포워더 보완 요청이 걸린 거래가 있으면 화주가 바로 볼 수 있게 패널을 자동으로 펼친다.
      if (loaded.some((trade) => hasActiveReturnRequest(trade))) setOpen(true);
    } catch (caught) {
      console.error(
        '[Document Manager] submitted trades query failed:',
        caught
      );

      setError(
        '제출된 문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
      );
    } finally {
      setIsLoading(false);
      onListReady?.();
    }
  }, [onListReady]);

  useEffect(() => {
    void loadTrades();
  }, [loadTrades]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedTrade(id);

      setTrades((current) =>
        current.filter((trade) => trade.id !== id)
      );
    } catch (caught) {
      console.error(
        '[Document Manager] trade deletion failed:',
        caught
      );

      setError(
        '문서를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      );
    }
  };

  const formatDate = (trade: SavedTrade) => {
    const created = new Date(
      trade.submittedAt ?? trade.createdAt
    );

    if (Number.isNaN(created.getTime())) {
      return trade.createdAt;
    }

    return `${created.getFullYear()}.${String(
      created.getMonth() + 1
    ).padStart(2, '0')}.${String(
      created.getDate()
    ).padStart(2, '0')} ${String(
      created.getHours()
    ).padStart(2, '0')}:${String(
      created.getMinutes()
    ).padStart(2, '0')}`;
  };

  return (
    <section className="doc-panel">
      <button
        type="button"
        className="doc-panel-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="doc-panel-icon"><FileText size={22} /></span>
        <div className="doc-panel-head-main">
          <span className="doc-panel-title">
            최종 제출된 거래
            <span className="doc-panel-count">
              {trades.length}건
            </span>
            {trades.some(hasActiveReturnRequest) && (
              <span className="doc-panel-alert">보완 요청 {trades.filter(hasActiveReturnRequest).length}건</span>
            )}
          </span>

          <span className="doc-panel-sub">
            최종 제출이 완료된 거래를 조회하고, 새로운 거래로 복사할 수 있어요.
          </span>
        </div>

        <ChevronDown
          size={21}
          className={`doc-panel-chevron ${open ? 'open' : ''}`}
        />
      </button>

      {open && (
        <div className="doc-panel-body">
          {error && (
            <div
              className="form-message error"
              role="alert"
            >
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="doc-empty">
              제출된 문서를 불러오는 중입니다.
            </div>
          ) : trades.length === 0 ? (
            <div className="doc-empty">
              <FolderOpen size={34} />
              <span>
                아직 제출된 문서가 없습니다.
              </span>
            </div>
          ) : (
            /* 임시보관함과 같은 행 카드 형식 — 목록 스타일을 한 벌로 통일 */
            trades.map((trade) => {
              const p = trade.profile;
              const country = p.partnerCountry || p.buyerCountry || '';
              const ports = [p.loadPort, p.dischargePort].filter(Boolean).join(' → ');
              const route = [country, ports, p.incoterms].filter(Boolean).join(' · ');
              return (
                <div key={trade.id} className="draft-tray-item">
                  <div className="draft-tray-info">
                    <div className="draft-tray-line1">
                      <span className={`trade-type-badge ${p.tradeType}`}>{p.tradeType === 'export' ? '수출' : '수입'}</span>
                      <span className="draft-tray-name">{p.itemName || '(품목명 없음)'}</span>
                      <span className="draft-tray-status" style={{ color: '#15803d', background: '#f0fdf4' }}>
                        <CheckCircle2 size={12} style={{ verticalAlign: -1.5, marginRight: 4 }} />제출 완료
                      </span>
                    </div>
                    {route && <span className="draft-tray-route">{route}</span>}
                    <span className="draft-tray-time">{formatDate(trade)}</span>
                    <ForwarderProgress trade={trade} onRevise={onRevise} />
                  </div>
                  <div className="draft-tray-actions">
                    <button type="button" className="draft-tray-resume" onClick={() => onLoad(trade)}>
                      <FolderOpen size={15} /> 조회
                    </button>
                    <button type="button" className="draft-tray-resume" onClick={() => onCopy(trade)}>
                      <Copy size={15} /> 새 거래로 복사
                    </button>
                    <button
                      type="button"
                      className="draft-tray-delete"
                      aria-label="문서 삭제"
                      onClick={() => void handleDelete(trade.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}