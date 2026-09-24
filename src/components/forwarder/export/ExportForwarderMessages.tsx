import { useEffect, useState } from 'react';
import type { SavedTrade } from '../../../types';
import type { TradeRequest } from '../../../types/forwarderRequest';
import { listIncomingTradeRequests } from '../../../services/forwarderRequestService';
import TradeMessageThread from '../TradeMessageThread';

interface Props {
  trade: SavedTrade | null;
  userId: string;
  sourceTradeId?: string | null;
}

/**
 * 수출 워크플로우의 업무 메시지 — 수입 워크스페이스의 요청·회신 탭과 같은
 * TradeMessageThread를 재사용한다. 이 수출 건에 연결된 의뢰(내가 수신한
 * trade_request)가 있을 때만 나타나며, 직접 등록 건에서는 조용히 숨는다.
 */
export default function ExportForwarderMessages({ trade, userId, sourceTradeId }: Props) {
  const [request, setRequest] = useState<TradeRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const requestTradeId = sourceTradeId || trade?.sourceTradeId || trade?.id;

  useEffect(() => {
    let cancelled = false;
    setRequest(null);
    if (!requestTradeId) return undefined;
    setLoading(true);
    listIncomingTradeRequests()
      .then((requests) => {
        if (cancelled) return;
        const mine = requests.filter((item) => item.tradeId === requestTradeId);
        setRequest(mine.find((item) => item.status === 'accepted') ?? mine[0] ?? null);
      })
      .catch((err) => console.warn('수출 업무 메시지 의뢰 조회 실패:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [requestTradeId]);

  if (!request) {
    return <section className="form-card import-card fwd-export-message-empty" role="status">
      {loading ? '업무 메시지를 불러오는 중…' : '이 의뢰에 연결된 업무 메시지가 없습니다.'}
    </section>;
  }

  const counterpart = trade?.profile.companyName ? `${trade.profile.companyName} 담당자` : '화주 담당자';
  return (
    <section className="form-card import-card fwd-export-message-panel">
      <TradeMessageThread
        tradeRequestId={request.id}
        currentUserId={userId}
        counterpartLabel={counterpart}
        readOnly={request.status !== 'pending' && request.status !== 'accepted'}
      />
    </section>
  );
}
