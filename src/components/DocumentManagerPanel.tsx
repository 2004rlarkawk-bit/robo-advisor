import { useCallback, useEffect, useState } from 'react';
import { FileText, FolderOpen, Trash2, CheckCircle2, ChevronDown } from 'lucide-react';
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
  const [open, setOpen] = useState(true);

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
        <div className="doc-panel-head-main">
          <span className="doc-panel-title">
            <FileText size={19} />
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
            <div
              className="doc-table"
              role="table"
            >
              <div
                className="doc-table-head"
                role="row"
              >
                <span role="columnheader">
                  상품명
                </span>

                <span role="columnheader">
                  목적지
                </span>

                <span role="columnheader">
                  인코텀즈
                </span>

                <span role="columnheader">
                  제출 일시
                </span>

                <span role="columnheader">
                  문서 상태
                </span>

                <span role="columnheader">
                  작업
                </span>
              </div>

              {trades.map((trade) => (
                <div
                  key={trade.id}
                  className="doc-table-row"
                  role="row"
                >
                  <span
                    className="doc-cell-name"
                    role="cell"
                  >
                    {trade.profile.itemName ||
                      '(품목명 없음)'}
                  </span>

                  <span
                    className="doc-cell-route"
                    role="cell"
                  >
                    {trade.profile.loadPort || '-'} →{' '}
                    {trade.profile.dischargePort || '-'}
                  </span>

                  <span
                    className="doc-cell-incoterms"
                    role="cell"
                  >
                    {trade.profile.incoterms || '-'}
                  </span>

                  <span
                    className="doc-cell-date"
                    role="cell"
                  >
                    {formatDate(trade)}
                  </span>

                  <span role="cell">
                    <span className="doc-status-badge">
                      <CheckCircle2 size={13} />
                      제출 완료
                    </span>
                  </span>

                  <span
                    className="doc-cell-actions"
                    role="cell"
                  >
                    <button
                      type="button"
                      className="doc-row-btn"
                      onClick={() => onLoad(trade)}
                    >
                      조회
                    </button>

                    <button
                      type="button"
                      className="doc-row-btn ghost"
                      onClick={() => onCopy(trade)}
                    >
                      새 거래로 복사
                    </button>

                    <button
                      type="button"
                      className="doc-row-del"
                      aria-label="문서 삭제"
                      onClick={() =>
                        void handleDelete(trade.id)
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}