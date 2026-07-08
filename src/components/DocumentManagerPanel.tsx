import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderKanban, FolderOpen, Trash2 } from 'lucide-react';
import type { SavedTrade } from '../types';
import { clearSavedTrades, deleteSavedTrade, fetchSavedTrades } from '../services/storageService';

interface Props {
  onView: (trade: SavedTrade) => void;
  onCopyAsNew: (trade: SavedTrade) => void;
}

export default function DocumentManagerPanel({ onView, onCopyAsNew }: Props) {
  // [EDIT: Supabase Auth] 로그인한 사용자의 trades만 Supabase에서 불러옵니다.
  const [trades, setTrades] = useState<SavedTrade[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrades = async () => {
    setLoading(true);
    try {
      // [EDIT: Document Management] 문서관리 탭에는 최종 전송 완료된 거래만 표시합니다.
      setTrades(await fetchSavedTrades('submitted'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrades().catch(console.error);
  }, []);

  const handleDelete = async (id: string) => {
    await deleteSavedTrade(id);
    await loadTrades();
  };

  const handleClearAll = async () => {
    if (!window.confirm('저장된 문서 이력을 모두 삭제할까요?')) return;
    await clearSavedTrades();
    setTrades([]);
  };

  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <FolderKanban size={26} /> 문서 관리
        </h1>
        <p className="page-subtitle">최종 전송이 완료된 거래 이력만 조회합니다.</p>
      </div>

      {loading ? (
        <div className="form-card" style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
          저장된 문서를 불러오는 중입니다.
        </div>
      ) : trades.length === 0 ? (
        <div className="form-card" style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
          <FolderOpen size={36} style={{ margin: '0 auto 12px', display: 'block', color: '#94a3b8' }} />
          저장된 문서 이력이 없습니다.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button
              className="btn-secondary"
              onClick={handleClearAll}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#dc2626' }}
            >
              <Trash2 size={14} /> 전체 삭제
            </button>
          </div>

          {trades.map((trade) => {
            const errorCount = trade.issues.filter((issue) => issue.severity === 'error').length;
            const doneCount = trade.documents.filter((doc) => doc.status === 'completed').length;
            const created = new Date(trade.createdAt);
            const dateLabel = Number.isNaN(created.getTime())
              ? trade.createdAt
              : created.toLocaleString();

            return (
              <div key={trade.id} className="form-card" style={{ marginBottom: 12, padding: '18px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className={`auth-badge ${trade.profile.tradeType === 'export' ? 'member' : 'import'}`}>
                        {trade.profile.tradeType === 'export' ? '수출' : '수입'}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{trade.profile.itemName || '(품목명 없음)'}</span>
                      {trade.profile.hsCode && <span style={{ fontSize: 12, color: '#64748b' }}>HS {trade.profile.hsCode}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#64748b' }}>
                      {trade.profile.companyName || '-'} / {trade.profile.partnerName || '-'} / {dateLabel}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#15803d' }}>
                      <CheckCircle2 size={14} /> 완료 문서 {doneCount}/{trade.documents.length}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: errorCount > 0 ? '#b91c1c' : '#64748b' }}>
                      <AlertTriangle size={14} /> 오류 {errorCount}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" onClick={() => onView(trade)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <FolderOpen size={14} /> 조회
                    </button>
                    <button className="btn-secondary" onClick={() => onCopyAsNew(trade)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      신규 거래 복사
                    </button>
                    <button className="btn-secondary" onClick={() => handleDelete(trade.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#dc2626' }}>
                      <Trash2 size={14} />
                    </button>
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
