// [NEW: Supabase Auth]
// 이메일/비밀번호 회원가입, 로그인, 로그아웃, 세션 확인을 한 곳에서 관리합니다.
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AuthSessionUser {
  id: string;
  email: string;
  name: string;
  type: 'member';
}

interface SignUpInput {
  email: string;
  password: string;
  companyName?: string;
  contactName?: string;
}

function toAuthSessionUser(user: User): AuthSessionUser {
  return {
    id: user.id,
    email: user.email ?? '',
    name: user.email ?? 'member',
    type: 'member',
  };
}

export async function signUpWithEmail({
  email,
  password,
  companyName,
  contactName,
}: SignUpInput): Promise<AuthSessionUser | null> {
  // [EDIT: DB Trigger Auth] 회사명/담당자명은 user_profiles에 직접 insert하지 않고 Auth metadata로만 전달합니다.
  // Database Trigger가 auth.users.raw_user_meta_data에서 이 값을 읽어 user_profiles에 저장합니다.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        company_name: companyName || null,
        contact_name: contactName || null,
      },
    },
  });

  if (error) throw error;
  if (!data.user) return null;

  // [EDIT: DB Trigger Auth] 회원가입 직후 user_profiles insert는 프론트에서 하지 않습니다.
  // auth.users에 사용자가 생성되면 Supabase Database Trigger가 user_profiles를 자동 생성합니다.
  console.info('[EDIT: DB Trigger Auth] signUp result; profile creation is handled by DB trigger:', {
    userId: data.user.id,
    userEmail: data.user.email,
    hasSession: Boolean(data.session),
    metadata: data.user.user_metadata,
  });

  // [EDIT: Supabase Auth] Confirm email이 켜져 있으면 signUp은 성공해도 즉시 로그인 세션이 없습니다.
  // 개발/시연용 즉시 로그인을 원하면 Supabase Dashboard에서 Confirm email을 OFF로 바꿔야 합니다.
  if (!data.session) {
    return null;
  }

  return toAuthSessionUser(data.user);
}

export async function signInWithEmail(email: string, password: string): Promise<AuthSessionUser> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // [EDIT: Supabase Auth] 이 오류는 코드가 아니라 Supabase Dashboard의 Confirm email 설정 때문에 발생합니다.
    if (error.message.toLowerCase().includes('email not confirmed')) {
      throw new Error('Email not confirmed: Supabase Dashboard에서 Confirm email을 OFF로 변경한 뒤 새 이메일로 다시 회원가입해 주세요.');
    }
    throw error;
  }
  if (!data.user) throw new Error('로그인 사용자 정보를 가져오지 못했습니다.');

  return toAuthSessionUser(data.user);
}

export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentAuthUser(): Promise<AuthSessionUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  if (!data.user) return null;

  return toAuthSessionUser(data.user);
}

export function onAuthStateChange(
  callback: (user: AuthSessionUser | null, event: AuthChangeEvent, session: Session | null) => void
) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ? toAuthSessionUser(session.user) : null, event, session);
  });
}
