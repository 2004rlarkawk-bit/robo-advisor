import type { Incoterms, TradeProfile } from '../types';
import { supabase } from '../lib/supabase';
import { normalizeCountryValue } from '../constants/countries';
import { normalizePortValue } from '../constants/ports';

export const INCOTERM_OPTIONS: Exclude<Incoterms, ''>[] = [
  'FOB', 'CIF', 'EXW', 'DDP', 'DAP', 'FCA',
];

// 2026-07-23 편의성 업그레이드: 회원 서비스 역할 타입 및 프로필 저장 구조 추가
export type ServiceRole =
  | 'shipper'
  | 'forwarder'
  | 'integrated';

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

export type UserProfileUpdate = Partial<Pick<
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
>>;

type UserProfileRow = Omit<UserProfile, 'service_role' | 'customs_clearance_code'> & {
  service_role?: ServiceRole | null;
  customs_clearance_code?: string | null;
};

const REQUIRED_PROFILE_FIELDS: (keyof UserProfile)[] = ['company_name'];

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeUserProfile(profile: UserProfileRow): UserProfile {
  return {
    ...profile,
    company_address: profile.company_address ?? null,
    customs_clearance_code: profile.customs_clearance_code ?? null,
    country: normalizeCountryValue(profile.country) || null,
    default_load_port: normalizePortValue(profile.default_load_port) || null,
    default_discharge_port: normalizePortValue(profile.default_discharge_port) || null,
    service_role: profile.service_role ?? 'integrated',
  };
}

export function isUserProfileComplete(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return REQUIRED_PROFILE_FIELDS.every((field) => hasText(profile[field]));
}

export function userProfileToTradeDefaults(profile: UserProfile): Partial<TradeProfile> {
  const allowedIncoterms: Incoterms[] = ['', ...INCOTERM_OPTIONS];
  const incoterms = allowedIncoterms.includes(profile.default_incoterm as Incoterms)
    ? (profile.default_incoterm as Incoterms)
    : '';
  return {
    companyName: profile.company_name ?? '',
    companyAddress: profile.company_address ?? '',
    businessRegistrationNo: profile.business_number ?? '',
    taxNo: profile.business_number ?? '',
    contact: profile.phone ?? '',
    contactName: profile.contact_name ?? '',
    companyCountry: normalizeCountryValue(profile.country),
    signedBy: profile.contact_name ?? '',
    loadPort: normalizePortValue(profile.default_load_port),
    dischargePort: normalizePortValue(profile.default_discharge_port),
    incoterms,
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeUserProfile(data as UserProfileRow) : null;
}

/** 회원가입 트리거가 만든 현재 사용자의 행만 갱신하며 INSERT/upsert하지 않는다. */
export async function updateUserProfile(
  userId: string,
  values: UserProfileUpdate,
): Promise<UserProfile> {
  const payload = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value?.trim() || null]),
  );

  const { data, error } = await supabase
    .from('user_profiles')
    .update(payload)
    .eq('id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('회원 프로필 행을 찾을 수 없습니다. 회원가입 프로필 생성 트리거를 확인해 주세요.');
  }
  return normalizeUserProfile(data as UserProfileRow);
}
