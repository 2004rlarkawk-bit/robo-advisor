import { useState } from 'react';
import ProfileForm from './ProfileForm';
import type { UserProfile, UserProfileUpdate } from '../services/profileService';

interface Props { profile: UserProfile; isSaving: boolean; onSave: (values: UserProfileUpdate) => Promise<void>; }

export default function ProfileSettingsPage({ profile, isSaving, onSave }: Props) {
  const [saved, setSaved] = useState('');
  const save = async (values: UserProfileUpdate) => {
    setSaved(''); await onSave(values);
    setSaved('프로필이 저장되었습니다. 새 거래부터 변경된 기본값을 사용할 수 있습니다.');
  };
  return (
    <div className={'profile-settings-page'}>
      <div className={'page-heading'}><h1 className={'page-title'}>프로필 관리</h1><p className={'page-subtitle'}>회사 정보와 새 거래에 사용할 기본값을 관리합니다.</p></div>
      <div className={'profile-settings-card'}>
        {saved && <div className={'form-message success'} role={'status'}>{saved}</div>}
        <ProfileForm profile={profile} submitLabel={'프로필 저장'} isSaving={isSaving} onSubmit={save} />
      </div>
    </div>
  );
}
