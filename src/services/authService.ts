import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isDuplicateEmailError } from '../utils/authErrorMessage';

export interface AuthSessionUser {
  id: string;
  email: string;
  name: string;
  type: 'member';
  onboardingPending: boolean;
}

interface SignUpInput {
  email: string;
  password: string;
  companyName?: string;
  contactName?: string;
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('이미 가입된 이메일입니다.');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function toAuthSessionUser(user: User): AuthSessionUser {
  return {
    id: user.id,
    email: user.email ?? '',
    name: user.email ?? 'member',
    type: 'member',
    onboardingPending: user.user_metadata?.onboarding_completed === false,
  };
}

export async function signUpWithEmail({ email, password, companyName, contactName }: SignUpInput): Promise<AuthSessionUser | null> {
  const { data, error } = await supabase.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: {
      data: {
        company_name: companyName || null,
        contact_name: contactName || null,
        onboarding_completed: false,
      },
    },
  });

  if (error) {
    if (isDuplicateEmailError(error)) throw new EmailAlreadyRegisteredError();
    throw error;
  }
  if (!data.user) return null;

  // 이메일 확인이 켜진 경우 기존 주소 재가입은 identities가 없는 모호한 성공 응답일 수 있습니다.
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new EmailAlreadyRegisteredError();
  }

  // user_profiles는 기존 Database Trigger가 Auth metadata를 읽어 생성합니다.
  console.info('[Supabase Auth] signUp complete; profile creation is handled by DB trigger:', {
    userId: data.user.id,
    hasSession: Boolean(data.session),
  });
  return data.session ? toAuthSessionUser(data.user) : null;
}

export async function signInWithEmail(email: string, password: string): Promise<AuthSessionUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password });
  if (error) throw error;
  if (!data.user) throw new Error('로그인 사용자 정보를 가져오지 못했습니다.');
  return toAuthSessionUser(data.user);
}

export async function markOnboardingCompleted(): Promise<AuthSessionUser> {
  const { data, error } = await supabase.auth.updateUser({
    data: { onboarding_completed: true },
  });
  if (error) throw error;
  if (!data.user) throw new Error('온보딩 완료 상태를 갱신하지 못했습니다.');
  return toAuthSessionUser(data.user);
}

export async function checkEmailExists(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) throw new Error('invalid_email');
  const { data, error } = await supabase.functions.invoke<{ exists: boolean }>('check-email-exists', {
    body: { email: normalizedEmail },
  });
  if (error) throw error;
  if (!data || typeof data.exists !== 'boolean') throw new Error('invalid_check_email_response');
  return data.exists;
}

export async function deleteCurrentAccount(): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw sessionError ?? new Error('missing_session');
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error('missing_user');
  if (sessionData.session.user.id !== userData.user.id) throw new Error('session_user_mismatch');

  const { data, error } = await supabase.functions.invoke<{ deleted: boolean }>('delete-account', {
    body: {},
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  });
  if (error) throw error;
  if (!data?.deleted) throw new Error('invalid_delete_account_response');

  // 서버 삭제 성공이 확인된 뒤, 로그아웃 이벤트로 로그인 화면이 렌더링되기 전에 일회성 알림을 준비합니다.
  sessionStorage.setItem('accountDeleted', 'true');
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  if (signOutError) console.warn('[Supabase Auth] 계정 삭제 후 로컬 세션 정리 실패:', signOutError);
  return userData.user.id;
}

export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentAuthUser(): Promise<AuthSessionUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return toAuthSessionUser(data.user);
}

export function onAuthStateChange(callback: (user: AuthSessionUser | null, event: AuthChangeEvent, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ? toAuthSessionUser(session.user) : null, event, session);
  });
}
