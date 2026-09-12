import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, FolderOpen, Inbox, Ship } from 'lucide-react';
import {
  listForwarderExportRequests,
  type ForwarderExportRequest,
} from '../services/forwarderExportRequestService';

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
 * 의뢰를 불러오면 당사자·화물·구간 정보가 채워지고,
 * 포워더는 부킹 결과(선사·선박·항차·컨테이너)만 이어서 입력하면 된다.
 */
export default function ForwarderExportRequestInbox({ onApply, appliedTradeId }: Props) {
  const [requests, setRequests] = useState<ForwarderExportRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const list = await listForwarderExportRequests();
      setRequests(list);
      // 처리할 의뢰가 있으면 포워더가 바로 보도록 펼쳐 둔다.
      if (list.length > 0) setOpen(true);
    } catch (caught) {
      console.error('[Forwarder Inbox] export request query failed:', caught);
      setError('화주 운송의뢰를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="doc-panel">
      <button
        type="button"
        className="doc-panel-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="doc-panel-icon"><Inbox size={22} /></span>
        <div className="doc-panel-head-main">
          <span className="doc-panel-title">
            화주 운송의뢰 수신함
            <span className="doc-panel-count">{requests.length}건</span>
          </span>
          <span className="doc-panel-sub">
            화주가 보낸 운송의뢰서를 불러오면 당사자·화물·구간 정보가 자동으로 채워집니다.
          </span>
        </div>
        <ChevronDown size={21} className={`doc-panel-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="doc-panel-body">
          {error && <div className="form-message error" role="alert">{error}</div>}

          {isLoading ? (
            <div className="doc-empty">운송의뢰를 불러오는 중입니다.</div>
          ) : requests.length === 0 ? (
            <div className="doc-empty">
              <FolderOpen size={34} />
              <span>아직 도착한 운송의뢰가 없습니다.</span>
            </div>
          ) : (
            requests.map((request) => {
              const applied = appliedTradeId === request.tradeId;
              const route = [request.loadPort, request.dischargePort].filter(Boolean).join(' → ');
              const meta = [route, request.incoterms, request.loadingMode || null]
                .filter(Boolean).join(' · ');
              return (
                <div key={request.tradeId} className="draft-tray-item">
                  <div className="draft-tray-info">
                    <div className="draft-tray-line1">
                      <span className="trade-type-badge export">수출</span>
                      <span className="draft-tray-name">{request.itemSummary}</span>
                      {applied && (
                        <span className="draft-tray-status" style={{ color: '#15803d', background: '#f0fdf4' }}>
                          불러옴
                        </span>
                      )}
                    </div>
                    <span className="draft-tray-route">
                      {request.exporterName} → {request.consigneeName}
                      {meta ? ` · ${meta}` : ''}
                    </span>
                    <span className="draft-tray-time">
                      {request.requestNo} · 접수 {formatDate(request.requestedAt)}
                      {request.requestedDepartureDate ? ` · 희망 출항 ${request.requestedDepartureDate}` : ''}
                    </span>
                  </div>
                  <div className="draft-tray-actions">
                    <button type="button" className="draft-tray-resume" onClick={() => onApply(request)}>
                      <Ship size={15} /> 의뢰 불러오기
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
