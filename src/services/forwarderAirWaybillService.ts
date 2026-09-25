import type { BillOfLadingData } from '../types';
import type { ForwarderFormState } from '../utils/forwarderForm';

/**
 * 항공화물운송장(AWB) 발행 검증·초안 생성.
 *
 * 선하증권과 달리 AWB는 유통증권이 아니라서 원본 통수·Surrender·본선적재일 개념이 없다.
 * 대신 출발/도착 공항, 항공편과 출발일, 운임 지급 구분(PREPAID/COLLECT),
 * 신고가격(NVD/NCV)이 기재사항이 된다. — 항공운송장 표준 양식(IATA Resolution 600a) 기준.
 */

export interface ForwarderAirWaybillValidation {
  valid: boolean;
  /** 없으면 발행 불가한 항목 */
  missingLabels: string[];
  /** 발행은 되지만 실무상 확인이 필요한 항목 */
  warningLabels: string[];
}

/** 운송장 번호 — 항공사 부호 3자리 + 일련번호 8자리(마지막 자리는 검증번호). 구분 기호는 무시한다. */
const AWB_NUMBER_PATTERN = /^\d{3}-?\d{8}$/;

export function validateForwarderAirWaybill(
  state: ForwarderFormState,
): ForwarderAirWaybillValidation {
  const missingLabels: string[] = [];
  const warningLabels: string[] = [];
  const hasDescription = state.cargoItems.some((item) => item.descriptionOfGoods.trim());
  const hasWeight = state.cargoItems.some((item) => String(item.grossWeightKg).trim())
    || String(state.cargoTotals.grossWeightKg).trim();
  const hasPackages = state.cargoItems.some((item) => String(item.numberOfPackages).trim())
    || String(state.cargoTotals.numberOfPackages).trim();

  const required: Array<[string, string]> = [
    [state.companyName, 'Shipper (송하인)'],
    [state.partnerName, 'Consignee (수하인)'],
    [hasDescription ? 'present' : '', 'Nature and Quantity of Goods (품명)'],
    [hasPackages ? 'present' : '', 'No. of Pieces (개수)'],
    [hasWeight ? 'present' : '', 'Gross Weight (총중량)'],
    [state.carrier, 'Issuing Carrier (항공사)'],
    [state.vesselOrFlight, 'Flight No. (항공편명)'],
    [state.loadPort, 'Airport of Departure (출발 공항)'],
    [state.dischargePort, 'Airport of Destination (도착 공항)'],
    [state.freightTerms, 'Freight (운임 지급 구분)'],
    [state.placeOfIssue, 'Place of Issue (발행지)'],
    [state.dateOfIssue, 'Date of Issue (발행일자)'],
    [state.issuerName, 'Issued by (발행자)'],
  ];
  required.forEach(([value, label]) => {
    if (!String(value ?? '').trim()) missingLabels.push(label);
  });

  // 경고 — 발행은 가능하나 실무상 확인이 필요하다.
  if (!state.flightDate.trim()) {
    warningLabels.push('Flight Date (항공편 출발일) — 비어 있으면 운송장에 편명만 표기됩니다.');
  }
  const awbNo = state.awbNo.replace(/\s/g, '');
  if (awbNo && !AWB_NUMBER_PATTERN.test(awbNo)) {
    warningLabels.push('AWB No. — 항공사 부호 3자리와 일련번호 8자리(예: 180-12345675) 형식이 아닙니다.');
  }
  if (!state.declaredValueCarriage.trim() || !state.declaredValueCustoms.trim()) {
    warningLabels.push('신고가격 — 비워 두면 운송신고가격은 NVD, 세관신고가격은 NCV로 표기됩니다.');
  }

  return { valid: missingLabels.length === 0, missingLabels, warningLabels };
}

export function createForwarderAirWaybillDraft(
  state: ForwarderFormState,
  tradeId: string,
  generatedAt = new Date().toISOString(),
  /** 3단계에서 등록한 Master AWB 번호 — 운송장에 참조로 적는다. */
  masterDocumentNo = '',
): BillOfLadingData {
  const notifyParty = state.notifyPartyName.trim()
    ? { name: state.notifyPartyName.trim(), address: '', contact: '' }
    : undefined;

  return {
    draftNo: `AWB-DRAFT-${tradeId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    generatedAt,
    transportMode: 'AIR',
    kind: state.blKind,
    // 해상 번호 칸은 비워 두고 항공 운송장 번호만 쓴다.
    blNo: '',
    awbNo: state.awbNo.trim(),
    shipper: {
      name: state.companyName.trim(),
      address: state.companyAddress.trim(),
      contact: '',
    },
    consignee: {
      name: state.partnerName.trim(),
      address: state.partnerAddress.trim(),
      contact: '',
    },
    notifyParty,
    carrier: state.carrier.trim(),
    bookingNo: state.bookingNo.trim(),
    // 항공은 선박·항차 대신 편명과 출발일을 쓴다.
    vessel: state.vesselOrFlight.trim(),
    voyageNo: '',
    flightDate: state.flightDate,
    placeOfReceipt: state.placeOfReceipt.trim() || state.loadPort.trim(),
    loadPort: state.loadPort.trim(),
    dischargePort: state.dischargePort.trim(),
    placeOfDelivery: state.placeOfDelivery.trim() || state.dischargePort.trim(),
    etd: state.departureDate,
    eta: state.arrivalDate,
    // 컨테이너·적재 방식은 해상 전용이라 항공 운송장에서는 비운다.
    loadingMode: '',
    containerNo: '',
    sealNo: '',
    freightTerms: state.freightTerms,
    freightAndCharges: state.freightAndCharges.trim(),
    // 유통증권이 아니므로 원본 통수·Surrender·본선적재일은 쓰지 않는다.
    numberOfOriginals: 0,
    placeOfIssue: state.placeOfIssue.trim(),
    dateOfIssue: state.dateOfIssue || generatedAt.slice(0, 10),
    shippedOnBoardDate: '',
    handlingInformation: state.handlingInformation.trim(),
    masterDocumentNo: masterDocumentNo.trim(),
    incoterms: state.incoterms ?? '',
    declaredValueCarriage: state.declaredValueCarriage.trim(),
    declaredValueCustoms: state.declaredValueCustoms.trim(),
    issuerName: state.issuerName.trim(),
    signerCapacity: state.signerCapacity,
    preCarriageBy: state.preCarriageBy.trim(),
    finalDestination: state.finalDestination.trim() || state.placeOfDelivery.trim() || state.dischargePort.trim(),
    flag: '',
    revenueTons: state.revenueTons.trim(),
    freightRate: state.freightRate.trim(),
    freightPer: state.freightPer.trim(),
    freightPrepaidAt: state.freightPrepaidAt.trim(),
    freightPayableAt: state.freightPayableAt.trim(),
    totalPrepaid: state.totalPrepaid.trim(),
    collectAmount: state.collectAmount.trim(),
    items: state.cargoItems.map((item) => ({
      descriptionOfGoods: item.descriptionOfGoods.trim(),
      numberOfPackages: item.numberOfPackages,
      kindOfPackages: item.kindOfPackages.trim(),
      grossWeightKg: item.grossWeightKg,
      // 항공은 용적 대신 부피중량을 쓰지만, 화주가 넣은 용적값은 참고로 남긴다.
      measurementCbm: item.measurementCbm.trim(),
      marksAndNumbers: item.marksAndNumbers.trim(),
    })),
    cargoTotals: { ...state.cargoTotals },
  };
}

/** 문서 목록·파일명에 쓰는 이름 — 운송 방식에 따라 갈린다. */
export function transportDocumentLabel(mode: 'SEA' | 'AIR' | undefined): string {
  return mode === 'AIR' ? '항공화물운송장(AWB)' : '선하증권(B/L)';
}
