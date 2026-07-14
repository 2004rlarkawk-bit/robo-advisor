import { describe, expect, it } from 'vitest';
import { getLoginErrorMessage, isDuplicateEmailError } from './authErrorMessage';

describe('인증 오류 한글 변환', () => {
  it('로그인 자격 증명 오류를 한글로 표시한다', () => {
    expect(getLoginErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
      .toBe('이메일 또는 비밀번호가 올바르지 않습니다.');
  });

  it('네트워크 오류를 한글로 표시한다', () => {
    expect(getLoginErrorMessage(new TypeError('Failed to fetch')))
      .toBe('네트워크 연결을 확인한 후 다시 시도해 주세요.');
  });

  it('중복 이메일 오류 코드를 판별한다', () => {
    expect(isDuplicateEmailError({ code: 'user_already_exists' })).toBe(true);
  });
});
