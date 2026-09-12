import type { BillOfLadingData } from '../types';
import type { ForwarderFormState } from '../utils/forwarderForm';

export interface ForwarderBillOfLadingValidation {
  valid: boolean;
  /** 없으면 발행 불가한 항목 — 선하증권 법정 기재사항 기준 */
  missingLabels: string[];
  /** 발행은 되지만 실무상 확인이 필요한 항목 */
  warningLabels: string[];
}

export function validateForwarderBillOfLading(
  state: ForwarderFormState,
): ForwarderBillOfLadingValidation {
  const missingLabels: string[] = [];
  const warningLabels: string[] = [];
  const hasDescription = state.cargoItems.some((item) => item.descriptionOfGoods.trim());
  const hasWeight = state.cargoItems.some((item) => String(item.grossWeightKg).trim())
    || String(state.cargoTotals.grossWeightKg).trim();
  const hasPackages = state.cargoItems.some((item) => String(item.numberOfPackages).trim())
    || String(state.cargoTotals.numberOfPackages).trim();

  // 상법상 선하증권 법정 기재사항(선박명·화물 종류/중량/포장수·송하인·수하인·선적항·양륙항·운임·발행지/일자·발행자)
  const required: Array<[string, string]> = [
    [state.companyName, 'Shipper'],
    [state.partnerName, 'Consignee'],
    [hasDescription ? 'present' : '', 'Description of Goods'],
    [hasPackages ? 'present' : '', 'No. & Kind of Packages'],
    [hasWeight ? 'present' : '', 'Gross Weight'],
    [state.carrier, 'Carrier'],
    [state.vesselOrFlight, 'Vessel'],
    [state.voyageNo, 'Voyage No.'],
    [state.loadPort, 'POL'],
    [state.dischargePort, 'POD'],
    [state.freightTerms, 'Freight Terms (운임)'],
    [state.placeOfIssue, 'Place of Issue (발행지)'],
    [state.dateOfIssue, 'Date of Issue (발행일자)'],
    [state.issuerName, 'Issued by (발행자)'],
  ];
  required.forEach(([value, label]) => {
    if (!String(value ?? '').trim()) missingLabels.push(label);
  });

  if (Number(state.numberOfOriginals) <= 0) missingLabels.push('No. of Original B/L (발행 통수)');

  // 경고 — 발행은 가능하나 실무상 확인 필요
  if (!state.shippedOnBoardDate.trim()) {
    warningLabels.push('Shipped on Board 일자 — 미기재 시 수취선하증권(Received B/L)으로 발행됩니다. L/C 결제 건은 통상 본선적재 표기가 필요합니다.');
  }
  if (state.loadingMode === 'FCL' && !state.containerNo.trim()) {
    warningLabels.push('Container No. — FCL 건은 컨테이너 번호 기재가 필요합니다.');
  }

  return { valid: missingLabels.length === 0, missingLabels, warningLabels };
}

export function createForwarderBillOfLadingDraft(
  state: ForwarderFormState,
  tradeId: string,
  generatedAt = new Date().toISOString(),
): BillOfLadingData {
  const notifyParty = state.notifyPartyName.trim()
    ? { name: state.notifyPartyName.trim(), address: '', contact: '' }
    : undefined;

  const issueDate = state.dateOfIssue || generatedAt.slice(0, 10);

  return {
    draftNo: `BL-DRAFT-${tradeId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    generatedAt,
    kind: state.blKind,
    blNo: state.blNo.trim(),
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
    vessel: state.vesselOrFlight.trim(),
    voyageNo: state.voyageNo.trim(),
    // 인수지·인도지를 따로 적지 않았으면 해상 구간(POL/POD)과 동일한 것으로 본다.
    placeOfReceipt: state.placeOfReceipt.trim() || state.loadPort.trim(),
    loadPort: state.loadPort.trim(),
    dischargePort: state.dischargePort.trim(),
    placeOfDelivery: state.placeOfDelivery.trim() || state.dischargePort.trim(),
    etd: state.departureDate,
    eta: state.arrivalDate,
    loadingMode: state.loadingMode,
    containerNo: state.containerNo.trim(),
    sealNo: state.sealNo.trim(),
    freightTerms: state.freightTerms,
    freightAndCharges: state.freightAndCharges.trim(),
    numberOfOriginals: Number(state.numberOfOriginals) || 3,
    placeOfIssue: state.placeOfIssue.trim(),
    dateOfIssue: issueDate,
    shippedOnBoardDate: state.shippedOnBoardDate,
    issuerName: state.issuerName.trim(),
    signerCapacity: state.signerCapacity,
    items: state.cargoItems.map((item) => ({
      descriptionOfGoods: item.descriptionOfGoods.trim(),
      numberOfPackages: item.numberOfPackages,
      kindOfPackages: item.kindOfPackages.trim(),
      grossWeightKg: item.grossWeightKg,
      measurementCbm: item.measurementCbm.trim(),
      marksAndNumbers: item.marksAndNumbers.trim(),
    })),
    cargoTotals: { ...state.cargoTotals },
  };
}
