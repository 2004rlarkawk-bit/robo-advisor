import type { Incoterms, TradeProfile } from '../types';
import { supabase } from '../lib/supabase';
import { normalizeCountryValue } from '../constants/countries';
import { normalizePortValue } from '../constants/ports';

export const INCOTERM_OPTIONS: Exclude<Incoterms, ''>[] = [
  'FOB',
  'CIF',
  'EXW',
  'DDP',
  'DAP',
  'FCA',
];

/**
 * 회원이 사용할 수 있는 서비스 역할입니다.
 *
 * shipper:
 * 화주 업무만 사용합니다.
 *
 * forwarder:
 * 포워더 업무만 사용합니다.
 *
 * integrated:
 * 화주와 포워더 업무를 모두 사용할 수 있습니다.
 */
export type ServiceRole =
  | 'shipper'
  | 'forwarder'
  | 'integrated';

/**
 * Supabase user_profiles 테이블 구조입니다.
 */
export interface UserProfile {
  id: string;
  email: string;

  company_name: string | null;
  company_address: string | null;

  business_number: string | null;
  customs_clearance_code: string | null;

  contact_name: string | null;
  phone: string | null;
  country: string | null;

  default_load_port: string | null;
  default_discharge_port: string | null;
  default_incoterm: string | null;

  service_role: ServiceRole;
  role: string;

  created_at?: string;
  updated_at?: string;
}

/**
 * 회원 프로필 수정 시 전달할 수 있는 컬럼입니다.
 */
export type UserProfileUpdate = Partial<
  Pick<
    UserProfile,
    | 'company_name'
    | 'company_address'
    | 'business_number'
    | 'customs_clearance_code'
    | 'contact_name'
    | 'phone'
    | 'country'
    | 'default_load_port'
    | 'default_discharge_port'
    | 'default_incoterm'
    | 'service_role'
  >
>;

/**
 * 기존 회원 데이터에서는 service_role 또는
 * customs_clearance_code가 없거나 null일 수 있습니다.
 */
type UserProfileRow = Omit<
  UserProfile,
  'service_role' | 'customs_clearance_code'
> & {
  service_role?: ServiceRole | null;
  customs_clearance_code?: string | null;
};

/**
 * 온보딩 완료 여부를 판단할 때 필요한 필드입니다.
 *
 * industry와 trade_purpose는 더 이상 사용하지 않습니다.
 */
const REQUIRED_PROFILE_FIELDS: (keyof UserProfile)[] = [
  'company_name',
];

function hasText(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  );
}

/**
 * DB에서 불러온 프로필 값을 앱에서 안전하게 사용할 수 있도록
 * 정규화합니다.
 */
export function normalizeUserProfile(
  profile: UserProfileRow,
): UserProfile {
  return {
    ...profile,

    company_name:
      profile.company_name?.trim() || null,

    company_address:
      profile.company_address?.trim() || null,

    business_number:
      profile.business_number?.trim() || null,

    customs_clearance_code:
      profile.customs_clearance_code?.trim() || null,

    contact_name:
      profile.contact_name?.trim() || null,

    phone:
      profile.phone?.trim() || null,

    country:
      normalizeCountryValue(profile.country) || null,

    default_load_port:
      normalizePortValue(
        profile.default_load_port,
      ) || null,

    default_discharge_port:
      normalizePortValue(
        profile.default_discharge_port,
      ) || null,

    default_incoterm:
      profile.default_incoterm?.trim() || null,

    service_role:
      profile.service_role ?? 'integrated',
  };
}

/**
 * 온보딩 완료 여부를 확인합니다.
 *
 * 현재는 회사명만 입력되어 있으면 완료로 처리합니다.
 */
export function isUserProfileComplete(
  profile: UserProfile | null,
): boolean {
  if (!profile) {
    return false;
  }

  return REQUIRED_PROFILE_FIELDS.every(
    (field) => hasText(profile[field]),
  );
}

/**
 * 회원 프로필을 새 거래의 기본값으로 변환합니다.
 *
 * 거래 방향인 import/export는 이 함수에서 지정하지 않습니다.
 * 거래 방향은 통관 작업실의 tradeDirection 상태에서 관리합니다.
 */
export function userProfileToTradeDefaults(
  profile: UserProfile,
): Partial<TradeProfile> {
  const allowedIncoterms: Incoterms[] = [
    '',
    ...INCOTERM_OPTIONS,
  ];

  const normalizedIncoterm =
    profile.default_incoterm?.trim() || '';

  const incoterms: Incoterms =
    allowedIncoterms.includes(
      normalizedIncoterm as Incoterms,
    )
      ? (normalizedIncoterm as Incoterms)
      : '';

  return {
    companyName:
      profile.company_name?.trim() || '',

    companyAddress:
      profile.company_address?.trim() || '',

    businessRegistrationNo:
      profile.business_number?.trim() || '',

    taxNo:
      profile.business_number?.trim() || '',

    contact:
      profile.phone?.trim() || '',

    contactName:
      profile.contact_name?.trim() || '',

    companyCountry:
      normalizeCountryValue(profile.country),

    signedBy:
      profile.contact_name?.trim() || '',

    loadPort:
      normalizePortValue(
        profile.default_load_port,
      ),

    dischargePort:
      normalizePortValue(
        profile.default_discharge_port,
      ),

    incoterms,
  };
}

/**
 * 현재 회원의 프로필을 조회합니다.
 */
export async function getUserProfile(
  userId: string,
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? normalizeUserProfile(
        data as UserProfileRow,
      )
    : null;
}

/**
 * 회원가입 트리거가 생성한 현재 사용자의 프로필 행만 수정합니다.
 *
 * INSERT 또는 upsert는 수행하지 않습니다.
 */
export async function updateUserProfile(
  userId: string,
  values: UserProfileUpdate,
): Promise<UserProfile> {
  const payload = Object.fromEntries(
    Object.entries(values).map(
      ([key, value]) => {
        if (typeof value === 'string') {
          return [
            key,
            value.trim() || null,
          ];
        }

        return [key, value ?? null];
      },
    ),
  );

  const { data, error } = await supabase
    .from('user_profiles')
    .update(payload)
    .eq('id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      '회원 프로필 행을 찾을 수 없습니다. 회원가입 프로필 생성 트리거를 확인해 주세요.',
    );
  }

  return normalizeUserProfile(
    data as UserProfileRow,
  );
}
