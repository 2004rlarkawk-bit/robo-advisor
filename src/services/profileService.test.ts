import { describe, expect, it } from 'vitest';
import { isUserProfileComplete, userProfileToTradeDefaults, type UserProfile } from './profileService';

const profile: UserProfile = {
  id: 'user-1', email: 'member@example.com', role: 'user', company_name: '인천테크',
  business_number: '123-45-67890', contact_name: '김지민', phone: '010-1234-5678',
  country: '대한민국', industry: 'manufacturing', trade_purpose: 'import',
  default_load_port: 'INCHEON, KOREA', default_discharge_port: 'SHANGHAI, CHINA', default_incoterm: 'CIF',
};

describe('user_profiles 온보딩 판정', () => {
  it('회사명, 사용 목적, 업종이 있으면 완료 상태다', () => expect(isUserProfileComplete(profile)).toBe(true));
  it('필수 값 하나가 공백이면 온보딩 대상이다', () => expect(isUserProfileComplete({ ...profile, industry: '  ' })).toBe(false));
});

describe('거래 프로필 기본값 변환', () => {
  it('user_profiles를 새 거래의 TradeProfile 기본값으로 변환한다', () => {
    // 기본 항구는 수출 방향 기준 저장이므로, 수입 거래면 선적항·도착항이 반전된다
    expect(userProfileToTradeDefaults(profile)).toMatchObject({
      tradeType: 'import', companyName: '인천테크', contact: '010-1234-5678',
      loadPort: 'SHANGHAI, CHINA', dischargePort: 'INCHEON, KOREA', incoterms: 'CIF',
      businessRegistrationNo: '123-45-67890', contactName: '김지민', signedBy: '김지민',
    });
  });

  it('수출 거래면 기본 항구를 그대로 사용한다', () => {
    expect(userProfileToTradeDefaults({ ...profile, trade_purpose: 'export' })).toMatchObject({
      tradeType: 'export', loadPort: 'INCHEON, KOREA', dischargePort: 'SHANGHAI, CHINA',
    });
  });

  it('지원하지 않는 Incoterm은 빈 값으로 안전하게 처리한다', () => {
    expect(userProfileToTradeDefaults({ ...profile, default_incoterm: 'INVALID' }).incoterms).toBe('');
  });
});
