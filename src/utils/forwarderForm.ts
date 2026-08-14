import type {
  BookingStatus,
  ContainerSize,
  ForwarderCargoItem,
  ForwarderCargoTotals,
  ForwarderLoadingMode,
  NumericInput,
  TradeProfile,
} from '../types';
import { normalizeExportPortValue } from '../constants/ports';
import { normalizePackageTypeValue } from './tradeValueNormalization';

type ForwarderTradeFields = Required<Pick<
  TradeProfile,
  | 'companyName'
  | 'companyAddress'
  | 'partnerName'
  | 'partnerAddress'
  | 'carrier'
  | 'vesselOrFlight'
  | 'voyageNo'
  | 'loadPort'
  | 'dischargePort'
  | 'departureDate'
  | 'arrivalDate'
  | 'requestedDepartureDate'
  | 'notifyPartyName'
  | 'containerNo'
  | 'sealNo'
  | 'itemName'
  | 'packageCount'
  | 'packageType'
  | 'grossWeight'
  | 'measurement'
  | 'invoiceNo'
  | 'incoterms'
  | 'shippingMarks'
>>;

export interface ForwarderFormState extends ForwarderTradeFields {
  exportDeclarationNo: string;
  bookingNo: string;
  bookingStatus: BookingStatus;
  loadingMode: ForwarderLoadingMode | '';
  containerSize: ContainerSize;
  containerQuantity: NumericInput;
  cargoItems: ForwarderCargoItem[];
  cargoTotals: ForwarderCargoTotals;
}

export function createEmptyForwarderCargoItem(id = 'cargo-1'): ForwarderCargoItem {
  return {
    id,
    itemNo: '',
    sku: '',
    descriptionOfGoods: '',
    numberOfPackages: '',
    kindOfPackages: '',
    grossWeightKg: '',
    measurementCbm: '',
    marksAndNumbers: '',
    sourceDocumentIds: [],
  };
}

function cargoItemFromLegacy(profile: TradeProfile): ForwarderCargoItem {
  return {
    ...createEmptyForwarderCargoItem(),
    descriptionOfGoods: profile.itemName,
    numberOfPackages: profile.packageCount ?? '',
    kindOfPackages: normalizePackageTypeValue(profile.packageType),
    grossWeightKg: profile.grossWeight ?? profile.weight,
    measurementCbm: profile.measurement ?? '',
    marksAndNumbers: profile.shippingMarks ?? '',
  };
}

export function createEmptyForwarderFormState(): ForwarderFormState {
  return {
    companyName: '',
    companyAddress: '',
    partnerName: '',
    partnerAddress: '',
    exportDeclarationNo: '',
    carrier: '',
    vesselOrFlight: '',
    voyageNo: '',
    loadPort: '',
    dischargePort: '',
    departureDate: '',
    arrivalDate: '',
    requestedDepartureDate: '',
    bookingNo: '',
    bookingStatus: 'requested',
    notifyPartyName: '',
    loadingMode: '',
    containerSize: '20GP',
    containerQuantity: '',
    containerNo: '',
    sealNo: '',
    itemName: '',
    packageCount: '',
    packageType: '',
    grossWeight: '',
    measurement: '',
    invoiceNo: '',
    incoterms: '',
    shippingMarks: '',
    cargoItems: [createEmptyForwarderCargoItem()],
    cargoTotals: { numberOfPackages: '', grossWeightKg: '', measurementCbm: '' },
  };
}

export function isEtaBeforeEtd(etd: string, eta: string): boolean {
  return Boolean(etd && eta && eta < etd);
}

export function forwarderFormToTradeProfile(state: ForwarderFormState): TradeProfile {
  const hasArrayCargo = state.cargoItems.some((item) =>
    item.descriptionOfGoods || item.numberOfPackages !== '' || item.kindOfPackages
    || item.grossWeightKg !== '' || item.measurementCbm || item.marksAndNumbers);
  const cargoItems = hasArrayCargo ? state.cargoItems : [{
    ...createEmptyForwarderCargoItem(),
    descriptionOfGoods: state.itemName,
    numberOfPackages: state.packageCount,
    kindOfPackages: normalizePackageTypeValue(state.packageType),
    grossWeightKg: state.grossWeight,
    measurementCbm: state.measurement,
    marksAndNumbers: state.shippingMarks,
  }];
  const firstCargo = cargoItems[0];
  return {
    tradeType: 'export',
    itemName: firstCargo.descriptionOfGoods || state.itemName,
    hsCode: '',
    loadPort: state.loadPort,
    dischargePort: state.dischargePort,
    incoterms: state.incoterms as TradeProfile['incoterms'],
    quantity: '',
    weight: firstCargo.grossWeightKg || state.grossWeight,
    departureDate: state.departureDate,
    arrivalDate: state.arrivalDate,
    requestedDepartureDate: state.requestedDepartureDate,
    companyName: state.companyName,
    companyAddress: state.companyAddress,
    contact: '',
    partnerName: state.partnerName,
    partnerAddress: state.partnerAddress,
    carrier: state.carrier,
    vesselOrFlight: state.vesselOrFlight,
    voyageNo: state.voyageNo,
    notifyPartyName: state.notifyPartyName,
    containerNo: state.containerNo,
    sealNo: state.sealNo,
    packageCount: firstCargo.numberOfPackages || state.packageCount,
    packageType: firstCargo.kindOfPackages || state.packageType,
    grossWeight: firstCargo.grossWeightKg || state.grossWeight,
    measurement: firstCargo.measurementCbm || state.measurement,
    invoiceNo: state.invoiceNo,
    shippingMarks: firstCargo.marksAndNumbers || state.shippingMarks,
    forwarderCargoItems: cargoItems.map((item) => ({
      ...item,
      kindOfPackages: normalizePackageTypeValue(item.kindOfPackages),
    })),
    forwarderCargoTotals: state.cargoTotals,
    exportDeclarationNo: state.exportDeclarationNo,
    bookingNo: state.bookingNo,
    bookingStatus: state.bookingNo.trim() ? 'confirmed' : 'requested',
    loadingMode: state.loadingMode || undefined,
    containerSize: state.containerSize,
    containerQuantity: state.containerQuantity,
  };
}

export function tradeProfileToForwarderFormState(profile: TradeProfile): ForwarderFormState {
  const cargoItems = profile.forwarderCargoItems?.length
    ? profile.forwarderCargoItems.map((item, index) => ({
      ...createEmptyForwarderCargoItem(item.id || `cargo-${index + 1}`),
      ...item,
      kindOfPackages: normalizePackageTypeValue(item.kindOfPackages),
      sourceDocumentIds: Array.isArray(item.sourceDocumentIds) ? item.sourceDocumentIds : [],
    }))
    : [cargoItemFromLegacy(profile)];
  const firstCargo = cargoItems[0];
  return {
    ...createEmptyForwarderFormState(),
    companyName: profile.companyName,
    companyAddress: profile.companyAddress ?? '',
    partnerName: profile.partnerName ?? '',
    partnerAddress: profile.partnerAddress ?? '',
    carrier: profile.carrier ?? '',
    vesselOrFlight: profile.vesselOrFlight ?? '',
    voyageNo: profile.voyageNo ?? '',
    loadPort: normalizeExportPortValue(profile.loadPort),
    dischargePort: normalizeExportPortValue(profile.dischargePort),
    departureDate: profile.departureDate,
    arrivalDate: profile.arrivalDate,
    requestedDepartureDate: profile.requestedDepartureDate ?? '',
    notifyPartyName: profile.notifyPartyName ?? '',
    containerNo: profile.containerNo ?? '',
    sealNo: profile.sealNo ?? '',
    itemName: firstCargo.descriptionOfGoods,
    packageCount: firstCargo.numberOfPackages,
    packageType: firstCargo.kindOfPackages,
    grossWeight: firstCargo.grossWeightKg,
    measurement: firstCargo.measurementCbm,
    invoiceNo: profile.invoiceNo ?? '',
    incoterms: profile.incoterms ?? '',
    shippingMarks: firstCargo.marksAndNumbers,
    exportDeclarationNo: profile.exportDeclarationNo ?? '',
    bookingNo: profile.bookingNo ?? '',
    bookingStatus: profile.bookingNo ? 'confirmed' : (profile.bookingStatus ?? 'requested'),
    loadingMode: profile.loadingMode
      ?? (profile.containerNo || profile.sealNo || profile.containerQuantity ? 'FCL' : ''),
    containerSize: profile.containerSize ?? '20GP',
    containerQuantity: profile.containerQuantity ?? '',
    cargoItems,
    cargoTotals: profile.forwarderCargoTotals ?? {
      numberOfPackages: profile.forwarderCargoItems?.length ? '' : profile.packageCount ?? '',
      grossWeightKg: profile.forwarderCargoItems?.length ? '' : profile.grossWeight ?? profile.weight,
      measurementCbm: profile.forwarderCargoItems?.length ? '' : profile.measurement ?? '',
    },
  };
}
