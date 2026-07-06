export type TradeType = 'export' | 'import';

export type Incoterms =
  | ''
  | 'FOB'
  | 'CIF'
  | 'EXW'
  | 'DDP'
  | 'DAP'
  | 'FCA';

export interface TradeProfile {
  // 1. 기본 거래 / 문서 정보
  tradeType: TradeType;
  documentNo: string;
  invoiceNo: string;
  invoiceDate: string;
  referenceNo: string;

  // 선하증권 Bill of Lading 정보
  blNo: string;
  issuePlace: string;
  issueDate: string;

  // 2. 상품 정보
  itemName: string;
  hsCode: string;
  countryOfOrigin: string;
  quantity: number | '';
  unit: string;

  // 3. 가격 / 금액 정보
  currency: string;
  unitPrice: number | '';
  totalAmount: number | '';

  // 기존 App.tsx에서 이미 사용 중인 필드
  invoiceAmount: number | '';

  // 4. 포장 / 중량 / 부피 정보
  packageCount: number | '';
  packageType: string;
  netWeight: number | '';
  grossWeight: number | '';
  weight: number | '';
  measurement: string;
  shippingMarks: string;

  // 5. 운송 정보
  loadPort: string;
  dischargePort: string;
  departureDate: string;
  arrivalDate: string;
  vesselOrFlight: string;
  carrier: string;

  // 선하증권에 필요한 운송 세부 정보
  placeOfReceipt: string;
  placeOfDelivery: string;
  finalDestination: string;
  voyageNo: string;
  flag: string;

  // 6. 컨테이너 정보
  containerNo: string;
  sealNo: string;

  // 7. 거래 조건 / 운임 정보
  incoterms: Incoterms;
  paymentTerms: string;
  reasonForExport: string;
  freightTerms: string;
  freightCharges: string;
  freightPrepaidAt: string;
  freightPayableAt: string;

  // 8. 수출자 / 판매자 / Shipper 정보
  companyName: string;
  companyAddress: string;
  companyCountry: string;
  contact: string;
  taxNo: string;

  // 기존 App.tsx에서 이미 사용 중인 필드
  businessRegistrationNo: string;

  // 9. 수입자 / 수하인 / Consignee 정보
  partnerName: string;
  partnerAddress: string;
  partnerCountry: string;
  partnerContact: string;

  // 10. 구매자 / Bill To 정보
  buyerName: string;
  buyerAddress: string;
  buyerCountry: string;

  // 11. Notify Party 정보
  notifyPartyName: string;
  notifyPartyAddress: string;
  notifyPartyContact: string;

  // 12. 서명 정보
  signedBy: string;
  signerName: string;
  signerPosition: string;
}
