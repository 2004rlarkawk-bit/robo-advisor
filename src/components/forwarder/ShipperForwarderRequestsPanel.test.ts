import { describe, expect, it } from 'vitest';
import type { SavedTrade } from '../../types';
import type { ExternalForwarderRequest, TradeRequest } from '../../types/forwarderRequest';
import { deriveTradeRequestView } from './ShipperForwarderRequestsPanel';

const trade: SavedTrade = {
  id: 'trade-1',
  profile: {
    tradeType: 'import',
    itemName: '무선 이어폰',
    hsCode: '',
    loadPort: '',
    dischargePort: '',
    incoterms: '',
    quantity: '',
    weight: '',
    departureDate: '',
    arrivalDate: '',
    companyName: '인천테크',
    contact: '',
  },
  tradeDirection: 'import',
  tradeRole: 'shipper',
  documents: [],
  issues: [],
  status: 'submitted',
  submittedAt: '2026-09-15T08:00:00.000Z',
  createdAt: '2026-09-15T08:00:00.000Z',
};

function internal(status: TradeRequest['status']): TradeRequest {
  return {
    id: 'request-1',
    tradeId: trade.id,
    requesterUserId: 'shipper-1',
    receiverUserId: 'forwarder-1',
    status,
    message: null,
    createdAt: '2026-09-15T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
    acceptedAt: status === 'accepted' ? '2026-09-15T09:10:00.000Z' : null,
    rejectedAt: status === 'rejected' ? '2026-09-15T09:10:00.000Z' : null,
    cancelledAt: status === 'cancelled' ? '2026-09-15T09:10:00.000Z' : null,
  };
}

function external(status: ExternalForwarderRequest['status']): ExternalForwarderRequest {
  return {
    id: 'external-1',
    tradeId: trade.id,
    requesterUserId: 'shipper-1',
    recipientEmail: 'forwarder@example.com',
    recipientCompany: 'BH Logistics',
    recipientName: null,
    message: null,
    sentDocumentTypes: [],
    status,
    sentAt: status === 'sent' ? '2026-09-15T09:05:00.000Z' : null,
    failedAt: status === 'failed' ? '2026-09-15T09:05:00.000Z' : null,
    errorMessage: null,
    createdAt: '2026-09-15T09:00:00.000Z',
  };
}

describe('deriveTradeRequestView', () => {
  it('미지정·수락 대기·거절을 서로 다른 다음 조치로 구분한다', () => {
    expect(deriveTradeRequestView(trade, null, null)).toMatchObject({
      category: 'ready', statusLabel: '', canRequest: true,
    });
    expect(deriveTradeRequestView(trade, internal('pending'), null)).toMatchObject({
      category: 'waiting', statusLabel: '수락 대기', canRequest: false,
    });
    expect(deriveTradeRequestView(trade, internal('rejected'), null)).toMatchObject({
      category: 'ready', statusLabel: '거절됨', statusTone: 'warning', forwarderLabel: '회원 포워더', canRequest: true,
    });
  });

  it('의뢰가 닿지 못한 원인을 배지로 구분하고 모두 다시 의뢰할 수 있게 둔다', () => {
    expect(deriveTradeRequestView(trade, null, external('failed'))).toMatchObject({
      category: 'ready', statusLabel: '전송 실패', statusTone: 'warning', forwarderLabel: 'BH Logistics', canRequest: true,
    });
    expect(deriveTradeRequestView(trade, internal('cancelled'), null)).toMatchObject({
      category: 'ready', statusLabel: '재의뢰 필요', statusTone: 'warning', canRequest: true,
    });
  });

  it('이미 맡은 포워더가 있으면 뒤에 보낸 이메일이 실패해도 진행 중으로 본다', () => {
    const assigned = { ...trade, forwarderUserId: 'forwarder-1', forwarderCase: { stage: 'clearance', updatedAt: '2026-09-15T10:00:00.000Z' } };
    expect(deriveTradeRequestView(assigned, null, external('failed'))).toMatchObject({
      category: 'progress', statusLabel: '신고·통관 진행', canRequest: false,
    });
    // 다른 포워더가 먼저 수락해 이 의뢰가 자동 취소된 경우도 마찬가지다.
    expect(deriveTradeRequestView(assigned, internal('cancelled'), null)).toMatchObject({ category: 'progress' });
  });

  it('외부 이메일은 업체명과 전송 상태를 표시한다', () => {
    expect(deriveTradeRequestView(trade, null, external('sent'))).toMatchObject({
      category: 'waiting',
      statusLabel: '이메일 전송 완료',
      forwarderLabel: 'BH Logistics',
    });
  });

  it('수락 뒤 포워더 단계와 화주 보완 필요 상태를 우선 표시한다', () => {
    expect(deriveTradeRequestView({ ...trade, forwarderUserId: 'forwarder-1', forwarderCase: { stage: 'clearance', updatedAt: '2026-09-15T10:00:00.000Z' } }, internal('accepted'), null)).toMatchObject({
      category: 'progress', statusLabel: '신고·통관 진행',
    });
    expect(deriveTradeRequestView({
      ...trade,
      forwarderUserId: 'forwarder-1',
      forwarderCase: {
        stage: 'review',
        updatedAt: '2026-09-15T10:00:00.000Z',
        returnRequest: {
          reason: '원산지를 확인해 주세요.',
          issueTitles: ['원산지'],
          requestedAt: '2026-09-15T10:00:00.000Z',
        },
      },
    }, internal('accepted'), null)).toMatchObject({
      category: 'progress', statusLabel: '화주 보완 필요', needsRevision: true,
    });
  });
});
