// [NEW: Supabase Auth]
// 로그인하지 않은 사용자에게만 보여주는 회원가입/로그인 화면입니다.
import { useState } from 'react';
import { signInWithEmail, signUpWithEmail, AuthSessionUser } from '../services/authService';

interface AuthPageProps {
  onAuthenticated: (user: AuthSessionUser) => void;
}

export default function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const isSignup = mode === 'signup';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (!email.trim() || !password.trim()) {
      setMessage('이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSignup) {
        const user = await signUpWithEmail({
          email: email.trim(),
          password,
          companyName: companyName.trim(),
          contactName: contactName.trim(),
        });

        if (user) {
          onAuthenticated(user);
          return;
        }

        setMessage('회원가입이 완료되었습니다. 이메일 인증을 켠 경우 메일 확인 후 로그인해 주세요.');
        setMode('login');
        return;
      }

      const user = await signInWithEmail(email.trim(), password);
      onAuthenticated(user);
    } catch (err) {
      // [EDIT: Supabase Auth] 프로필 생성 실패가 화면에 보이도록 별도 메시지를 표시합니다.
      console.error('[EDIT: Supabase Auth] AuthPage submit failed:', err);
      const text = err instanceof Error ? err.message : '인증 처리 중 오류가 발생했습니다.';
      setMessage(text.includes('프로필 생성 실패') ? text : `인증 실패: ${text}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-bg-decoration login-bg-decor1"></div>
      <div className="login-bg-decoration login-bg-decor2"></div>

      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">P</div>
          <div className="login-brand">PortAI</div>
          <div className="login-subtitle">회원 로그인 후 이용할 수 있습니다</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-input-group">
            <label className="login-label">이메일</label>
            <input
              type="email"
              className="login-input"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="login-input-group">
            <label className="login-label">비밀번호</label>
            <input
              type="password"
              className="login-input"
              placeholder="6자 이상 비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </div>

          {isSignup && (
            <>
              <div className="login-input-group">
                <label className="login-label">회사명</label>
                <input
                  type="text"
                  className="login-input"
                  placeholder="회사명을 입력해 주세요"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>

              <div className="login-input-group">
                <label className="login-label">담당자명</label>
                <input
                  type="text"
                  className="login-input"
                  placeholder="담당자명을 입력해 주세요"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
            </>
          )}

          {message && (
            <div style={{ fontSize: 13, color: '#b91c1c', lineHeight: 1.5 }}>
              {message}
            </div>
          )}

          <button type="submit" className="login-btn-primary" disabled={isSubmitting}>
            {isSubmitting ? '처리 중...' : isSignup ? '회원가입' : '로그인'}
          </button>
        </form>

        <div className="login-divider">{isSignup ? '이미 계정이 있나요?' : '처음 이용하시나요?'}</div>

        <button
          type="button"
          className="login-btn-switch"
          onClick={() => {
            setMessage('');
            setMode(isSignup ? 'login' : 'signup');
          }}
        >
          {isSignup ? '로그인 화면으로 이동' : '이메일로 회원가입'}
        </button>
      </div>
    </div>
  );
}
