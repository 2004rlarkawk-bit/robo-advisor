import { useCallback, useEffect, useState } from 'react';
import { FileText, FolderOpen, Trash2, CheckCircle2, ChevronDown, Copy } from 'lucide-react';
import type { SavedTrade } from '../types';
import { deleteSavedTrade, fetchSubmittedTrades } from '../services/storageService';
import { filterDocumentManagerTrades } from '../services/tradeListPolicy';

interface Props {
  onLoad: (trade: SavedTrade) => void;
  onCopy: (trade: SavedTrade) => void;
  onListReady?: () => void;
}

export default function DocumentManagerPanel({
  onLoad,
  onCopy,
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
      setTrades(
        filterDocumentManagerTrades(
          await fetchSubmittedTrades()
        )
      );
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