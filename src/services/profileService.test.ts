import { describe, expect, it } from 'vitest';
import {
  isUserProfileComplete,
  normalizeUserProfile,
  userProfileToTradeDefaults,
  type UserProfile,
} from './profileService';

const profile: UserProfile = {
  id: 'user-1',
  email: 'member@example.com',
  role: 'user',

  company_name: '인천테크',
  company_address:
    '123 Songdo-dong, Yeonsu-gu, Incheon, Korea',

  business_number: '123-45-67890',
  customs_clearance_code: 'P123456789012',

  contact_name: '김지민',
  phone: '010-1234-5678',
  country: 'KOREA',

  default_load_port: 'INCHEON, KOREA',
  default_discharge_port: 'SHANGHAI, CHINA',
  default_incoterm: 'CIF',

  service_role: 'integrated',
};

describe('user_profiles 회원 서비스 역할', () => {
  it('service_role이 없는 기존 회원은 integrated로 처리한다', () => {
    const {
      service_role: _serviceRole,
      ...legacyProfile
    } = profile;

    expect(
      normalizeUserProfile(legacyProfile)
        .service_role,
    ).toBe('integrated');
  });

  it('service_role이 null인 회원은 integrated로 처리한다', () => {
    expect(
      normalizeUserProfile({
        ...profile,
        service_role: null,
      }).service_role,
    ).toBe('integrated');
  });

  it('저장된 shipper 역할은 그대로 유지한다', () => {
    expect(
      normalizeUserProfile({
        ...profile,
        service_role: 'shipper',
      }).service_role,
    ).toBe('shipper');
  });

  it('저장된 forwarder 역할은 그대로 유지한다', () => {
    expect(
      normalizeUserProfile({
        ...profile,
        service_role: 'forwarder',
      }).service_role,
    ).toBe('forwarder');
  });

  it('저장된 integrated 역할은 그대로 유지한다', () => {
    expect(
      normalizeUserProfile({
        ...profile,
        service_role: 'integrated',
      }).service_role,
    ).toBe('integrated');
  });
});

describe('user_profiles 온보딩 판정', () => {
  it('회사명이 있으면 삭제된 업무설정 값 없이도 완료 상태다', () => {
    expect(
      isUserProfileComplete(profile),
    ).toBe(true);
  });

  it('회사명이 공백이면 온보딩 대상이다', () => {
    expect(
      isUserProfileComplete({
        ...profile,
        company_name: '  ',
      }),
    ).toBe(false);
  });

  it('회사명이 null이면 온보딩 대상이다', () => {
    expect(
      isUserProfileComplete({
        ...profile,
        company_name: null,
      }),
    ).toBe(false);
  });
});

describe('거래 프로필 기본값 변환', () => {
  it('user_profiles를 새 거래의 TradeProfile 기본값으로 변환한다', () => {
    const defaults =
      userProfileToTradeDefaults(profile);

    expect(defaults).toMatchObject({
      companyName: '인천테크',
      companyAddress:
        '123 Songdo-dong, Yeonsu-gu, Incheon, Korea',
      companyCountry: 'KOREA',

      contact: '010-1234-5678',
      contactName: '김지민',
      signedBy: '김지민',

      businessRegistrationNo:
        '123-45-67890',

      loadPort: 'INCHEON, KOREA',
      dischargePort: 'SHANGHAI, CHINA',
      incoterms: 'CIF',
    });
  });

  it('거래 방향은 프로필 기본값에서 지정하지 않는다', () => {
    const defaults =
      userProfileToTradeDefaults(profile);

    expect(defaults).not.toHaveProperty(
      'tradeType',
    );
  });

  it('기본 선적항과 도착항은 저장된 영문 값을 그대로 사용한다', () => {
    const defaults =
      userProfileToTradeDefaults(profile);

    expect(defaults.loadPort).toBe(
      'INCHEON, KOREA',
    );

    expect(defaults.dischargePort).toBe(
      'SHANGHAI, CHINA',
    );
  });

  it('지원하지 않는 Incoterm은 빈 값으로 안전하게 처리한다', () => {
    const defaults =
      userProfileToTradeDefaults({
        ...profile,
        default_incoterm: 'INVALID',
      });

    expect(defaults.incoterms).toBe('');
  });

  it('회사 주소가 null이면 빈 문자열로 안전하게 처리한다', () => {
    const defaults =
      userProfileToTradeDefaults({
        ...profile,
        company_address: null,
      });

    expect(defaults.companyAddress).toBe('');
  });

  it('선택 프로필 값이 null이면 빈 문자열로 안전하게 처리한다', () => {
    const defaults =
      userProfileToTradeDefaults({
        ...profile,
        company_address: null,
        phone: null,
        business_number: null,
        default_load_port: null,
        default_discharge_port: null,
        default_incoterm: null,
      });

    expect(defaults).toMatchObject({
      companyAddress: '',
      contact: '',
      businessRegistrationNo: '',
      loadPort: '',
      dischargePort: '',
      incoterms: '',
    });
  });
});