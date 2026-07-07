/**
 * 문서 관리 페이지 — 생성 이력 조회/불러오기/삭제
 *
 * 문서 자동 생성이 완료될 때마다 storageService.saveTrade로 저장된 이력을
 * 목록으로 보여준다 (localStorage 기반, 최대 50건).
 * "불러오기"는 App의 폼·검토 상태를 해당 시점으로 복원한다.
 */
import { useState } from 'react';
import { FolderKanban, Trash2, FolderOpen, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { SavedTrade } from '../types';
import { getSavedTrades, deleteTrade, clearAllTrades } from '../services/storageService';

interface Props {
  onLoad: (trade: SavedTrade) => void;
}

export default function DocumentManagerPanel({ onLoad }: Props) {
  const [trades, setTrades] = useState<SavedTrade[]>(() => getSavedTrades());

  const handleDelete = (id: string) => {
    deleteTrade(id);
    setTrades(getSavedTrades());
  };

  const handleClearAll = () => {
    if (!window.confirm('저장된 생성 이력을 전부 삭제할까요? 되돌릴 수 없습니다.')) return;
    clearAllTrades();
    setTrades([]);
  };

  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <FolderKanban size={26} /> 문서 관리
        </h1>
        <p className="page-subtitle">
          문서 자동 생성 이력이 이 브라우저에 저장됩니다 (최대 50건). 불러오기를 누르면 해당 시점의 입력·검토 결과가 복원됩니다.
        </p>
      </div>

      {trades.length === 0 ? (
        <div className="form-card" style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
          <FolderOpen size={36} style={{ margin: '0 auto 12px', display: 'block', color: '#94a3b8' }} />
          아직 저장된 이력이 없습니다.
          <div style={{ fontSize: 13, marginTop: 6 }}>
            [문서 자동 생성]에서 필요 서류 자동 생성을 실행하면 이력이 자동 저장됩니다.
          </div>
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

          {trades.map((t) => {
            const errorCount = t.issues.filter((i) => i.severity === 'error').length;
            const doneCount = t.documents.filter((d) => d.status === 'completed').length;
            const created = new Date(t.createdAt);
            const dateLabel = isNaN(created.getTime())
              ? t.createdAt
              : `${created.getFullYear()}.${String(created.getMonth() + 1).padStart(2, '0')}.${String(created.getDate()).padStart(2, '0')} ${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`;

            return (
              <div key={t.id} className="form-card" style={{ marginBottom: 12, padding: '18px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          background: t.profile.tradeType === 'export' ? '#e8f0fe' : '#fef3c7',
                          color: t.profile.tradeType === 'export' ? '#0b57d0' : '#b45309',
                        }}
                      >
                        {t.profile.tradeType === 'export' ? '수출' : '수입'}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{t.profile.itemName || '(품목명 없음)'}</span>
                      {t.profile.hsCode && (
                        <span style={{ fontSize: 12, color: '#64748b' }}>HS {t.profile.hsCode}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#64748b' }}>
                      {t.profile.companyName || '-'} → {t.profile.partnerName || '-'} · {dateLabel}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#15803d' }}>
                      <CheckCircle2 size={14} /> 문서 {doneCount}/{t.documents.length}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: errorCount > 0 ? '#b91c1c' : '#64748b' }}>
                      <AlertTriangle size={14} /> 오류 {errorCount}건
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-primary"
                      onClick={() => onLoad(t)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <FolderOpen size={14} /> 불러오기
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => handleDelete(t.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#dc2626' }}
                    >
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
