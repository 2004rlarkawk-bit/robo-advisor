import { useCallback, useEffect, useState } from 'react';
import { FolderKanban, Trash2, FolderOpen, AlertTriangle, CheckCircle2, Copy } from 'lucide-react';
import type { SavedTrade } from '../types';
import { clearSavedTrades, deleteSavedTrade, fetchSubmittedTrades } from '../services/storageService';
import { filterDocumentManagerTrades } from '../services/tradeListPolicy';
import { getTestSubmissionMeta } from '../services/devTestDataService';

interface Props {
  onLoad: (trade: SavedTrade) => void;
  onCopy: (trade: SavedTrade) => void;
}

export default function DocumentManagerPanel({ onLoad, onCopy }: Props) {
  const [trades, setTrades] = useState<SavedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTrades = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setTrades(filterDocumentManagerTrades(await fetchSubmittedTrades()));
    } catch (caught) {
      console.error('[Document Manager] submitted trades query failed:', caught);
      setError('제출된 문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadTrades(); }, [loadTrades]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedTrade(id);
      setTrades((current) => current.filter((trade) => trade.id !== id));
    } catch (caught) {
      console.error('[Document Manager] trade deletion failed:', caught);
      setError('문서를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('제출·완료된 거래를 전부 삭제할까요? 되돌릴 수 없습니다.')) return;
    try {
      await clearSavedTrades();
      setTrades([]);
    } catch (caught) {
      console.error('[Document Manager] submitted trades deletion failed:', caught);
      setError('문서를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title document-manager-title"><FolderKanban size={26} /> 문서 관리</h1>
        <p className="page-subtitle">최종 전송이 완료된 거래의 문서를 조회하고 신규 거래로 복사할 수 있습니다.</p>
      </div>

      {error && <div className="form-message error" role="alert">{error}</div>}
      {isLoading ? (
        <div className="form-card document-empty">제출된 문서를 불러오는 중입니다.</div>
      ) : trades.length === 0 ? (
        <div className="form-card document-empty">
          <FolderOpen size={36} />
          아직 제출된 문서가 없습니다.
        </div>
      ) : (
        <>
          <div className="document-manager-actions">
            <button className="btn-secondary document-delete-all" onClick={() => void handleClearAll()}><Trash2 size={14} /> 전체 삭제</button>
          </div>

          {trades.map((trade) => {
            const errorCount = trade.issues.filter((issue) => issue.severity === 'error').length;
            const doneCount = trade.documents.filter((document) => document.status === 'completed').length;
            const testMeta = getTestSubmissionMeta(trade.generatedDocs);
            const created = new Date(trade.submittedAt ?? trade.createdAt);
            const dateLabel = Number.isNaN(created.getTime())
              ? trade.createdAt
              : `${created.getFullYear()}.${String(created.getMonth() + 1).padStart(2, '0')}.${String(created.getDate()).padStart(2, '0')} ${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`;

            return (
              <div key={trade.id} className="form-card document-trade-card">
                <div className="document-trade-row">
                  <div className="document-trade-summary">
                    <div className="document-trade-heading">
                      <span className={`trade-type-badge ${trade.tradeDirection ?? trade.profile.tradeType}`}>{(trade.tradeDirection ?? trade.profile.tradeType) === 'export' ? '수출' : '수입'}</span>
                      {trade.tradeRole && <span className="trade-role-badge">{trade.tradeRole === 'shipper' ? '화주' : '포워더'}</span>}
                      <span className={`trade-status-badge ${trade.status}`}>{trade.status === 'in_progress' ? '진행 중' : trade.status === 'submitted' ? '제출 완료' : trade.status}</span>
                      {testMeta && <span className="test-trade-badge">테스트 문서</span>}
                      {testMeta?.submissionMode === 'perfect' && <span className="perfect-test-badge">완벽 테스트</span>}
                      {testMeta?.submissionMode === 'needs_revision' && <span className="needs-revision-badge">수정 필요</span>}
                      {testMeta?.submittedWithValidationErrors && <span className="test-error-badge">오류 포함 제출</span>}
                      <span className="document-trade-name">{trade.profile.itemName || '(품목명 없음)'}</span>
                      {trade.profile.hsCode && <span className="document-hs-code">HS {trade.profile.hsCode}</span>}
                    </div>
                    <div className="document-trade-meta">{trade.profile.companyName || '-'} → {trade.profile.partnerName || '-'} · B/L {trade.profile.blNo || '-'} · {dateLabel}</div>
                  </div>

                  <div className="document-trade-counts">
                    <span className="document-complete-count"><CheckCircle2 size={14} /> 문서 {doneCount}/{trade.documents.length}</span>
                    <span className={errorCount > 0 ? 'document-error-count active' : 'document-error-count'}><AlertTriangle size={14} /> 오류 {errorCount}건</span>
                  </div>

                  <div className="document-trade-buttons">
                    <button className="btn-primary" onClick={() => onLoad(trade)}><FolderOpen size={14} /> 조회</button>
                    <button className="btn-secondary" onClick={() => onCopy(trade)}><Copy size={14} /> 신규 거래로 복사</button>
                    <button className="btn-secondary document-delete-button" aria-label="문서 삭제" onClick={() => void handleDelete(trade.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
