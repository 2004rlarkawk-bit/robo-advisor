import ProfileForm from './ProfileForm';
import Logo from './Logo';
import type { UserProfile, UserProfileUpdate } from '../services/profileService';

interface Props { profile: UserProfile; isSaving: boolean; onComplete: (values: UserProfileUpdate) => Promise<void>; }

export default function OnboardingPage({ profile, isSaving, onComplete }: Props) {
  return (
    <div className={'login-wrapper onboarding-page'}>
      <div className={'login-bg-decoration login-bg-decor1'} />
      <div className={'login-bg-decoration login-bg-decor2'} />
      <div className={'onboarding-card'}>
        <div className={'onboarding-heading'}>
          <Logo size="auth" background="light" />
          <div className={'onboarding-title'}>👋 거의 다 됐어요</div>
          <div className={'onboarding-subtitle'}>맞춤 문서와 빠른 거래 입력을 위해 회사 정보를 설정해 주세요.</div>
        </div>
        <ProfileForm profile={profile} submitLabel={'설정 완료하고 시작하기'} isSaving={isSaving} onSubmit={onComplete} requireExplicitServiceRole />
      </div>
    </div>
  );
}
