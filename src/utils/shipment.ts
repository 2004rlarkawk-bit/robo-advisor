import type { Shipment, TradeItem, TradeProfile } from '../types';
import type { ShipperItem } from '../types';

/** amount는 저장하지 않고 계산: 추출값 우선, 없으면 수량×단가. */
export function tradeItemAmount(it: TradeItem): number {
  if (it.extractedAmount !== undefined && it.extractedAmount !== null) return Number(it.extractedAmount) || 0;
  return (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
}

/**
 * 화주 입력 품목(ShipperItem) → canonical TradeItem.
 * ShipperItem은 상거래 필드(품명·HS·수량·단가)만 가진다. 물류필드(순/총중량·용적·포장)는
 * 입력 경로가 아직 없으므로 공란(0/'')으로 둔다 — 첫 품목·문서레벨 값으로 채우지 않는다.
 */
/**
 * 기본 품명 + 상세 정보 → 상업송장용 상세 품명.
 * 실무상 C/I는 색상·재질까지 적고, P/L·B/L은 기본 품명만 적는다.
 * (예: "Ballpoint Pen" + "Blue Ink" → "Ballpoint Pen, Blue Ink")
 */
export function composeDetailedDescription(itemName: string, detail?: string): string {
  const base = (itemName || '').trim();
  const extra = (detail || '').trim().replace(/^[,\s]+|[,\s]+$/g, '');
  if (!extra) return base;
  if (!base) return extra;
  // 이미 상세 정보가 품명에 포함돼 있으면 중복해서 붙이지 않는다.
  if (base.toLowerCase().includes(extra.toLowerCase())) return base;
  return `${base}, ${extra}`;
}

export function shipperItemToTradeItem(si: ShipperItem): TradeItem {
  return {
    description: si.itemName || '',
    detailedDescription: composeDetailedDescription(si.itemName, si.detail),
    detail: (si.detail || '').trim() || undefined,
    hsCode: si.hsCode || '',
    quantity: Number(si.quantity) || 0,
    unit: si.unit || '',
    unitPrice: Number(si.unitPrice) || 0,
    extractedAmount: undefined,
    // 물류필드 — 공란 유지(검증이 미입력을 잡는다).
    netWeight: 0,
    grossWeight: 0,
    measurement: '',
    packageCount: 0,
    packageUnit: '',
    shippingMarks: undefined,
  };
}

/** 품목들의 통화가 서로 다른지(혼합) 판정. */
export function hasMixedCurrency(items: ShipperItem[]): boolean {
  const set = new Set(items.map((i) => i.currency));
  return set.size > 1;
}

/**
 * 문서레벨 프로필 + 화주 품목 → Shipment.
 * 통화는 Shipment 레벨 단일 — 품목 통화가 일치하면 그 값을, 아니면 profile.currency를 유지한다
 * (혼합 통화 자체는 상위(검증/생성 게이트)에서 error로 막는다).
 */
export function buildShipment(profile: TradeProfile, shipperItems: ShipperItem[]): Shipment {
  const items = shipperItems.map(shipperItemToTradeItem);
  const currencies = new Set(shipperItems.map((i) => i.currency));
  const resolvedCurrency = currencies.size === 1 ? [...currencies][0] : profile.currency;
  return {
    profile: { ...profile, currency: resolvedCurrency },
    items,
  };
}
