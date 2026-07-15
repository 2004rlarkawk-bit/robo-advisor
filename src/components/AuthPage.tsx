import { useState } from 'react';
import {
  checkEmailExists,
  EmailAlreadyRegisteredError,
  isValidEmail,
  normalizeEmail,
  signInWithEmail,
  signUpWithEmail,
  type AuthSessionUser,
} from '../services/authService';
import { getLoginErrorMessage } from '../utils/authErrorMessage';

interface AuthPageProps {
  onAuthenticated: (user: AuthSessionUser) => void;
}

type EmailCheckStatus = 'idle' | 'checking' | 'available' | 'duplicate' | 'error';

export default function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(() => {
    if (sessionStorage.getItem('accountDeleted') !== 'true') return '';
    sessionStorage.removeItem('accountDeleted');
    return '회원탈퇴 되었습니다.';
  });
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [emailCheckStatus, setEmailCheckStatus] = useState<EmailCheckStatus>('idle');
  const [checkedEmail, setCheckedEmail] = useState('');

  const isSignup = mode === 'signup';
  const normalizedEmail = normalizeEmail(email);
  const validEmail = isValidEmail(normalizedEmail);
  const emailWasChecked = emailCheckStatus === 'available' && checkedEmail === normalizedEmail;
  const signupDisabled = isSubmitting || !validEmail || password.length < 6 || !emailWasChecked;

  const resetEmailCheck = () => {
    setEmailCheckStatus('idle');
    setCheckedEmail('');
  };

  const handleCheckEmail = async () => {
    setMessage('');
    if (!validEmail) {
      setMessageType('error');
      setMessage('올바른 이메일 형식을 입력해 주세요.');
      return;
    }

    setEmailCheckStatus('checking');
    try {
      const exists = await checkEmailExists(normalizedEmail);
      setCheckedEmail(normalizedEmail);
      setEmailCheckStatus(exists ? 'duplicate' : 'available');
      setMessageType(exists ? 'error' : 'success');
      setMessage(exists ? '이미 가입된 이메일입니다.' : '사용 가능한 이메일입니다.');
    } catch (error) {
      console.error('[Supabase Auth] Email availability check failed:', error);
      setEmailCheckStatus('error');
      setCheckedEmail('');
      setMessageType('error');
      setMessage('이메일 중복확인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    setMessageType('error');

    if (!email.trim() || !password.trim()) {
      setMessage('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    if (isSignup && !validEmail) {
      setMessage('올바른 이메일 형식을 입력해 주세요.');
      return;
    }
    if (isSignup && !emailWasChecked) {
      setMessage('이메일 중복확인을 먼저 진행해 주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignup) {
        const authUser = await signUpWithEmail({
          email: normalizedEmail,
          password,
          companyName: companyName.trim(),
          contactName: contactName.trim(),
        });
        if (authUser) {
          resetEmailCheck();
          onAuthenticated(authUser);
          return;
        }

        setMessageType('success');
        setMessage('회원가입이 완료되었습니다. 이메일 인증을 켠 경우 메일 확인 후 로그인해 주세요.');
        setMode('login');
        resetEmailCheck();
        return;
      }

      const authUser = await signInWithEmail(normalizedEmail, password);
      onAuthenticated(authUser);
    } catch (error) {
      console.error('[Supabase Auth] AuthPage submit failed:', error);
      setMessageType('error');
      if (isSignup && error instanceof EmailAlreadyRegisteredError) {
        setEmailCheckStatus('duplicate');
        setCheckedEmail(normalizedEmail);
        setMessage('이미 가입된 이메일입니다.');
      } else if (isSignup) {
        setMessage('회원가입에 실패했습니다. 입력 정보를 확인해 주세요.');
      } else {
        setMessage(getLoginErrorMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-bg-decoration login-bg-decor1" />
      <div className="login-bg-decoration login-bg-decor2" />
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🚢</div>
          <div className="login-brand">PortAI</div>
          <div className="login-subtitle">스마트 물류 &amp; 통관 자동화 플랫폼</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-input-group">
            <label className="login-label" htmlFor="auth-email">이메일</label>
            <div className="auth-email-row">
              <input
                id="auth-email"
                type="email"
                className="login-input"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => {
                  const nextEmail = event.target.value;
                  setEmail(nextEmail);
                  if (normalizeEmail(nextEmail) !== checkedEmail) resetEmailCheck();
                  setMessage('');
                }}
                autoComplete="email"
              />
              {isSignup && (
                <button type="button" className="email-check-button" onClick={() => void handleCheckEmail()} disabled={!validEmail || emailCheckStatus === 'checking' || isSubmitting}>
                  {emailCheckStatus === 'checking' ? '확인 중...' : '중복확인'}
                </button>
              )}
            </div>
          </div>

          <div className="login-input-group">
            <label className="login-label" htmlFor="auth-password">비밀번호</label>
            <input id="auth-password" type="password" className="login-input" placeholder="6자 이상 비밀번호" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} />
          </div>

          {isSignup && (
            <>
              <div className="login-input-group">
                <label className="login-label" htmlFor="auth-company">회사명</label>
                <input id="auth-company" type="text" className="login-input" placeholder="회사명을 입력해 주세요" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
              </div>
              <div className="login-input-group">
                <label className="login-label" htmlFor="auth-contact">담당자명</label>
                <input id="auth-contact" type="text" className="login-input" placeholder="담당자명을 입력해 주세요" value={contactName} onChange={(event) => setContactName(event.target.value)} />
              </div>
            </>
          )}

          {isSignup && !message && validEmail && emailCheckStatus === 'idle' && (
            <div className="auth-helper-message">이메일 중복확인을 먼저 진행해 주세요.</div>
          )}
          {message && <div className={`form-message ${messageType}`} role={messageType === 'error' ? 'alert' : 'status'}>{message}</div>}

          <button type="submit" className="login-btn-primary" disabled={isSignup ? signupDisabled : isSubmitting}>
            {isSubmitting ? '처리 중...' : isSignup ? '회원가입' : '로그인'}
          </button>
        </form>

        <div className="login-divider">{isSignup ? '이미 계정이 있나요?' : '처음 이용하시나요?'}</div>
        <button type="button" className="login-btn-switch" onClick={() => { setMessage(''); setMode(isSignup ? 'login' : 'signup'); resetEmailCheck(); }}>
          {isSignup ? '로그인 화면으로 이동' : '이메일로 회원가입'}
        </button>
      </div>
    </div>
  );
}
