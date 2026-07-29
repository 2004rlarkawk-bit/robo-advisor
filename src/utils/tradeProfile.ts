import type { ShipperItem, TradeProfile } from '../types';

type LegacyShipperItem = ShipperItem & {
  englishDescription?: unknown;
  englishDescriptionManuallyEdited?: unknown;
};

type LegacyTradeProfile = Omit<TradeProfile, 'shipperItems'> & {
  industry?: unknown;
  tradePurpose?: unknown;
  trade_purpose?: unknown;
  shipperItems?: LegacyShipperItem[];
};

/**
 * 삭제된 키를 신규 저장값에서 제외하고 수출 화주의 과거 품목 JSON을 단일 itemName 구조로 승격합니다.
 * 과거 데이터는 englishDescription이 있으면 우선하고, 없으면 기존 itemName을 보존합니다.
 */
export function sanitizeTradeProfile(profile: TradeProfile): TradeProfile {
  const {
    industry: _industry,
    tradePurpose: _tradePurpose,
    trade_purpose: _tradePurposeSnakeCase,
    shipperItems: legacyShipperItems,
    ...cleanProfile
  } = profile as LegacyTradeProfile;

  if (!Array.isArray(legacyShipperItems)) {
    return cleanProfile as TradeProfile;
  }

  const shipperItems = legacyShipperItems.map((legacyItem) => {
    const {
      englishDescription,
      englishDescriptionManuallyEdited: _englishDescriptionManuallyEdited,
      ...item
    } = legacyItem;
    const preferredEnglishName =
      typeof englishDescription === 'string' ? englishDescription.trim() : '';
    const existingItemName =
      typeof item.itemName === 'string' ? item.itemName : '';
    return {
      ...item,
      itemName: preferredEnglishName || existingItemName,
    };
  });

  return {
    ...cleanProfile,
    itemName: shipperItems[0]?.itemName || cleanProfile.itemName,
    shipperItems,
  } as TradeProfile;
}
