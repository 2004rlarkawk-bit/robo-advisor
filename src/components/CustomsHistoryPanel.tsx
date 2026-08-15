import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCheck2, FolderOpen, Download, Search } from 'lucide-react';
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
const handleCheckCargoProgress = async (trade: SavedTrade) => {
  const blNo = trade.profile.blNo?.trim();

  if (!blNo) {
    setCargoProgressByTradeId((current) => ({
      ...current,
      [trade.id]: {
        blNo: '',
        status: 'idle',
        statusText: 'B/L 번호 없음',
        events: [],
        checkedAt: new Date().toISOString(),
        message: '이 거래에는 B/L 번호가 없어 통관 진행정보를 조회할 수 없습니다.',
      },
    }));
    return;
  }

  setCheckingTradeId(trade.id);

  try {
    const result = await getCustomsCargoProgress(blNo);
    setCargoProgressByTradeId((current) => ({
      ...current,
      [trade.id]: result,
    }));
  } catch (caught) {
    setCargoProgressByTradeId((current) => ({
      ...current,
      [trade.id]: {
        blNo,
        status: 'error',
        statusText: '통관 진행정보 조회 실패',
        events: [],
        checkedAt: new Date().toISOString(),
        message: caught instanceof Error ? caught.message : '알 수 없는 오류가 발생했습니다.',
      },
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
                  <span>{trade.profile.companyName || '-'} → {trade.profile.partnerName || '-'}</span>
                  <span className="meta-dot">·</span>
                  <span>통관 준비도 {readiness}%</span>
                  <span className="meta-dot">·</span>
                  <span>화주 서류 {completedShipperDocs}/{shipperDocs.length} 완료</span>
                  <span className="meta-dot">·</span>
                  <span>외부 발급 {externalDocs}건</span>
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
                  <div className={`form-message ${cargoProgress.status === 'error' ? 'error' : 'info'}`} style={{ marginTop: 4 }}>
                    <strong>{cargoProgress.statusText}</strong>
                    <div>B/L 번호: {cargoProgress.blNo || '-'}</div>
                    {cargoProgress.currentStep && <div>현재 단계: {cargoProgress.currentStep}</div>}
                    {cargoProgress.customsOffice && <div>처리 세관: {cargoProgress.customsOffice}</div>}
                    {cargoProgress.lastProcessedAt && <div>마지막 처리일시: {cargoProgress.lastProcessedAt}</div>}
                    {cargoProgress.message && <div>{cargoProgress.message}</div>}
                  </div>
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
