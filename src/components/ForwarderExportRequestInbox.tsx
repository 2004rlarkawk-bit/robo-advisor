import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Inbox, RefreshCw } from 'lucide-react';
import {
  listForwarderExportRequests,
  type ForwarderExportRequest,
} from '../services/forwarderExportRequestService';
import '../styles/forwarderImportInbox.css';

interface Props {
  /** 선택한 의뢰를 포워더 입력 폼에 반영 */
  onApply: (request: ForwarderExportRequest) => void;
  /** 이미 불러온 의뢰 — 목록에서 '불러옴'으로 표시 */
  appliedTradeId?: string | null;
  headerAction?: ReactNode;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * 화주가 제출한 수출 운송의뢰(S/R) 수신함.
 * 수입 포워더의 '받은 의뢰' 테이블과 같은 문법으로 보여준다 —
 * 의뢰를 불러오면 당사자·화물·구간 정보가 채워지고,
 * 포워더는 부킹 결과(선사·선박·항차·컨테이너)만 이어서 입력하면 된다.
 */
export default function ForwarderExportRequestInbox({ onApply, appliedTradeId, headerAction }: Props) {
  const [requests, setRequests] = useState<ForwarderExportRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'new' | 'loaded'>('all');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const loadedCount = requests.filter(request => request.tradeId === appliedTradeId).length;
  const visibleRequests = requests.filter(request => filter === 'all' || (filter === 'loaded' ? request.tradeId === appliedTradeId : request.tradeId !== appliedTradeId));
  const picked = visibleRequests.find(request => request.tradeId === pickedId) ?? visibleRequests[0] ?? null;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setRequests(await listForwarderExportRequests());
    } catch (caught) {
      console.error('[Forwarder Inbox] export request query failed:', caught);
      setError('화주 운송의뢰를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="fwd-inbox">
      <div className="fwd-inbox-panel" aria-busy={isLoading}>
      <div className="fwd-inbox-panel-heading">
        <h2>받은 의뢰 <span>{requests.length}건</span></h2>
        <div className="fwd-inbox-heading-actions">
        {headerAction}
        <button
          type="button"
          className="btn btn-secondary fwd-inbox-refresh"
          aria-label="받은 의뢰 새로고침"
          disabled={isLoading}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </button>
        </div>
      </div>
      <div className="fwd-inbox-filters" role="group" aria-label="수출 의뢰 필터">
        {([
          ['all', '전체', requests.length],
          ['new', '신규', requests.length - loadedCount],
          ['loaded', '불러옴', loadedCount],
        ] as const).map(([value, label, count]) => (
          <button key={value} type="button" className={filter === value ? 'is-active' : undefined}
            aria-pressed={filter === value} onClick={() => { setFilter(value); setPickedId(null); }}>
            {label}<span>{count}</span>
          </button>
        ))}
      </div>

      {error && <p className="form-message error" role="alert">{error}</p>}

      {isLoading && !error ? <p className="fwd-inbox-empty" role="status">운송의뢰를 불러오는 중…</p>
        : !error && requests.length === 0 ? <div className="fwd-inbox-empty"><Inbox size={28} aria-hidden="true" /><p>아직 받은 의뢰가 없습니다.</p><span>화주가 운송의뢰서를 제출하면 여기에 표시됩니다.</span></div>
        : !error && visibleRequests.length === 0 ? <p className="fwd-inbox-empty">이 상태의 의뢰가 없습니다.</p>
        : visibleRequests.length > 0 && <div className="fwd-inbox-table-scroll">
          <table className="fwd-inbox-table fwd-export-inbox-table">
            <caption className="fwd-inbox-sr">받은 수출 의뢰 목록. 의뢰를 선택한 후 하단의 열기 버튼을 누르세요.</caption>
            <thead>
              <tr>
                <th scope="col"><span className="fwd-inbox-sr">선택</span></th>
                <th scope="col">화주 / 품목</th>
                <th scope="col">희망 출항일</th>
                <th scope="col">상태</th>
                <th scope="col">다음 할 일</th>
              </tr>
            </thead>
            <tbody>
              {visibleRequests.map((request) => {
                const applied = appliedTradeId === request.tradeId;
                const route = [request.loadPort, request.dischargePort].filter(Boolean).join(' → ');
                return (
                  <tr key={request.tradeId} className={picked?.tradeId === request.tradeId ? 'is-selected' : undefined}
                    onClick={() => setPickedId(request.tradeId)}>
                    <td><input type="radio" name="forwarder-export-request"
                      aria-label={`${request.exporterName || '화주명 미입력'} · ${request.requestNo} 선택`}
                      checked={picked?.tradeId === request.tradeId}
                      onChange={() => setPickedId(request.tradeId)} /></td>
                    <td className="fwd-inbox-party">
                        <strong>{request.exporterName || '화주명 미입력'}</strong>
                        <span>{request.itemSummary} · {route || '구간 미입력'}</span>
                        <small>{request.requestNo} · 접수 {formatDate(request.requestedAt)}</small>
                    </td>
                    <td className="fwd-inbox-eta">{request.requestedDepartureDate || '미정'}</td>
                    <td>
                      {applied
                        ? <span className="fwd-inbox-badge is-done">불러옴</span>
                        : <span className="fwd-inbox-badge is-new">신규</span>}
                    </td>
                    <td>{applied ? '의뢰 내용 확인' : '부킹 정보 등록'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      {picked && <div className="fwd-inbox-selection" aria-live="polite">
        <strong>{picked.exporterName || '화주명 미입력'}</strong>
        <span>· {picked.itemSummary}</span>
        <div className="fwd-inbox-documents"><span title="운송의뢰서">S/R</span></div>
      </div>}
      </div>
      <footer className="fwd-inbox-footer">
        <button type="button" className="btn btn-primary" disabled={!picked || isLoading || Boolean(error)}
          onClick={() => { if (picked) onApply(picked); }}>
          선택한 의뢰 열기 <ArrowRight size={18} aria-hidden="true" />
        </button>
      </footer>
    </section>
  );
}
