import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Trash2, FolderOpen, AlertTriangle, CheckCircle2, X, Clock, Search, StickyNote, ChevronDown } from 'lucide-react';
import type { SavedTrade } from '../types';
import { deleteSavedTrade, fetchTradeManagerTrades } from '../services/storageService';
import { filterTradeManagerTrades } from '../services/tradeListPolicy';

interface Props {
  onLoad: (trade: SavedTrade) => void; // 이어서 작업 (작업실로 불러오기)
  /** AI 통관 작업실 내 임시보관함 모드 — 최근 3건만 컴팩트하게 표시 */
  embedded?: boolean;
}

const MEMO_KEY = 'portai_trade_memos_v1';

// 거래별 메모는 localStorage에 보관 (백엔드 컬럼 없이 브라우저에 저장)
function loadMemos(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MEMO_KEY) || '{}'); } catch { return {}; }
}
function saveMemos(m: Record<string, string>) {
  localStorage.setItem(MEMO_KEY, JSON.stringify(m));
}

type StatusFilter = 'all' | 'review' | 'ready';
type SortKey = 'latest' | 'oldest' | 'errors' | 'deadline';

// 선적일(없으면 도착예정일)까지 남은 일수 → D-day 라벨
function deadlineInfo(trade: SavedTrade): { days: number; label: string; urgent: boolean } | null {
  const raw = trade.profile.departureDate || trade.profile.arrivalDate;
  if (!raw) return null;
  const target = new Date(raw);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  const which = trade.profile.departureDate ? '선적' : '도착';
  const label = days < 0 ? `${which} 지남` : days === 0 ? `${which} D-DAY` : `${which} D-${days}`;
  return { days, label, urgent: days >= 0 && days <= 3 };
}

function errorCountOf(t: SavedTrade) {
  return t.issues.filter((i) => i.severity === 'error').length;
}
// 임시보관함 상태 칩: 색 + 문구를 함께 노출 (빨강 필수오류·마감임박 > 주황 보완 > 회색 입력 중 > 초록 준비 완료)
function trayStatusOf(t: SavedTrade): { text: string; color: string; bg: string; accent: string } {
  const errors = errorCountOf(t);
  const warns = t.issues.filter((i) => i.severity === 'warning').length;
  const dl = deadlineInfo(t);
  if (errors > 0) return { text: `필수 오류 ${errors}건`, color: '#b91c1c', bg: '#fef2f2', accent: '#ef4444' };
  if (dl?.urgent) return { text: dl.label, color: '#b91c1c', bg: '#fef2f2', accent: '#ef4444' };
  if (warns > 0) return { text: `보완 권장 ${warns}건`, color: '#b45309', bg: '#fffbeb', accent: '#f59e0b' };
  if (t.status === 'in_progress') return { text: '입력 중', color: '#64748b', bg: '#f1f5f9', accent: '#cbd5e1' };
  return { text: '생성 준비 완료', color: '#15803d', bg: '#f0fdf4', accent: '#22c55e' };
}
function doneCountOf(t: SavedTrade) {
  return t.documents.filter((d) => d.status === 'completed').length;
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TradeManagerPanel({ onLoad, embedded }: Props) {
  const [trades, setTrades] = useState<SavedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('latest');
  const [detail, setDetail] = useState<SavedTrade | null>(null);
  const [memos, setMemos] = useState<Record<string, string>>(loadMemos);
  const [editingMemo, setEditingMemo] = useState<string | null>(null);
  // 임시보관함(임베드) 전용: 접힘 상태 · 전체 보기 — 제출 문서함과 나란히 접힌 상태로 시작
  const [trayOpen, setTrayOpen] = useState(false);
  const [trayShowAll, setTrayShowAll] = useState(false);

  const loadTrades = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setTrades(filterTradeManagerTrades(await fetchTradeManagerTrades()));
    } catch (caught) {
      console.error('[Trade Manager] generated trades query failed:', caught);
      setError('진행 중인 거래를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadTrades(); }, [loadTrades]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 거래를 삭제할까요? 되돌릴 수 없습니다.')) return;
    try {
      await deleteSavedTrade(id);
      setTrades((cur) => cur.filter((t) => t.id !== id));
    } catch (caught) {
      console.error('[Trade Manager] deletion failed:', caught);
      setError('거래를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const setMemo = (id: string, text: string) => {
    setMemos((cur) => {
      const next = { ...cur };
      if (text.trim()) next[id] = text.trim(); else delete next[id];
      saveMemos(next);
      return next;
    });
  };

  const counts = useMemo(() => {
    const review = trades.filter((t) => errorCountOf(t) > 0).length;
    const thisMonth = trades.filter((t) => (t.createdAt || '').startsWith(new Date().toISOString().slice(0, 7))).length;
    return { total: trades.length, review, ready: trades.length - review, thisMonth };
  }, [trades]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = trades.filter((t) => {
      const err = errorCountOf(t);
      if (statusFilter === 'review' && err === 0) return false;
      if (statusFilter === 'ready' && err > 0) return false;
      if (!q) return true;
      const hay = [t.profile.itemName, t.profile.companyName, t.profile.partnerName, t.profile.hsCode, memos[t.id]]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      if (sortKey === 'errors') return errorCountOf(b) - errorCountOf(a);
      if (sortKey === 'deadline') {
        const da = deadlineInfo(a)?.days ?? 99999;
        const db = deadlineInfo(b)?.days ?? 99999;
        return da - db;
      }
      const ta = new Date(a.updatedAt ?? a.createdAt).getTime();
      const tb = new Date(b.updatedAt ?? b.createdAt).getTime();
      return sortKey === 'oldest' ? ta - tb : tb - ta;
    });
    return list;
  }, [trades, search, statusFilter, sortKey, memos]);

  // 임시보관함(작업실 하단 임베드): 접힌 아코디언. 펼치면 최근 3건, [전체 보기]로 확장. 없으면 렌더하지 않는다.
  if (embedded) {
    if (isLoading || trades.length === 0) return null;
    const sorted = [...trades].sort((a, b) =>
      new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime()
    );
    const recent = trayShowAll ? sorted : sorted.slice(0, 3);
    return (
      <section className="draft-tray" aria-label="임시보관함">
        <button
          type="button"
          className="draft-tray-header"
          aria-expanded={trayOpen}
          onClick={() => setTrayOpen((v) => !v)}
        >
          <span className="doc-panel-icon"><Layers size={22} /></span>
          <div className="draft-tray-head-main">
            <span className="draft-tray-title">
              임시보관함
              <span className="draft-tray-count">{trades.length}건</span>
            </span>
            <span className="draft-tray-sub">작성 중인 거래를 이어서 작업할 수 있어요.</span>
          </div>
          <ChevronDown size={21} className={`draft-tray-chevron ${trayOpen ? 'open' : ''}`} />
        </button>

        {trayOpen && (
          <div className="draft-tray-body">
            {error && <div className="form-message error" role="alert">{error}</div>}
            {recent.map((trade) => {
              const st = trayStatusOf(trade);
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
                      <span className="draft-tray-status" style={{ color: st.color, background: st.bg }}>{st.text}</span>
                    </div>
                    {route && <span className="draft-tray-route">{route}</span>}
                    <span className="draft-tray-time">{fmtDate(trade.updatedAt ?? trade.createdAt)}</span>
                  </div>
                  <div className="draft-tray-actions">
                    <button type="button" className="draft-tray-resume" onClick={() => onLoad(trade)}>
                      <FolderOpen size={15} /> 이어서 작업
                    </button>
                    <button type="button" className="draft-tray-delete" aria-label="거래 삭제" onClick={() => void handleDelete(trade.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
            {trades.length > 3 && (
              <button type="button" className="draft-tray-more" onClick={() => setTrayShowAll((v) => !v)}>
                {trayShowAll ? '최근 3건만 보기' : `전체 보기 (${trades.length}건)`}
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title document-manager-title"><Layers size={26} /> 임시보관함</h1>
        <p className="page-subtitle">아직 제출하지 않은 작업 중인 거래를 이어서 진행하거나 정리하세요.</p>
      </div>

      {/* 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        <SummaryTile n={counts.total} label="진행 중인 거래" />
        <SummaryTile n={counts.review} label="검토 필요 (오류 있음)" warn />
        <SummaryTile n={counts.thisMonth} label="이번 달 생성" />
      </div>

      {error && <div className="form-message error" role="alert">{error}</div>}

      {/* 검색·정렬 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px' }}>
          <Search size={16} color="#94a3b8" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="품목명·회사·HS 코드·메모로 검색"
            style={{ border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit', fontSize: 14 }}
          />
        </div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, color: '#475569', background: '#fff' }}>
          <option value="latest">최신순</option>
          <option value="oldest">오래된순</option>
          <option value="errors">오류 많은순</option>
          <option value="deadline">마감 임박순</option>
        </select>
      </div>

      {/* 필터 칩 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label={`전체 ${counts.total}`} />
        <FilterChip active={statusFilter === 'review'} onClick={() => setStatusFilter('review')} label={`검토 필요 ${counts.review}`} />
        <FilterChip active={statusFilter === 'ready'} onClick={() => setStatusFilter('ready')} label={`제출 준비됨 ${counts.ready}`} />
      </div>

      {isLoading ? (
        <div className="form-card document-empty">진행 중인 거래를 불러오는 중입니다.</div>
      ) : trades.length === 0 ? (
        <div className="form-card document-empty">
          <FolderOpen size={36} />
          아직 진행 중인 거래가 없습니다. AI 통관 작업실에서 새 거래를 시작해 보세요.
        </div>
      ) : visible.length === 0 ? (
        <div className="form-card document-empty">검색·필터 조건에 맞는 거래가 없습니다.</div>
      ) : (
        visible.map((trade) => {
          const errorCount = errorCountOf(trade);
          const doneCount = doneCountOf(trade);
          const dl = deadlineInfo(trade);
          const memo = memos[trade.id];
          const isReview = errorCount > 0;
          return (
            <div key={trade.id} className="form-card document-trade-card" style={{ borderLeft: `4px solid ${isReview ? '#f59e0b' : '#22c55e'}` }}>
              <div className="document-trade-row">
                <div className="document-trade-summary" style={{ cursor: 'pointer' }} onClick={() => setDetail(trade)}>
                  <div className="document-trade-heading">
                    <span className={`trade-type-badge ${trade.profile.tradeType}`}>{trade.profile.tradeType === 'export' ? '수출' : '수입'}</span>
                    <span className="document-trade-name">{trade.profile.itemName || '(품목명 없음)'}</span>
                    {trade.profile.hsCode && <span className="document-hs-code">HS {trade.profile.hsCode}</span>}
                    <span className="status-badge" style={isReview ? { background: '#fffbeb', color: '#b45309' } : { background: '#f0fdf4', color: '#15803d' }}>
                      {trade.status === 'in_progress' ? '진행 중' : isReview ? '검토 필요' : '제출 준비됨'}
                    </span>
                    {dl && (
                      <span className="status-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: dl.urgent ? '#fef2f2' : '#f1f5f9', color: dl.urgent ? '#b91c1c' : '#64748b' }}>
                        <Clock size={12} /> {dl.label}
                      </span>
                    )}
                  </div>
                  <div className="document-trade-meta">{trade.profile.companyName || '-'} → {trade.profile.partnerName || '-'} · {fmtDate(trade.createdAt)}</div>
                  {/* 메모 */}
                  {editingMemo === trade.id ? (
                    <input
                      autoFocus
                      defaultValue={memo || ''}
                      placeholder="메모·별칭 입력 후 Enter"
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => { setMemo(trade.id, e.target.value); setEditingMemo(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setMemo(trade.id, (e.target as HTMLInputElement).value); setEditingMemo(null); } }}
                      style={{ marginTop: 6, fontSize: 12.5, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontFamily: 'inherit', width: 'min(320px, 90%)' }}
                    />
                  ) : (
                    <div
                      onClick={(e) => { e.stopPropagation(); setEditingMemo(trade.id); }}
                      style={{ marginTop: 6, fontSize: 12.5, color: memo ? '#334155' : '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'text' }}
                    >
                      <StickyNote size={13} /> {memo || '메모 추가'}
                    </div>
                  )}
                </div>

                <div className="document-trade-counts">
                  <span className="document-complete-count"><CheckCircle2 size={14} /> 문서 {doneCount}/{trade.documents.length}</span>
                  <span className={errorCount > 0 ? 'document-error-count active' : 'document-error-count'}><AlertTriangle size={14} /> 오류 {errorCount}건</span>
                </div>

                <div className="document-trade-buttons">
                  <button className="btn-primary" onClick={() => onLoad(trade)}><FolderOpen size={14} /> 이어서 작업</button>
                  <button className="btn-secondary document-delete-button" aria-label="거래 삭제" onClick={() => void handleDelete(trade.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          );
        })
      )}

      {detail && <DetailModal trade={detail} memo={memos[detail.id]} onClose={() => setDetail(null)} onLoad={() => { onLoad(detail); setDetail(null); }} />}
    </div>
  );
}

function SummaryTile({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div className="form-card" style={{ padding: '15px 16px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: warn && n > 0 ? '#b45309' : '#1e293b', lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      border: `1px solid ${active ? '#0b57d0' : '#e2e8f0'}`,
      background: active ? '#0b57d0' : '#fff',
      color: active ? '#fff' : '#64748b',
      fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  );
}

function DetailModal({ trade, memo, onClose, onLoad }: { trade: SavedTrade; memo?: string; onClose: () => void; onLoad: () => void }) {
  const p = trade.profile;
  const rows: [string, string][] = [
    ['거래 구분', p.tradeType === 'export' ? '수출' : '수입'],
    ['품목명', p.itemName || '-'],
    ['HS CODE', p.hsCode || '-'],
    ['거래처', `${p.companyName || '-'} → ${p.partnerName || '-'}`],
    ['항구', `${p.loadPort || '-'} → ${p.dischargePort || '-'}`],
    ['거래조건', p.incoterms || '-'],
    ['수량 / 중량', `${p.quantity || '-'} / ${p.weight || '-'}`],
    ['단가 / 금액', `${p.unitPrice ?? '-'} / ${p.totalAmount ?? '-'} ${p.currency || ''}`],
    ['선적일 / 도착예정', `${p.departureDate || '-'} / ${p.arrivalDate || '-'}`],
    ['송장번호 / 작성일', `${p.invoiceNo || '-'} / ${p.invoiceDate || '-'}`],
  ];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 2000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 24px 50px -18px rgba(15,23,42,.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>{p.itemName || '(품목명 없음)'} · 상세</h2>
          <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 22 }}>
          {memo && <div style={{ marginBottom: 16, fontSize: 13, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>📝 {memo}</div>}

          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#64748b', margin: '0 0 8px' }}>거래 정보</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 7, fontSize: 13.5, marginBottom: 20 }}>
            {rows.map(([k, v]) => (
              <Fragment key={k}>
                <div style={{ color: '#94a3b8' }}>{k}</div>
                <div style={{ color: '#1e293b', fontWeight: 500 }}>{v}</div>
              </Fragment>
            ))}
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#64748b', margin: '0 0 8px' }}>문서 상태</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {trade.documents.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>{d.name}</span>
                <span style={{ color: d.status === 'completed' ? '#15803d' : d.status === 'not_needed' ? '#94a3b8' : '#b45309', fontWeight: 600 }}>{d.statusText}</span>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#64748b', margin: '0 0 8px' }}>검증 결과 ({trade.issues.length}건)</h3>
          {trade.issues.length === 0 ? (
            <div style={{ fontSize: 13, color: '#15803d' }}>✓ 지적사항이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {trade.issues.map((i, idx) => (
                <div key={idx} style={{ fontSize: 12.5, color: '#475569', display: 'flex', gap: 7 }}>
                  <span style={{ color: i.severity === 'error' ? '#b91c1c' : i.severity === 'warning' ? '#b45309' : '#64748b', fontWeight: 700 }}>
                    {i.severity === 'error' ? '오류' : i.severity === 'warning' ? '경고' : '안내'}
                  </span>
                  <span>{i.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8, position: 'sticky', bottom: 0, background: '#fff' }}>
          <button className="btn-secondary" onClick={onClose}>닫기</button>
          <button className="btn-primary" onClick={onLoad}><FolderOpen size={14} /> 이어서 작업</button>
        </div>
      </div>
    </div>
  );
}
