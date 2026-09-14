import { useEffect, useState } from 'react';
import type { TradeRequest } from '../../types/forwarderRequest';
import type { ExternalForwarderRequest } from '../../types/forwarderRequest';
import { listOutgoingTradeRequests } from '../../services/forwarderRequestService';
import { listExternalForwarderRequests } from '../../services/externalForwarderEmailService';
import '../../styles/forwarderRequest.css';

interface Props {
  tradeId: string;
  /** 새 요청/이메일 전송 직후 목록을 다시 불러오기 위한 버전 값 — 바뀔 때마다 재조회한다. */
  refreshKey?: number;
}

const INTERNAL_STATUS_LABEL: Record<TradeRequest['status'], string> = {
  pending: '요청 대기중',
  accepted: '수락됨',
  rejected: '거절됨',
  cancelled: '취소됨',
};

const EXTERNAL_STATUS_LABEL: Record<ExternalForwarderRequest['status'], string> = {
  pending: '전송 처리중',
  sent: '이메일 전송 완료',
  failed: '이메일 전송 실패',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

/** 화주 본인이 이 거래에 대해 보낸 내부 요청/외부 이메일 발송 상태를 보여준다. */
export default function TradeRequestStatusList({ tradeId, refreshKey }: Props) {
  const [internalRequests, setInternalRequests] = useState<TradeRequest[]>([]);
  const [externalRequests, setExternalRequests] = useState<ExternalForwarderRequest[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listOutgoingTradeRequests(tradeId).catch(() => []),
      listExternalForwarderRequests(tradeId).catch(() => []),
    ]).then(([internal, external]) => {
      if (cancelled) return;
      setInternalRequests(internal);
      setExternalRequests(external);
    });
    return () => {
      cancelled = true;
    };
  }, [tradeId, refreshKey]);

  if (internalRequests.length === 0 && externalRequests.length === 0) return null;

  return (
    <div className="fwd-request-status-list">
      {internalRequests.map((request) => (
        <div key={request.id} className="fwd-request-status-row">
          <span className={`fwd-status-pill ${request.status}`}>{INTERNAL_STATUS_LABEL[request.status]}</span>
          <span className="fwd-request-date">{formatDate(request.createdAt)}</span>
        </div>
      ))}
      {externalRequests.map((request) => (
        <div key={request.id} className="fwd-request-status-row">
          <span>{request.recipientCompany || request.recipientEmail}</span>
          <span className={`fwd-status-pill ${request.status}`}>{EXTERNAL_STATUS_LABEL[request.status]}</span>
          <span className="fwd-request-date">{formatDate(request.sentAt ?? request.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}
