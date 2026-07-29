import type {
  BookingStatus,
  ContainerSize,
  ForwarderLoadingMode,
  NumericInput,
  TradeProfile,
} from '../types';

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
  | 'notifyPartyName'
  | 'containerNo'
  | 'sealNo'
  | 'itemName'
  | 'packageCount'
  | 'packageType'
  | 'grossWeight'
  | 'measurement'
>>;

export interface ForwarderFormState extends ForwarderTradeFields {
  exportDeclarationNo: string;
  bookingNo: string;
  bookingStatus: BookingStatus;
  loadingMode: ForwarderLoadingMode;
  containerSize: ContainerSize;
  containerQuantity: NumericInput;
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
    bookingNo: '',
    bookingStatus: 'requested',
    notifyPartyName: '',
    loadingMode: 'FCL',
    containerSize: '20GP',
    containerQuantity: '',
    containerNo: '',
    sealNo: '',
    itemName: '',
    packageCount: '',
    packageType: '',
    grossWeight: '',
    measurement: '',
  };
}

export function isBookingNumberRequired(state: ForwarderFormState): boolean {
  return state.bookingStatus === 'confirmed' && state.bookingNo.trim().length === 0;
}

export function isEtaBeforeEtd(etd: string, eta: string): boolean {
  return Boolean(etd && eta && eta < etd);
}

export function forwarderFormToTradeProfile(state: ForwarderFormState): TradeProfile {
  return {
    tradeType: 'export',
    itemName: state.itemName,
    hsCode: '',
    loadPort: state.loadPort,
    dischargePort: state.dischargePort,
    incoterms: '',
    quantity: '',
    weight: state.grossWeight,
    departureDate: state.departureDate,
    arrivalDate: state.arrivalDate,
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
    packageCount: state.packageCount,
    packageType: state.packageType,
    grossWeight: state.grossWeight,
    measurement: state.measurement,
    exportDeclarationNo: state.exportDeclarationNo,
    bookingNo: state.bookingNo,
    bookingStatus: state.bookingStatus,
    loadingMode: state.loadingMode,
    containerSize: state.containerSize,
    containerQuantity: state.containerQuantity,
  };
}

export function tradeProfileToForwarderFormState(profile: TradeProfile): ForwarderFormState {
  return {
    ...createEmptyForwarderFormState(),
    companyName: profile.companyName,
    companyAddress: profile.companyAddress ?? '',
    partnerName: profile.partnerName ?? '',
    partnerAddress: profile.partnerAddress ?? '',
    carrier: profile.carrier ?? '',
    vesselOrFlight: profile.vesselOrFlight ?? '',
    voyageNo: profile.voyageNo ?? '',
    loadPort: profile.loadPort,
    dischargePort: profile.dischargePort,
    departureDate: profile.departureDate,
    arrivalDate: profile.arrivalDate,
    notifyPartyName: profile.notifyPartyName ?? '',
    containerNo: profile.containerNo ?? '',
    sealNo: profile.sealNo ?? '',
    itemName: profile.itemName,
    packageCount: profile.packageCount ?? '',
    packageType: profile.packageType ?? '',
    grossWeight: profile.grossWeight ?? profile.weight,
    measurement: profile.measurement ?? '',
    exportDeclarationNo: profile.exportDeclarationNo ?? '',
    bookingNo: profile.bookingNo ?? '',
    bookingStatus: profile.bookingStatus ?? 'requested',
    loadingMode: profile.loadingMode ?? 'FCL',
    containerSize: profile.containerSize ?? '20GP',
    containerQuantity: profile.containerQuantity ?? '',
  };
}
