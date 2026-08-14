import type { NumericInput, ShipperCurrency, ShipperItem, ShipperItemUnit, ShipperSupplementalState, TradeProfile } from '../types';

export const SHIPPER_ITEM_UNIT_OPTIONS: { value: ShipperItemUnit; label: string }[] = [
  { value: 'PCS', label: 'PCS (개)' },
  { value: 'EA', label: 'EA (개)' },
  { value: 'SET', label: 'SET (세트)' },
  { value: 'PAIR', label: 'PAIR (켤레)' },
  { value: 'BOX', label: 'BOX (박스)' },
  { value: 'CTN', label: 'CTN (카톤)' },
  { value: 'KG', label: 'KG (킬로그램)' },
  { value: 'G', label: 'G (그램)' },
  { value: 'TON', label: 'TON (톤)' },
  { value: 'M', label: 'M (미터)' },
  { value: 'M2', label: 'M² (제곱미터)' },
  { value: 'M3', label: 'M³ (세제곱미터)' },
  { value: 'L', label: 'L (리터)' },
  { value: 'ROLL', label: 'ROLL (롤)' },
];
export const SHIPPER_ITEM_UNITS: ShipperItemUnit[] = SHIPPER_ITEM_UNIT_OPTIONS.map(({ value }) => value);
export const SHIPPER_CURRENCIES: ShipperCurrency[] = ['USD', 'EUR', 'JPY', 'CNY', 'KRW', 'GBP'];
export const SHIPPER_PACKAGE_TYPE_OPTIONS = [
  { value: 'CARTON', label: 'Carton (카톤/상자)', aliases: ['CTN', 'CTNS', 'CARTONS'] },
  { value: 'BOX', label: 'Box (박스)', aliases: ['BOXES'] },
  { value: 'PALLET', label: 'Pallet (팔레트)', aliases: ['PALLETS'] },
  { value: 'CRATE', label: 'Crate (목상자)', aliases: ['CRATES'] },
  { value: 'BAG', label: 'Bag (포대)', aliases: ['BAGS'] },
  { value: 'DRUM', label: 'Drum (드럼통)', aliases: ['DRUMS'] },
  { value: 'BUNDLE', label: 'Bundle (묶음)', aliases: ['BUNDLES'] },
  { value: 'ROLL', label: 'Roll (롤)', aliases: ['ROLLS'] },
  { value: 'CASE', label: 'Case (케이스)', aliases: ['CASES'] },
  { value: 'PIECE', label: 'Piece (개별포장)', aliases: ['PIECES'] },
] as const;

export function getShipperPackageTypeOptionValue(value?: string): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  const option = SHIPPER_PACKAGE_TYPE_OPTIONS.find(({ value: optionValue, aliases }) =>
    optionValue === normalized || (aliases as readonly string[]).includes(normalized)
  );
  return option?.value ?? null;
}
export const EMPTY_GOODS_DESCRIPTION_MESSAGE = '영문 품명 Goods Description을 입력해주세요.';
export const NON_ENGLISH_GOODS_DESCRIPTION_MESSAGE = '상업송장과 포장명세서에 표시할 영문 품명을 입력해주세요.';

export const EMPTY_SHIPPER_SUPPLEMENTAL_STATE: ShipperSupplementalState = {
  buyerMatchesConsignee: false,
  consigneeMatchesNotifyParty: false,
  incotermsPlace: '',
  originCriterion: '',
  isSignerSameAsCompany: false,
  signerNameBeforeCompany: '',
  hasNoShippingMarks: false,
  shippingMarksBeforeNoMarks: '',
};

function toNumericInput(value: TradeProfile['quantity'] | undefined): NumericInput {
  return value === '' || value === undefined ? '' : Number(value);
}

function toItemUnit(value?: string): string {
  return value?.trim() || 'EA';
}

function toCurrency(value?: string): ShipperCurrency {
  return SHIPPER_CURRENCIES.includes(value as ShipperCurrency) ? value as ShipperCurrency : 'KRW';
}

export function tradeProfileToPrimaryShipperItem(profile: TradeProfile): ShipperItem {
  return {
    id: 'primary-item',
    itemName: profile.itemName,
    hsCode: profile.hsCode,
    quantity: toNumericInput(profile.quantity),
    unit: toItemUnit(profile.unit),
    unitPrice: toNumericInput(profile.unitPrice),
    currency: toCurrency(profile.currency),
  };
}

export function createEmptyShipperItem(id: string): ShipperItem {
  return {
    id,
    itemName: '',
    hsCode: '',
    quantity: '',
    unit: 'EA',
    unitPrice: '',
    currency: 'KRW',
  };
}

export function calculateShipperItemAmount(item: ShipperItem): number {
  return (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
}

export function isGrossWeightBelowNet(grossWeight: NumericInput | undefined, netWeight: NumericInput | undefined): boolean {
  return Number(grossWeight) > 0 && Number(netWeight) > 0 && Number(grossWeight) < Number(netWeight);
}

export function summarizeShipperItems(items: ShipperItem[]): {
  mixedCurrencies: boolean;
  currency: ShipperCurrency | null;
  total: number | null;
} {
  const currencies = new Set(items.map((item) => item.currency));
  if (currencies.size !== 1) return { mixedCurrencies: true, currency: null, total: null };
  return {
    mixedCurrencies: false,
    currency: items[0]?.currency ?? null,
    total: items.reduce((sum, item) => sum + calculateShipperItemAmount(item), 0),
  };
}

export function primaryShipperItemToTradeProfile(item: ShipperItem): Partial<TradeProfile> {
  const amount = calculateShipperItemAmount(item);
  return {
    itemName: item.itemName,
    hsCode: item.hsCode,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    currency: item.currency,
    totalAmount: amount,
    invoiceAmount: amount,
  };
}

export function getGoodsDescriptionValidationMessage(items: ShipperItem[]): string | null {
  if (items.some((item) => !item.itemName.trim())) {
    return EMPTY_GOODS_DESCRIPTION_MESSAGE;
  }
  if (items.some((item) => /[가-힣]/.test(item.itemName))) {
    return NON_ENGLISH_GOODS_DESCRIPTION_MESSAGE;
  }
  return null;
}
