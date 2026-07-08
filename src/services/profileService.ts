// [NEW: Supabase Auth]
// Supabase Auth 사용자와 연결되는 user_profiles 테이블 관리 함수입니다.
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  company_name: string | null;
  contact_name: string | null;
  role: string;
  created_at?: string;
  updated_at?: string;
}

interface CreateUserProfileInput {
  id: string;
  email: string;
  companyName?: string;
  contactName?: string;
}

export async function createUserProfile({
  id,
  email,
  companyName = '',
  contactName = '',
}: CreateUserProfileInput): Promise<UserProfile> {
  // [EDIT: Supabase Auth] user_profiles에 들어갈 값을 명확히 확인할 수 있게 payload를 분리합니다.
  const payload = {
    id,
    email,
    company_name: companyName || null,
    contact_name: contactName || null,
    role: 'user',
  };

  const { data, error } = await supabase
    .from('user_profiles')
    .insert(payload)
    .select()
    .single();

  if (error) {
    // [EDIT: Supabase Auth] RLS/foreign key/중복키 등 insert 실패 원인을 console에서 확인합니다.
    console.error('[EDIT: Supabase Auth] user_profiles insert failed:', {
      payload,
      error,
    });
    throw error;
  }

  return data;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function ensureUserProfile(input: CreateUserProfileInput): Promise<UserProfile> {
  // [EDIT: Supabase Auth] 프로필 생성 전/후 흐름을 추적하기 위한 로그입니다.
  console.info('[EDIT: Supabase Auth] ensureUserProfile input:', input);

  try {
    const existing = await getUserProfile(input.id);
    if (existing) return existing;
    return await createUserProfile(input);
  } catch (error) {
    console.error('[EDIT: Supabase Auth] ensureUserProfile failed:', {
      input,
      error,
    });
    throw error;
  }
}
