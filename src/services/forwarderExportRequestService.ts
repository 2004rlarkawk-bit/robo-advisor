import type { FreightTerms, Incoterms, SavedTrade, TransportRequestData } from '../types';
import type { ForwarderFormState } from '../utils/forwarderForm';
import { fetchSavedTrades } from './storageService';
import { isSupabaseConfigured } from '../lib/supabase';
import { deriveFreightTerms } from '../utils/freightTerms';

/**
 * 수출 화주가 제출한 운송의뢰(S/R)가 포워더 업무 큐로 들어온 건.
 *
 * 실무 흐름: 화주가 S/R을 포워더에게 보내면 포워더가 그 내용으로 선사에 부킹하고,
 * 확정된 스케줄·컨테이너 정보를 붙여 House B/L을 발행한다.
 * 따라서 S/R은 포워더 입력의 출발점이며, 부킹 이후 정보(선박·항차·컨테이너)는 포함하지 않는다.
 */
export interface ForwarderExportRequest {
  tradeId: string;
  requestNo: string;
  /** 화주가 최종 제출한 시각 */
  requestedAt: string;
  exporterName: string;
  consigneeName: string;
  /** 대표 품목 요약 — 목록 한 줄 표기용 */
  itemSummary: string;
  itemCount: number;
  loadPort: string;
  dischargePort: string;
  requestedDepartureDate: string;
  incoterms: string;
  loadingMode: 'FCL' | 'LCL' | '';
  freightTerms: FreightTerms;
  transportRequest: TransportRequestData;
  trade: SavedTrade;
}

function summarizeItems(request: TransportRequestData): string {
  const first = request.items[0]?.description?.trim();
  if (!first) return '(품목명 없음)';
  return request.items.length > 1 ? `${first} 외 ${request.items.length - 1}건` : first;
}

/**
 * 화주 수출 거래 → 포워더 업무 큐 항목.
 * 최종 제출된 수출 화주 거래 중 운송의뢰서를 생성한 건만 큐에 올린다.
 * (작성 중인 거래는 화주 소관이므로 포워더에게 보이지 않는다.)
 */
export function deriveForwarderExportRequest(trade: SavedTrade): ForwarderExportRequest | null {
  if ((trade.tradeDirection ?? trade.profile.tradeType) !== 'export') return null;
  if ((trade.tradeRole ?? 'shipper') !== 'shipper') return null;
  if (trade.status !== 'submitted') return null;

  const request = trade.generatedDocs?.transportRequest as TransportRequestData | undefined;
  if (!request) return null;

  return {
    tradeId: trade.id,
    requestNo: request.requestNo,
    requestedAt: trade.submittedAt ?? trade.createdAt,
    exporterName: request.exporter.name || trade.profile.companyName || '-',
    consigneeName: request.consignee.name || trade.profile.partnerName || '-',
    itemSummary: summarizeItems(request),
    itemCount: request.items.length,
    loadPort: request.loadPort,
    dischargePort: request.dischargePort,
    requestedDepartureDate: request.requestedDepartureDate,
    incoterms: request.incoterms,
    loadingMode: request.loadingMode,
    freightTerms: request.freightTerms || deriveFreightTerms(request.incoterms),
    transportRequest: request,
    trade,
  };
}

/** 최신 의뢰가 위로 오도록 정렬 */
export function sortForwarderExportRequests(
  requests: ForwarderExportRequest[],
): ForwarderExportRequest[] {
  return [...requests].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

/** 포워더 수출 업무 큐 조회 — 화주가 제출한 운송의뢰 목록 */
export async function listForwarderExportRequests(): Promise<ForwarderExportRequest[]> {
  if (!isSupabaseConfigured) return [];
  const trades = await fetchSavedTrades('submitted');
  const requests = trades
    .map(deriveForwarderExportRequest)
    .filter((item): item is ForwarderExportRequest => item !== null);
  return sortForwarderExportRequests(requests);
}

/**
 * 화주 운송의뢰 → 포워더 입력 폼 프리필.
 *
 * 화주가 확정한 값(당사자·화물·구간·거래조건)만 채우고,
 * 부킹 이후에 정해지는 값(Carrier·Vessel·Voyage·컨테이너 번호)은 포워더가 직접 넣도록 비워 둔다.
 */
export function applyExportRequestToForwarderForm(
  request: ForwarderExportRequest,
  base: ForwarderFormState,
): ForwarderFormState {
  const sr = request.transportRequest;
  const cargoItems = sr.items.length > 0
    ? sr.items.map((item, index) => ({
      id: `cargo-${index + 1}`,
      itemNo: String(index + 1),
      sku: '',
      descriptionOfGoods: item.description,
      numberOfPackages: item.packageCount,
      kindOfPackages: item.packageType,
      grossWeightKg: item.grossWeight,
      measurementCbm: item.measurement,
      marksAndNumbers: item.marksAndNumbers || sr.shippingMarks,
      sourceDocumentIds: [],
    }))
    : base.cargoItems;

  const sum = (pick: (item: TransportRequestData['items'][number]) => number) =>
    sr.items.reduce((total, item) => total + (Number(pick(item)) || 0), 0);
  const totalPackages = sum((item) => item.packageCount);
  const totalGross = sum((item) => item.grossWeight);

  return {
    ...base,
    companyName: sr.exporter.name,
    companyAddress: sr.exporter.address,
    partnerName: sr.consignee.name,
    partnerAddress: sr.consignee.address,
    notifyPartyName: sr.notifyParty?.name ?? '',
    invoiceNo: sr.invoiceNo,
    incoterms: sr.incoterms as Incoterms,
    loadPort: sr.loadPort,
    dischargePort: sr.dischargePort,
    placeOfReceipt: sr.placeOfReceipt,
    placeOfDelivery: sr.placeOfDelivery,
    freightTerms: sr.freightTerms,
    requestedDepartureDate: sr.requestedDepartureDate,
    departureDate: sr.requestedDepartureDate,
    loadingMode: sr.loadingMode,
    shippingMarks: sr.shippingMarks,
    itemName: sr.items[0]?.description ?? '',
    cargoItems,
    cargoTotals: {
      numberOfPackages: totalPackages > 0 ? totalPackages : '',
      grossWeightKg: totalGross > 0 ? totalGross : '',
      measurementCbm: base.cargoTotals.measurementCbm,
    },
  };
}
