import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import type { SavedTrade } from '../../../types';
import type { TradeRequest } from '../../../types/forwarderRequest';
import { listIncomingTradeRequests } from '../../../services/forwarderRequestService';
import TradeMessageThread from '../TradeMessageThread';

interface Props {
  trade: SavedTrade | null;
  userId: string;
}

/**
 * 수출 워크플로우의 업무 메시지 — 수입 워크스페이스의 요청·회신 탭과 같은
 * TradeMessageThread를 재사용한다. 이 수출 건에 연결된 의뢰(내가 수신한
 * trade_request)가 있을 때만 나타나며, 직접 등록 건에서는 조용히 숨는다.
 */
export default function ExportForwarderMessages({ trade, userId }: Props) {
  const [request, setRequest] = useState<TradeRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRequest(null);
    if (!trade?.id) return undefined;
    listIncomingTradeRequests()
      .then((requests) => {
        if (cancelled) return;
        const mine = requests.filter((item) => item.tradeId === trade.id);
        setRequest(mine.find((item) => item.status === 'accepted') ?? mine[0] ?? null);
      })
      .catch((err) => console.warn('수출 업무 메시지 의뢰 조회 실패:', err));
    return () => { cancelled = true; };
  }, [trade?.id]);

  if (!request) return null;

  const counterpart = trade?.profile.companyName ? `${trade.profile.companyName} 담당자` : '화주 담당자';
  return (
    <details className="form-card fwd-export-messages">
      <summary><MessageSquare size={16} aria-hidden="true" /> 업무 메시지 <span>화주와 주고받은 대화</span></summary>
      <TradeMessageThread
        tradeRequestId={request.id}
        currentUserId={userId}
        counterpartLabel={counterpart}
        readOnly={request.status !== 'pending' && request.status !== 'accepted'}
      />
    </details>
  );
}
