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
