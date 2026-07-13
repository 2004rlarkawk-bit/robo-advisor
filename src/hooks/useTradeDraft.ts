import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { TradeProfile } from '../types';
import {
  deleteTradeDraft,
  loadDraftFromLocal,
  loadTradeDraft,
  removeDraftFromLocal,
  saveDraftToLocal,
  saveTradeDraft,
  selectNewestDraft,
} from '../services/draftCacheService';

const DATABASE_SAVE_DELAY_MS = 30_000;

export type DraftSaveStatus = 'idle' | 'local' | 'saving' | 'saved' | 'error';

interface UseTradeDraftInput {
  userId: string | null;
  enabled: boolean;
  profile: TradeProfile;
  defaultProfile: TradeProfile;
  setProfile: Dispatch<SetStateAction<TradeProfile>>;
}

export function useTradeDraft({ userId, enabled, profile, defaultProfile, setProfile }: UseTradeDraftInput) {
  const [isDraftLoading, setIsDraftLoading] = useState(false);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreSequenceRef = useRef(0);
  const restoredRef = useRef(false);
  const activeRef = useRef(true);
  const profileRef = useRef(profile);
  const enabledRef = useRef(enabled);
  const userIdRef = useRef(userId);
  const saveInFlightRef = useRef<Promise<void> | null>(null);

  profileRef.current = profile;
  enabledRef.current = enabled;
  userIdRef.current = userId;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushDraft = useCallback(async (): Promise<void> => {
    const currentUserId = userIdRef.current;
    if (!currentUserId || !enabledRef.current || !restoredRef.current || !activeRef.current) return;
    clearTimer();

    if (saveInFlightRef.current) await saveInFlightRef.current;
    const profileToSave = profileRef.current;
    const savePromise = (async () => {
      setSaveStatus('saving');
      try {
        const result = await saveTradeDraft(currentUserId, profileToSave);
        if (userIdRef.current !== currentUserId) return;
        setLastSavedAt(result.updatedAt);
        setSaveStatus('saved');
      } catch (error) {
        console.error('[Trade Draft] Supabase 자동 저장 실패:', error);
        if (userIdRef.current === currentUserId) setSaveStatus('error');
        throw error;
      }
    })();

    saveInFlightRef.current = savePromise;
    try {
      await savePromise;
    } finally {
      if (saveInFlightRef.current === savePromise) saveInFlightRef.current = null;
    }
  }, [clearTimer]);

  useEffect(() => {
    const sequence = ++restoreSequenceRef.current;
    clearTimer();
    restoredRef.current = false;
    activeRef.current = true;
    setIsDraftRestored(false);
    setLastSavedAt(null);
    setSaveStatus('idle');

    if (!userId || !enabled) {
      setIsDraftLoading(false);
      return;
    }

    setIsDraftLoading(true);
    const localDraft = loadDraftFromLocal(userId);

    void loadTradeDraft(userId)
      .catch((error) => {
        console.error('[Trade Draft] Supabase 초안 조회 실패:', error);
        return null;
      })
      .then((databaseDraft) => {
        if (restoreSequenceRef.current !== sequence) return;
        const newest = selectNewestDraft(localDraft, databaseDraft);
        setProfile(newest ? { ...defaultProfile, ...newest.profile } : defaultProfile);
        if (newest) {
          setLastSavedAt(newest.updatedAt);
          setSaveStatus(newest.source === 'database' ? 'saved' : 'local');
        }
        restoredRef.current = true;
        setIsDraftRestored(true);
        setIsDraftLoading(false);
      });

    return () => {
      clearTimer();
      if (restoreSequenceRef.current === sequence) restoreSequenceRef.current += 1;
    };
  }, [clearTimer, enabled, setProfile, userId]);

  useEffect(() => {
    clearTimer();
    if (!userId || !enabled || !isDraftRestored || !activeRef.current) return;

    try {
      saveDraftToLocal(userId, profile);
      setSaveStatus('local');
    } catch (error) {
      console.error('[Trade Draft] localStorage 저장 실패:', error);
      setSaveStatus('error');
    }

    timerRef.current = setTimeout(() => {
      void flushDraft().catch(() => undefined);
    }, DATABASE_SAVE_DELAY_MS);

    return clearTimer;
  }, [clearTimer, enabled, flushDraft, isDraftRestored, profile, userId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushDraft().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [flushDraft]);

  const completeDraft = useCallback(async (): Promise<void> => {
    const currentUserId = userIdRef.current;
    if (!currentUserId || !activeRef.current) return;
    activeRef.current = false;
    clearTimer();
    removeDraftFromLocal(currentUserId);
    if (saveInFlightRef.current) {
      try {
        await saveInFlightRef.current;
      } catch {
        // 실패한 저장 뒤에도 삭제를 시도해 완료된 거래의 오래된 DB 초안이 남지 않게 합니다.
      }
    }
    try {
      await deleteTradeDraft(currentUserId);
      setSaveStatus('idle');
      setLastSavedAt(null);
    } catch (error) {
      console.error('[Trade Draft] 생성 완료 초안 삭제 실패:', error);
      setSaveStatus('error');
      throw error;
    }
  }, [clearTimer]);

  const startNewDraft = useCallback(() => {
    activeRef.current = true;
    restoredRef.current = true;
    setIsDraftRestored(true);
    setSaveStatus('idle');
    setLastSavedAt(null);
  }, []);

  const pauseDraftSaving = useCallback(() => {
    activeRef.current = false;
    clearTimer();
  }, [clearTimer]);

  return {
    isDraftLoading,
    isDraftRestored,
    saveStatus,
    lastSavedAt,
    flushDraft,
    completeDraft,
    startNewDraft,
    pauseDraftSaving,
  };
}
