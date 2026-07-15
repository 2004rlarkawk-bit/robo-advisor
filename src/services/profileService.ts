import type { Incoterms, TradeProfile, TradeType } from '../types';
import { supabase } from '../lib/supabase';

export const TRADE_PURPOSE_OPTIONS = [
  { value: 'export', label: '수출' },
  { value: 'import', label: '수입' },
  { value: 'integrated', label: '통합' },
] as const;

export const INDUSTRY_OPTIONS = [
  { value: 'manufacturing', label: '제조업' },
  { value: 'trading', label: '무역' },
  { value: 'forwarding', label: '포워딩' },
  { value: 'logistics', label: '물류' },
  { value: 'ecommerce', label: '전자상거래' },
  { value: 'other', label: '기타' },
] as const;

export const INCOTERM_OPTIONS: Exclude<Incoterms, ''>[] = [
  'FOB', 'CIF', 'EXW', 'DDP', 'DAP', 'FCA',
];

export interface UserProfile {
  id: string;
  email: string;
  company_name: string | null;
  business_number: string | null;
  contact_name: string | null;
  phone: string | null;
  country: string | null;
  industry: string | null;
  trade_purpose: string | null;
  default_load_port: string | null;
  default_discharge_port: string | null;
  default_incoterm: string | null;
  role: string;
  created_at?: string;
  updated_at?: string;
}

export type UserProfileUpdate = Pick<
  UserProfile,
  | 'company_name'
  | 'business_number'
  | 'contact_name'
  | 'phone'
  | 'country'
  | 'industry'
  | 'trade_purpose'
  | 'default_load_port'
  | 'default_discharge_port'
  | 'default_incoterm'
>;

const REQUIRED_PROFILE_FIELDS: (keyof UserProfile)[] = [
  'company_name', 'trade_purpose', 'industry',
];

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
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
  const tradeType: TradeType = profile.trade_purpose === 'import' ? 'import' : 'export';

  return {
    tradeType,
    companyName: profile.company_name ?? '',
    businessRegistrationNo: profile.business_number ?? '',
    taxNo: profile.business_number ?? '',
    contact: profile.phone ?? '',
    contactName: profile.contact_name ?? '',
    companyCountry: profile.country ?? '',
    signedBy: profile.contact_name ?? '',
    loadPort: profile.default_load_port ?? '',
    dischargePort: profile.default_discharge_port ?? '',
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
  return data as UserProfile | null;
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
  return data as UserProfile;
}
