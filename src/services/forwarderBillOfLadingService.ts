import type { BillOfLadingData } from '../types';
import type { ForwarderFormState } from '../utils/forwarderForm';

export interface ForwarderBillOfLadingValidation {
  valid: boolean;
  missingLabels: string[];
}

export function validateForwarderBillOfLading(
  state: ForwarderFormState,
): ForwarderBillOfLadingValidation {
  const missingLabels: string[] = [];
  const hasDescription = state.cargoItems.some((item) => item.descriptionOfGoods.trim());
  const required: Array<[string, string]> = [
    [state.companyName, 'Shipper'],
    [state.partnerName, 'Consignee'],
    [hasDescription ? 'present' : '', 'Description of Goods'],
    [state.carrier, 'Carrier'],
    [state.vesselOrFlight, 'Vessel'],
    [state.voyageNo, 'Voyage No.'],
    [state.loadPort, 'POL'],
    [state.dischargePort, 'POD'],
  ];
  required.forEach(([value, label]) => {
    if (!value.trim()) missingLabels.push(label);
  });
  return { valid: missingLabels.length === 0, missingLabels };
}

export function createForwarderBillOfLadingDraft(
  state: ForwarderFormState,
  tradeId: string,
  generatedAt = new Date().toISOString(),
): BillOfLadingData {
  const notifyParty = state.notifyPartyName.trim()
    ? { name: state.notifyPartyName.trim(), address: '', contact: '' }
    : undefined;

  return {
    draftNo: `BL-DRAFT-${tradeId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    generatedAt,
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
    loadPort: state.loadPort.trim(),
    dischargePort: state.dischargePort.trim(),
    etd: state.departureDate,
    eta: state.arrivalDate,
    loadingMode: state.loadingMode,
    containerNo: state.containerNo.trim(),
    sealNo: state.sealNo.trim(),
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
