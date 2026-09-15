import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, RefreshCw, Ship } from 'lucide-react';
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
export default function ForwarderExportRequestInbox({ onApply, appliedTradeId }: Props) {
  const [requests, setRequests] = useState<ForwarderExportRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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
    <section className="fwd-inbox-panel fwd-inbox">
      <div className="fwd-inbox-panel-heading">
        <h3>받은 의뢰 <span>{requests.length}건</span></h3>
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

      {error && <div className="form-message error" role="alert">{error}</div>}

      {isLoading ? (
        <p className="fwd-inbox-empty">운송의뢰를 불러오는 중입니다.</p>
      ) : requests.length === 0 ? (
        <p className="fwd-inbox-empty">
          <FolderOpen size={30} /><br />
          아직 도착한 운송의뢰가 없습니다.<br />
          <span>화주가 운송의뢰서를 제출하면 여기에 표시됩니다.</span>
        </p>
      ) : (
        <div className="fwd-inbox-table-scroll">
          <table className="fwd-inbox-table fwd-export-inbox-table">
            <thead>
              <tr>
                <th>화주 / 품목</th>
                <th>구간</th>
                <th>희망 출항일</th>
                <th>상태</th>
                <th aria-label="동작" />
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const applied = appliedTradeId === request.tradeId;
                const route = [request.loadPort, request.dischargePort].filter(Boolean).join(' → ');
                return (
                  <tr key={request.tradeId} className={applied ? 'is-selected' : undefined}>
                    <td>
                      <div className="fwd-inbox-party">
                        <strong>{request.exporterName || '화주명 미입력'}</strong>
                        <span>{request.itemSummary}</span>
                        <small>{request.requestNo} · 접수 {formatDate(request.requestedAt)}</small>
                      </div>
                    </td>
                    <td>{[route, request.incoterms].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="fwd-inbox-eta">{request.requestedDepartureDate || '미정'}</td>
                    <td>
                      {applied
                        ? <span className="fwd-inbox-badge is-done">불러옴</span>
                        : <span className="fwd-inbox-badge is-new">신규</span>}
                    </td>
                    <td>
                      <button type="button" className="btn btn-primary" onClick={() => onApply(request)}>
                        <Ship size={15} /> 의뢰 불러오기
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
