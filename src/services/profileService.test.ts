import { describe, expect, it } from 'vitest';
import {
  isUserProfileComplete,
  normalizeUserProfile,
  userProfileToTradeDefaults,
  type UserProfile,
} from './profileService';

const profile: UserProfile = {
  id: 'user-1', email: 'member@example.com', role: 'user', company_name: '인천테크',
  company_address: null,
  business_number: '123-45-67890', customs_clearance_code: 'P123456789012', contact_name: '김지민', phone: '010-1234-5678',
  country: '대한민국',
  default_load_port: '인천항', default_discharge_port: '상하이항', default_incoterm: 'CIF',
  service_role: 'integrated',
};

describe('user_profiles 회원 서비스 역할', () => {
  it('service_role이 없는 기존 회원은 integrated로 처리한다', () => {
    const { service_role: _serviceRole, ...legacyProfile } = profile;
    expect(normalizeUserProfile(legacyProfile).service_role).toBe('integrated');
  });

  it('service_role이 null인 회원은 integrated로 처리한다', () => {
    expect(normalizeUserProfile({ ...profile, service_role: null }).service_role).toBe('integrated');
  });

  it('저장된 service_role은 그대로 유지한다', () => {
    expect(normalizeUserProfile({ ...profile, service_role: 'forwarder' }).service_role).toBe('forwarder');
  });
});

describe('user_profiles 온보딩 판정', () => {
  it('회사명이 있으면 삭제된 업무설정 값 없이도 완료 상태다', () => expect(isUserProfileComplete(profile)).toBe(true));
  it('회사명이 공백이면 온보딩 대상이다', () => expect(isUserProfileComplete({ ...profile, company_name: '  ' })).toBe(false));
});

describe('거래 프로필 기본값 변환', () => {
  it('user_profiles를 새 거래의 TradeProfile 기본값으로 변환한다', () => {
    expect(userProfileToTradeDefaults(profile)).toMatchObject({
      companyName: '인천테크', contact: '010-1234-5678',
      loadPort: 'Incheon Port', dischargePort: 'Shanghai Port', incoterms: 'CIF',
      businessRegistrationNo: '123-45-67890', contactName: '김지민', signedBy: '김지민',
    });
    expect(userProfileToTradeDefaults(profile)).not.toHaveProperty('tradeType');
  });

  it('지원하지 않는 Incoterm은 빈 값으로 안전하게 처리한다', () => {
    expect(userProfileToTradeDefaults({ ...profile, default_incoterm: 'INVALID' }).incoterms).toBe('');
  });
});
