import type { AuthError } from '@supabase/supabase-js';

type AuthErrorLike = Partial<Pick<AuthError, 'code' | 'message' | 'status'>>;

function asAuthError(error: unknown): AuthErrorLike {
  return error && typeof error === 'object' ? error as AuthErrorLike : {};
}

export function isDuplicateEmailError(error: unknown): boolean {
  const { code, message = '', status } = asAuthError(error);
  const normalizedMessage = message.toLowerCase();
  return code === 'user_already_exists'
    || code === 'email_exists'
    || (status === 422 && normalizedMessage.includes('already'))
    || normalizedMessage.includes('already registered')
    || normalizedMessage.includes('already exists');
}

export function getLoginErrorMessage(error: unknown): string {
  const { code, message = '', status } = asAuthError(error);
  const normalizedMessage = message.toLowerCase();

  if (code === 'invalid_credentials' || normalizedMessage.includes('invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (code === 'email_not_confirmed' || normalizedMessage.includes('email not confirmed')) {
    return '이메일 인증이 완료되지 않았습니다.';
  }
  if (code === 'user_not_found' || normalizedMessage.includes('user not found')) {
    return '가입되지 않은 이메일입니다.';
  }
  if (code === 'over_request_rate_limit' || status === 429 || normalizedMessage.includes('too many requests')) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (normalizedMessage.includes('failed to fetch') || normalizedMessage.includes('network') || normalizedMessage.includes('load failed')) {
    return '네트워크 연결을 확인한 후 다시 시도해 주세요.';
  }
  return '로그인에 실패했습니다. 입력 정보를 확인해 주세요.';
}
