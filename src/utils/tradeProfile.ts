import type { TradeProfile } from '../types';

type LegacyTradeProfile = TradeProfile & {
  industry?: unknown;
  tradePurpose?: unknown;
  trade_purpose?: unknown;
};

/** 삭제된 회원 업무설정 키가 기존 거래/초안 JSON에 남아 있어도 런타임 상태와 신규 저장값에서 제외합니다. */
export function sanitizeTradeProfile(profile: TradeProfile): TradeProfile {
  const {
    industry: _industry,
    tradePurpose: _tradePurpose,
    trade_purpose: _tradePurposeSnakeCase,
    ...cleanProfile
  } = profile as LegacyTradeProfile;
  return cleanProfile as TradeProfile;
}
