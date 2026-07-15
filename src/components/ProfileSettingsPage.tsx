import { useState } from 'react';
import ProfileForm from './ProfileForm';
import type { UserProfile, UserProfileUpdate } from '../services/profileService';

interface Props {
  profile: UserProfile;
  isSaving: boolean;
  onSave: (values: UserProfileUpdate) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

export default function ProfileSettingsPage({ profile, isSaving, onSave, onDeleteAccount }: Props) {
  const [saved, setSaved] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const save = async (values: UserProfileUpdate) => {
    setSaved('');
    await onSave(values);
    setSaved('프로필이 저장되었습니다. 새 거래부터 변경된 기본값을 사용할 수 있습니다.');
  };

  const confirmDelete = async () => {
    if (isDeleting) return;
    setDeleteError('');
    setIsDeleting(true);
    try {
      await onDeleteAccount();
    } catch (error) {
      console.error('[Supabase Auth] Account deletion failed:', error);
      setDeleteError('회원탈퇴에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div className="profile-settings-page">
      <div className="page-heading">
        <h1 className="page-title">프로필 관리</h1>
        <p className="page-subtitle">회사 정보와 새 거래에 사용할 기본값을 관리합니다.</p>
      </div>
      <div className="profile-settings-card">
        {saved && <div className="form-message success" role="status">{saved}</div>}
        {deleteError && <div className="form-message error" role="alert">{deleteError}</div>}
        <ProfileForm
          profile={profile}
          submitLabel="프로필 저장"
          isSaving={isSaving}
          onSubmit={save}
          secondaryAction={(
            <button type="button" className="profile-delete-button" disabled={isDeleting} onClick={() => setShowDeleteModal(true)}>
              {isDeleting ? '처리 중...' : '회원탈퇴'}
            </button>
          )}
        />
      </div>

      {showDeleteModal && (
        <div className="account-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeleting) setShowDeleteModal(false); }}>
          <div className="account-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
            <h2 id="delete-account-title">회원탈퇴</h2>
            <p className="account-modal-warning">회원탈퇴 하시겠습니까?</p>
            <p className="account-modal-description">탈퇴하면 회원 정보와 저장된 거래 데이터가 삭제되며 복구할 수 없습니다.</p>
            <div className="account-modal-actions">
              <button type="button" className="account-modal-cancel" disabled={isDeleting} onClick={() => setShowDeleteModal(false)}>취소</button>
              <button type="button" className="account-modal-confirm" disabled={isDeleting} onClick={() => void confirmDelete()}>{isDeleting ? '처리 중...' : '회원탈퇴'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
