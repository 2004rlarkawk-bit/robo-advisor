import { useCallback, useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import type { TradeRequest, TradeRequestPreview } from '../../types/forwarderRequest';
import {
  acceptTradeRequest,
  getTradeRequestPreview,
  listIncomingTradeRequests,
  rejectTradeRequest,
} from '../../services/forwarderRequestService';
import { subscribeToNotifications } from '../../services/notificationService';
import '../../styles/forwarderRequest.css';

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

interface RequestCardProps {
  request: TradeRequest;
  onDecided: (requestId: string) => void;
  onAccepted?: (direction: 'export' | 'import') => void;
}

function RequestCard({ request, onDecided, onAccepted }: RequestCardProps) {
  const [preview, setPreview] = useState<TradeRequestPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTradeRequestPreview(request.id)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err) => {
        console.error('[IncomingTradeRequestsPanel] 미리보기 조회 실패:', err);
        if (!cancelled) setError('요청 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  const handleAccept = async () => {
    if (!preview) return;
    const acceptedDirection = preview.direction;
    setDeciding(true);
    setError('');
    try {
      await acceptTradeRequest(request.id);
      onAccepted?.(acceptedDirection);
      onDecided(request.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청 수락에 실패했습니다.');
    } finally {
      setDeciding(false);
    }
  };

  const handleReject = async () => {
    setDeciding(true);
    setError('');
    try {
      await rejectTradeRequest(request.id);
      onDecided(request.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청 거절에 실패했습니다.');
    } finally {
      setDeciding(false);
    }
  };

  if (loading) {
    return <div className="incoming-request-card">불러오는 중…</div>;
  }
  if (!preview) {
    return <div className="incoming-request-card form-message error">{error || '요청 정보를 찾을 수 없습니다.'}</div>;
  }

  return (
    <div className="incoming-request-card">
      <div className="incoming-request-head">
        <strong>{preview.requesterCompany || '알 수 없는 업체'}</strong>
        <span className="fwd-request-date">{formatDate(preview.createdAt)}</span>
      </div>
      <dl className="incoming-request-grid">
        <div><dt>담당자</dt><dd>{preview.requesterContact || '-'}</dd></div>
        <div><dt>수출/수입</dt><dd>{preview.direction === 'export' ? '수출' : '수입'}</dd></div>
        <div><dt>출발항</dt><dd>{preview.loadPort || '-'}</dd></div>
        <div><dt>도착항</dt><dd>{preview.dischargePort || '-'}</dd></div>
        <div><dt>품목명</dt><dd>{preview.itemName || '-'}</dd></div>
      </dl>
      {preview.message && <div className="incoming-request-message">{preview.message}</div>}
      {error && <div className="form-message error">{error}</div>}
      <div className="incoming-request-actions">
        <button type="button" className="btn btn-secondary" disabled={deciding} onClick={() => void handleReject()}>거절</button>
        <button type="button" className="btn btn-primary" disabled={deciding} onClick={() => void handleAccept()}>수락</button>
      </div>
    </div>
  );
}

interface Props {
  userId?: string;
  embedded?: boolean;
  onAccepted?: (direction: 'export' | 'import') => void;
}

/** 포워더 수신함 — 나에게 온 pending 의뢰 요청 목록. */
export default function IncomingTradeRequestsPanel({ userId, embedded = false, onAccepted }: Props) {
  const [requests, setRequests] = useState<TradeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const all = await listIncomingTradeRequests();
      setRequests(all.filter((request) => request.status === 'pending'));
    } catch (err) {
      console.error('[IncomingTradeRequestsPanel] 요청 목록 조회 실패:', err);
      setError('의뢰 요청을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToNotifications(userId, (notification) => {
      if (notification.type === 'trade_request_received') void load(false);
    });
    const interval = window.setInterval(() => void load(false), 15_000);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [load, userId]);

  const handleDecided = (requestId: string) => {
    setRequests((current) => current.filter((request) => request.id !== requestId));
  };

  if (embedded && !isLoading && !error && requests.length === 0) return null;

  return (
    <section className={`doc-panel incoming-request-panel${embedded ? ' incoming-request-panel--embedded' : ''}`} style={{ display: 'block' }}>
      <div className="doc-panel-head" style={{ cursor: 'default' }}>
        <span className="doc-panel-icon"><Inbox size={22} /></span>
        <div className="doc-panel-head-main">
          <span className="doc-panel-title">신규 의뢰<span className="doc-panel-count">{requests.length}건</span></span>
          <span className="doc-panel-sub">새로 도착한 의뢰를 확인한 뒤 수락하면 아래 업무 목록에 추가됩니다.</span>
        </div>
      </div>
      <div className="doc-panel-body">
        {error && <div className="form-message error">{error}</div>}
        {isLoading ? (
          <div className="doc-empty">불러오는 중입니다.</div>
        ) : requests.length === 0 ? (
          <div className="doc-empty">
            <Inbox size={34} />
            <span>아직 받은 의뢰 요청이 없습니다.</span>
          </div>
        ) : (
          requests.map((request) => (
            <RequestCard key={request.id} request={request} onDecided={handleDecided} onAccepted={onAccepted} />
          ))
        )}
      </div>
    </section>
  );
}
