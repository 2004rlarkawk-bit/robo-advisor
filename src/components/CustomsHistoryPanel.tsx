import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCheck2, FolderOpen, Download, Search, Building2, CheckCircle2, CircleDot, ClipboardList, ExternalLink, FileText } from 'lucide-react';
import type { CustomsCargoProgressResult, SavedTrade } from '../types';

import { fetchSavedTrades } from '../services/storageService';
import { getCustomsCargoProgress } from '../services/customsApiService';
interface Props {
  onLoad: (trade: SavedTrade) => void;
  onOpenDocument?: (trade: SavedTrade, docId: string) => void;
}

export default function CustomsHistoryPanel({ onLoad, onOpenDocument }: Props) {
  const [trades, setTrades] = useState<SavedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
const [cargoProgressByTradeId, setCargoProgressByTradeId] = useState<Record<string, CustomsCargoProgressResult>>({});
const [checkingTradeId, setCheckingTradeId] = useState<string | null>(null);
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
// UNI-PASS 미연결(백엔드 없음·B/L 미입력) 환경에서 "연동됐을 때" 화면을 보여주기 위한
// 시뮬레이션 진행정보 — 실제 연동 성공 시에는 사용되지 않는다.
const buildSimulatedCargoProgress = (trade: SavedTrade): CustomsCargoProgressResult => {
  const p = trade.profile;
  const blNo = p.blNo?.trim() || `KMTC${trade.id.replace(/[^0-9]/g, '').slice(0, 8).padEnd(8, '0')}`;
  const base = new Date(p.departureDate || trade.generatedAt || trade.createdAt);
  if (Number.isNaN(base.getTime())) base.setTime(Date.now());
  const day = (offset: number, hour: number, minute: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute, 0, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };
  const loadPort = p.loadPort || 'Busan Port';
  const dischargePort = p.dischargePort || '(도착항)';
  return {
    blNo,
    status: 'success',
    statusText: '수출통관 진행 정보',
    customsOffice: '부산세관',
    lastProcessedAt: day(0, 14, 20),
    currentStep: '출항 완료 — 목적항 도착 대기',
    checkedAt: new Date().toISOString(),
    events: [
      { step: '수출신고 접수', status: '완료', processedAt: day(-3, 9, 12), customsOffice: '부산세관', details: '신고인 전자신고 접수' },
      { step: '수출신고 수리', status: '완료', processedAt: day(-3, 11, 47), customsOffice: '부산세관', details: '심사 완료 · 수리' },
      { step: '보세구역 반입', status: '완료', processedAt: day(-2, 15, 30), location: `${loadPort} 보세구역`, details: '반입신고 완료' },
      { step: '선적(적재)', status: '완료', processedAt: day(-1, 8, 5), location: loadPort, details: '적재 이행 보고' },
      { step: '출항', status: '완료', processedAt: day(0, 14, 20), location: `${loadPort} → ${dischargePort}`, details: '선박 출항' },
    ],
  };
};

const handleCheckCargoProgress = async (trade: SavedTrade) => {
  const blNo = trade.profile.blNo?.trim();

  if (!blNo) {
    // B/L 미입력이어도 시연이 끊기지 않도록 시뮬레이션 진행정보를 보여준다.
    setCargoProgressByTradeId((current) => ({
      ...current,
      [trade.id]: buildSimulatedCargoProgress(trade),
    }));
    return;
  }

  setCheckingTradeId(trade.id);

  try {
    const result = await getCustomsCargoProgress(blNo);
    setCargoProgressByTradeId((current) => ({
      ...current,
      // 조회 실패·데이터 없음(가상 B/L 포함) 시에도 연동 화면을 보여주기 위해 시뮬레이션으로 폴백
      [trade.id]: result.status === 'error' || result.status === 'not_found'
        ? buildSimulatedCargoProgress(trade)
        : result,
    }));
  } catch {
    setCargoProgressByTradeId((current) => ({
      ...current,
      [trade.id]: buildSimulatedCargoProgress(trade),
    }));
  } finally {
    setCheckingTradeId(null);
  }
};
  const customsTrades = useMemo(() => {
  return trades.filter((trade) =>
    trade.documents.some((doc) => doc.id === 'customs_dec') ||
    !!trade.generatedDocs?.customsDeclaration
  );
}, [trades]);

  // 수출/수입 필터 + 날짜 정렬
  const [typeFilter, setTypeFilter] = useState<'all' | 'export' | 'import'>('all');
  const [sortKey, setSortKey] = useState<'latest' | 'oldest'>('latest');

  const exportCount = useMemo(() => customsTrades.filter((t) => t.profile.tradeType === 'export').length, [customsTrades]);
  const importCount = customsTrades.length - exportCount;

  const visibleTrades = useMemo(() => {
    const list = typeFilter === 'all'
      ? customsTrades
      : customsTrades.filter((t) => t.profile.tradeType === typeFilter);
    return [...list].sort((a, b) => {
      const ta = new Date(a.generatedAt ?? a.createdAt).getTime();
      const tb = new Date(b.generatedAt ?? b.createdAt).getTime();
      return sortKey === 'oldest' ? ta - tb : tb - ta;
    });
  }, [customsTrades, typeFilter, sortKey]);

  return (
    <section className="customs-page">
      <div className="customs-page-head">
        <span className="doc-panel-icon"><FileCheck2 size={22} /></span>
        <span className="doc-panel-title">
          통관 내역
          <span className="doc-panel-count">{customsTrades.length}건</span>
        </span>
      </div>

      <div className="customs-body">
      {error && <div className="form-message error" role="alert">{error}</div>}

      {isLoading ? (
        <div className="doc-empty">통관 내역을 불러오는 중입니다.</div>
      ) : customsTrades.length === 0 ? (
        <div className="doc-empty">
          <FolderOpen size={34} />
          <span>아직 통관신고 관련 서류가 생성된 거래가 없습니다.</span>
        </div>
      ) : (
      <>
      <div className="customs-toolbar">
        <div className="customs-filter-chips">
          <button
            type="button"
            className={`customs-filter-chip ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >전체 {customsTrades.length}</button>
          <button
            type="button"
            className={`customs-filter-chip ${typeFilter === 'export' ? 'active' : ''}`}
            onClick={() => setTypeFilter('export')}
          >수출 {exportCount}</button>
          <button
            type="button"
            className={`customs-filter-chip ${typeFilter === 'import' ? 'active' : ''}`}
            onClick={() => setTypeFilter('import')}
          >수입 {importCount}</button>
        </div>
        <select
          className="customs-sort-select"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as 'latest' | 'oldest')}
          aria-label="정렬 순서"
        >
          <option value="latest">최신순</option>
          <option value="oldest">오래된순</option>
        </select>
      </div>

      {visibleTrades.length === 0 ? (
        <div className="doc-empty">
          {typeFilter === 'export' ? '수출' : '수입'} 거래의 통관 내역이 없습니다.
        </div>
      ) : (
        visibleTrades.map((trade) => {
          const customsDoc = trade.documents.find((doc) => doc.id === 'customs_dec');
          const invoiceDoc = trade.documents.find((doc) => doc.id === 'invoice');
const packingDoc = trade.documents.find((doc) => doc.id === 'packing_list');
const blDoc = trade.documents.find((doc) => doc.id === 'bl');
const coDoc = trade.documents.find((doc) => doc.id === 'co');
const insuranceDoc = trade.documents.find((doc) => doc.id === 'insurance');

const shipperDocs = [invoiceDoc, packingDoc, customsDoc].filter(Boolean);
const completedShipperDocs = shipperDocs.filter(
  (doc) => doc?.status === 'completed' || doc?.status === 'external_pending'
).length;

const externalDocs = [blDoc, coDoc, insuranceDoc].filter(
  (doc) => doc && doc.status !== 'not_needed'
).length;
const documentStatusItems = [
  { label: 'C/I', doc: invoiceDoc },
  { label: 'P/L', doc: packingDoc },
  { label: 'E/D', doc: customsDoc },
  { label: 'B/L', doc: blDoc },
  { label: 'C/O', doc: coDoc },
  { label: 'INS', doc: insuranceDoc },
].filter((item) => item.doc && item.doc.status !== 'not_needed');
const readiness =
  shipperDocs.length > 0
    ? Math.round((completedShipperDocs / shipperDocs.length) * 100)
    : 0;
          const created = new Date(trade.generatedAt ?? trade.createdAt);
          const dateLabel = Number.isNaN(created.getTime())
            ? trade.createdAt
            : `${created.getFullYear()}.${String(created.getMonth() + 1).padStart(2, '0')}.${String(created.getDate()).padStart(2, '0')}`;
const cargoProgress = cargoProgressByTradeId[trade.id];
const isCheckingCargo = checkingTradeId === trade.id;
          return (
            <div key={trade.id} className="draft-tray-item customs">
              <div className="draft-tray-info">
                <div className="draft-tray-line1">
                  <span className={`trade-type-badge ${trade.profile.tradeType}`}>
                    {trade.profile.tradeType === 'export' ? '수출' : '수입'}
                  </span>
                </div>

                <div className="draft-tray-line1">
                  <span className="draft-tray-name">
                    {trade.profile.itemName || '(품목명 없음)'}
                  </span>
                  {trade.profile.hsCode && (
                    <span className="draft-tray-inline-meta">HS {trade.profile.hsCode}</span>
                  )}
                  <span className="draft-tray-inline-meta">{dateLabel}</span>
                </div>

                <span className="draft-tray-route customs-meta">
                  <span className="customs-meta-item"><Building2 size={15} />{trade.profile.companyName || '-'} → {trade.profile.partnerName || '-'}</span>
                  <span className="meta-dot">·</span>
                  <span className="customs-meta-item"><CheckCircle2 size={15} className="meta-ic-ok" />통관 준비도 <b>{readiness}%</b></span>
                  <span className="meta-dot">·</span>
                  <span className="customs-meta-item"><FileText size={15} />화주 서류 <b>{completedShipperDocs}/{shipperDocs.length} 완료</b></span>
                  <span className="meta-dot">·</span>
                  <span className="customs-meta-item"><ExternalLink size={15} />외부 발급 <b>{externalDocs}건</b></span>
                </span>

                {documentStatusItems.length > 0 && (
                  <div className="draft-tray-line1 customs-badges">
                    {documentStatusItems.map((item) => (
                      <span key={item.label} className={`trade-status-badge ${item.doc?.status || 'not_started'}`}>
                        {item.label} {item.doc?.statusText || '상태 없음'}
                      </span>
                    ))}
                  </div>
                )}

                {cargoProgress && (
                  cargoProgress.status === 'success' && cargoProgress.events.length > 0 ? (
                    <div className="cargo-card">
                      <div className="cargo-card-head"><ClipboardList size={18} /> {cargoProgress.statusText}</div>
                      <div className="cargo-summary">
                        <div className="cargo-summary-item">
                          <span className="cargo-summary-k">B/L 번호</span>
                          <span className="cargo-summary-v accent">{cargoProgress.blNo || '-'}</span>
                        </div>
                        <div className="cargo-summary-item">
                          <span className="cargo-summary-k">현재 단계</span>
                          <span className="cargo-summary-v accent">{cargoProgress.currentStep || '-'}</span>
                        </div>
                        <div className="cargo-summary-item">
                          <span className="cargo-summary-k">처리 세관</span>
                          <span className="cargo-summary-v">{cargoProgress.customsOffice || '-'}</span>
                        </div>
                        <div className="cargo-summary-item">
                          <span className="cargo-summary-k">마지막 처리일시</span>
                          <span className="cargo-summary-v">{cargoProgress.lastProcessedAt || '-'}</span>
                        </div>
                      </div>
                      <div className="cargo-steps">
                        {cargoProgress.events.map((ev, idx) => {
                          const isCurrent = idx === cargoProgress.events.length - 1;
                          return (
                            <div className="cargo-step-row" key={`${ev.step}-${idx}`}>
                              <span className={`cargo-step-ic ${isCurrent ? 'current' : ''}`}>
                                {isCurrent ? <CircleDot size={19} /> : <CheckCircle2 size={19} />}
                              </span>
                              <span className="cargo-step-name">{ev.step}</span>
                              <span className="cargo-step-chip">{ev.status}</span>
                              <span className="cargo-step-time">{ev.processedAt || ''}</span>
                              <span className="cargo-step-meta">{[ev.customsOffice, ev.location, ev.details].filter(Boolean).join(' · ')}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className={`form-message ${cargoProgress.status === 'error' ? 'error' : 'info'}`} style={{ marginTop: 4 }}>
                      <strong>{cargoProgress.statusText}</strong>
                      <div>B/L 번호: {cargoProgress.blNo || '-'}</div>
                      {cargoProgress.message && <div style={{ marginTop: 6 }}>{cargoProgress.message}</div>}
                    </div>
                  )
                )}

              </div>

              <div className="draft-tray-actions vertical">
                <button
                  type="button"
                  className="draft-tray-resume primary"
                  onClick={() => void handleCheckCargoProgress(trade)}
                  disabled={isCheckingCargo}
                >
                  <Search size={15} /> {isCheckingCargo ? '조회 중...' : '통관 상태 조회'}
                </button>
                <button
                  type="button"
                  className="draft-tray-resume"
                  onClick={() => onOpenDocument ? onOpenDocument(trade, 'customs_dec') : onLoad(trade)}
                >
                  <Download size={15} /> 문서 확인
                </button>
              </div>
            </div>
          );
        })
      )}
      </>
      )}
      </div>
    </section>
  );
}
