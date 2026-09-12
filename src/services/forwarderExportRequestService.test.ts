import { describe, expect, it } from 'vitest';
import type { SavedTrade, TransportRequestData } from '../types';
import { createEmptyForwarderFormState } from '../utils/forwarderForm';
import {
  applyExportRequestToForwarderForm,
  deriveForwarderExportRequest,
  sortForwarderExportRequests,
} from './forwarderExportRequestService';

function transportRequest(): TransportRequestData {
  return {
    requestNo: 'TR-2026-0001',
    requestDate: '2026-09-01',
    exporter: { name: 'K Exporter', address: 'Seoul, Korea', contact: '02-000-0000' },
    requesterName: 'KIM',
    businessRegistrationNo: '123-45-67890',
    consignee: { name: 'US Importer', address: 'Los Angeles, USA', contact: '' },
    notifyParty: { name: 'Notify Co.', address: 'LA', contact: '' },
    items: [
      { description: 'Cashmere Coat', hsCode: '6202110000', quantity: 100, unit: 'PCS', packageCount: 10, packageType: 'CARTON', netWeight: 400, grossWeight: 450, measurement: '2.10', marksAndNumbers: 'ABC-1' },
      { description: 'Wool Scarf', hsCode: '6214200000', quantity: 50, unit: 'PCS', packageCount: 5, packageType: 'CARTON', netWeight: 90, grossWeight: 100, measurement: '0.50', marksAndNumbers: '' },
    ],
    incoterms: 'FOB',
    incotermsPlace: 'Busan Port',
    paymentTerms: 'T/T',
    invoiceNo: 'INV-2026-1',
    loadPort: 'Busan Port',
    dischargePort: 'Los Angeles Port',
    placeOfReceipt: 'Ulsan CFS',
    placeOfDelivery: 'Chicago, IL',
    freightTerms: 'COLLECT',
    shippingMarks: 'DOC-MARK',
    requestedDepartureDate: '2026-09-20',
    loadingMode: 'LCL',
  };
}

function trade(overrides: Partial<SavedTrade> = {}): SavedTrade {
  return {
    id: 'trade-1',
    profile: { tradeType: 'export', companyName: 'K Exporter', partnerName: 'US Importer' },
    documents: [],
    issues: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    submittedAt: '2026-09-02T00:00:00.000Z',
    status: 'submitted',
    tradeDirection: 'export',
    tradeRole: 'shipper',
    generatedDocs: { transportRequest: transportRequest() },
    ...overrides,
  } as SavedTrade;
}

describe('deriveForwarderExportRequest', () => {
  it('제출된 수출 화주 거래의 운송의뢰를 큐 항목으로 만든다', () => {
    const request = deriveForwarderExportRequest(trade());
    expect(request).not.toBeNull();
    expect(request!.requestNo).toBe('TR-2026-0001');
    expect(request!.exporterName).toBe('K Exporter');
    expect(request!.itemSummary).toBe('Cashmere Coat 외 1건');
    expect(request!.itemCount).toBe(2);
    expect(request!.freightTerms).toBe('COLLECT');
  });

  it('작성 중(미제출) 거래는 포워더에게 보이지 않는다', () => {
    expect(deriveForwarderExportRequest(trade({ status: 'in_progress' }))).toBeNull();
  });

  it('수입 거래나 포워더 자신의 거래는 제외한다', () => {
    expect(deriveForwarderExportRequest(trade({ tradeDirection: 'import' }))).toBeNull();
    expect(deriveForwarderExportRequest(trade({ tradeRole: 'forwarder' }))).toBeNull();
  });

  it('운송의뢰서가 없으면 제외한다', () => {
    expect(deriveForwarderExportRequest(trade({ generatedDocs: {} }))).toBeNull();
  });

  it('운임조건이 비어 있으면 Incoterms에서 유도한다', () => {
    const sr = { ...transportRequest(), freightTerms: '' as const };
    const request = deriveForwarderExportRequest(trade({ generatedDocs: { transportRequest: sr } }));
    expect(request!.freightTerms).toBe('COLLECT'); // FOB → 수입자 부담
  });
});

describe('sortForwarderExportRequests', () => {
  it('최근 제출 건이 위로 온다', () => {
    const older = deriveForwarderExportRequest(trade({ id: 'a', submittedAt: '2026-09-01T00:00:00.000Z' }))!;
    const newer = deriveForwarderExportRequest(trade({ id: 'b', submittedAt: '2026-09-05T00:00:00.000Z' }))!;
    expect(sortForwarderExportRequests([older, newer]).map((r) => r.tradeId)).toEqual(['b', 'a']);
  });
});

describe('applyExportRequestToForwarderForm', () => {
  const request = deriveForwarderExportRequest(trade())!;
  const filled = applyExportRequestToForwarderForm(request, createEmptyForwarderFormState());

  it('화주가 확정한 당사자·구간·거래조건을 채운다', () => {
    expect(filled.companyName).toBe('K Exporter');
    expect(filled.partnerName).toBe('US Importer');
    expect(filled.notifyPartyName).toBe('Notify Co.');
    expect(filled.loadPort).toBe('Busan Port');
    expect(filled.dischargePort).toBe('Los Angeles Port');
    expect(filled.placeOfReceipt).toBe('Ulsan CFS');
    expect(filled.placeOfDelivery).toBe('Chicago, IL');
    expect(filled.freightTerms).toBe('COLLECT');
    expect(filled.loadingMode).toBe('LCL');
    expect(filled.invoiceNo).toBe('INV-2026-1');
  });

  it('화물명세를 품목 단위로 옮기고 합계를 계산한다', () => {
    expect(filled.cargoItems).toHaveLength(2);
    expect(filled.cargoItems[0].descriptionOfGoods).toBe('Cashmere Coat');
    expect(filled.cargoItems[0].marksAndNumbers).toBe('ABC-1');
    // 품목 화인이 비면 문서레벨 화인을 상속한다
    expect(filled.cargoItems[1].marksAndNumbers).toBe('DOC-MARK');
    expect(filled.cargoTotals.numberOfPackages).toBe(15);
    expect(filled.cargoTotals.grossWeightKg).toBe(550);
  });

  it('부킹 이후에 정해지는 값은 비워 둔다', () => {
    expect(filled.carrier).toBe('');
    expect(filled.vesselOrFlight).toBe('');
    expect(filled.voyageNo).toBe('');
    expect(filled.containerNo).toBe('');
    expect(filled.bookingNo).toBe('');
  });
});
