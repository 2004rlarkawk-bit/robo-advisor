import { useCallback, useEffect, useState } from 'react';
import {
  getUserProfile,
  isUserProfileComplete,
  updateUserProfile,
  type UserProfile,
  type UserProfileUpdate,
} from '../services/profileService';

export function useUserProfile(userId: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const loaded = await getUserProfile(userId);
      if (!loaded) {
        throw new Error('회원 프로필 행을 찾을 수 없습니다. 회원가입 프로필 생성 트리거를 확인해 주세요.');
      }
      setProfile(loaded);
    } catch (caught) {
      setProfile(null);
      setError(caught instanceof Error ? caught.message : '프로필을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setProfile(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    getUserProfile(userId)
      .then((loaded) => {
        if (!active) return;
        if (!loaded) {
          throw new Error('회원 프로필 행을 찾을 수 없습니다. 회원가입 프로필 생성 트리거를 확인해 주세요.');
        }
        setProfile(loaded);
      })
      .catch((caught) => {
        if (!active) return;
        setProfile(null);
        setError(caught instanceof Error ? caught.message : '프로필을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const saveProfile = useCallback(async (values: UserProfileUpdate) => {
    if (!userId) throw new Error('로그인 세션이 없습니다.');
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateUserProfile(userId, values);
      setProfile(updated);
      return updated;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '프로필을 저장하지 못했습니다.';
      setError(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  }, [userId]);

  return {
    profile,
    isLoading,
    isSaving,
    error,
    needsOnboarding: Boolean(profile && !isUserProfileComplete(profile)),
    reload: loadProfile,
    saveProfile,
  };
}
