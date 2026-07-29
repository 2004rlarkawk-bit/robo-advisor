import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCheck2, FolderOpen, Eye, Download } from 'lucide-react';
import type { SavedTrade } from '../types';
import { fetchSavedTrades } from '../services/storageService';

interface Props {
  onLoad: (trade: SavedTrade) => void;
}

export default function CustomsHistoryPanel({ onLoad }: Props) {
  const [trades, setTrades] = useState<SavedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTrades = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const saved = await fetchSavedTrades(['generated', 'submitted', 'in_progress']);
      setTrades(saved);
    } catch (caught) {
      console.error('[Customs History] trades query failed:', caught);
      setError('통관 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrades();
  }, [loadTrades]);

  const customsTrades = useMemo(() => {
    return trades.filter((trade) =>
      trade.documents.some((doc) => doc.id === 'customs_dec')
    );
  }, [trades]);

  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title document-manager-title">
          <FileCheck2 size={26} /> 통관 내역
        </h1>
        <p className="page-subtitle">
          통관신고 관련 서류 생성 상태와 거래별 통관 진행 정보를 확인합니다.
        </p>
      </div>

      {error && <div className="form-message error" role="alert">{error}</div>}

      {isLoading ? (
        <div className="form-card document-empty">통관 내역을 불러오는 중입니다.</div>
      ) : customsTrades.length === 0 ? (
        <div className="form-card document-empty">
          <FolderOpen size={36} />
          아직 통관신고 관련 서류가 생성된 거래가 없습니다.
        </div>
      ) : (
        customsTrades.map((trade) => {
          const customsDoc = trade.documents.find((doc) => doc.id === 'customs_dec');
          const created = new Date(trade.generatedAt ?? trade.createdAt);
          const dateLabel = Number.isNaN(created.getTime())
            ? trade.createdAt
            : `${created.getFullYear()}.${String(created.getMonth() + 1).padStart(2, '0')}.${String(created.getDate()).padStart(2, '0')}`;

          return (
            <div key={trade.id} className="form-card document-trade-card">
              <div className="document-trade-row">
                <div className="document-trade-summary">
                  <div className="document-trade-heading">
                    <span className={`trade-type-badge ${trade.profile.tradeType}`}>
                      {trade.profile.tradeType === 'export' ? '수출' : '수입'}
                    </span>
                    <span className="document-trade-name">
                      {trade.profile.itemName || '(품목명 없음)'}
                    </span>
                    {trade.profile.hsCode && (
                      <span className="document-hs-code">HS {trade.profile.hsCode}</span>
                    )}
                    <span className={`trade-status-badge ${customsDoc?.status}`}>
                      {customsDoc?.statusText || '상태 없음'}
                    </span>
                  </div>

                  <div className="document-trade-meta">
                    {trade.profile.companyName || '-'} → {trade.profile.partnerName || '-'} · {dateLabel}
                  </div>
                </div>

                <div className="document-trade-buttons">
                  <button className="btn-primary" onClick={() => onLoad(trade)}>
                    <Eye size={14} /> 조회
                  </button>
                  <button className="btn-secondary" onClick={() => onLoad(trade)}>
                    <Download size={14} /> 문서 확인
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
