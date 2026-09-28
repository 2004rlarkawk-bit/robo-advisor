import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, getUserMock } = vi.hoisted(() => ({ fromMock: vi.fn(), getUserMock: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
  isSupabaseConfigured: true,
}));

import { fetchForwarderTradeBySourceId } from './storageService';

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'forwarder-1' } }, error: null });
});

describe('fetchForwarderTradeBySourceId', () => {
  it('source_trade_id와 내 user_id로 좁혀 가장 최근 거래를 찾는다', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({
      data: {
        id: 'forwarder-trade-1',
        user_id: 'forwarder-1',
        source_trade_id: 'shipper-trade-1',
        direction: 'export',
        role: 'forwarder',
        schema_version: 3,
        form_data: {
          direction: 'export',
          role: 'forwarder',
          parties: {
            company: { name: '', contact: '' }, partner: { name: '', contact: '' },
            buyer: { name: '', contact: '' }, notifyParty: { name: '', contact: '' },
            signer: { name: '', position: '', signedBy: '' },
          },
          items: [],
          terms: { incoterms: '', incotermsPlace: '', paymentTerms: '', currency: '', invoiceAmount: '', totalAmount: '', reasonForExport: '', freightTerms: '', freightCharges: '', freightPrepaidAt: '', freightPayableAt: '', lcNo: '', lcDate: '', lcBank: '', insuranceConfirmed: false },
          shipment: { loadPort: '', dischargePort: '', placeOfReceipt: '', placeOfDelivery: '', finalDestination: '', departureDate: '', arrivalDate: '', requestedDepartureDate: '', vesselOrFlight: '', carrier: '', exportDeclarationNo: '', bookingNo: '', bookingStatus: '', loadingMode: '', voyageNo: '' },
          packaging: { packageCount: '', packageType: '', netWeight: '', grossWeight: '', measurement: '', shippingMarks: '', containerSize: '', containerQuantity: '' },
          attachments: [],
        },
        workflow_data: null,
        documents: [],
        document_data: null,
        issues: [],
        status: 'generated',
        created_at: '2026-09-15T00:00:00.000Z',
      },
      error: null,
    });
    fromMock.mockReturnValue(query);

    const result = await fetchForwarderTradeBySourceId('shipper-trade-1');

    expect(fromMock).toHaveBeenCalledWith('trades');
    expect(query.eq).toHaveBeenCalledWith('source_trade_id', 'shipper-trade-1');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'forwarder-1');
    expect(result?.id).toBe('forwarder-trade-1');
    expect(result?.sourceTradeId).toBe('shipper-trade-1');
  });

  it('찾지 못하면 null을 돌려준다(에러를 던지지 않는다)', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue(query);

    const result = await fetchForwarderTradeBySourceId('shipper-trade-missing');
    expect(result).toBeNull();
  });
});
