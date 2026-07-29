import { useCallback, useEffect, useRef, useState } from 'react';
import type { TradeRole, TradeType } from '../types';
import type { TradeFormDataV3 } from '../types/tradeFormData';
import {
  deleteTradeDraft,
  loadTradeDraft,
  saveTradeFormDraft,
  type TradeDraftRow,
} from '../services/draftCacheService';
import type { DraftSaveStatus } from './useTradeDraft';

const DATABASE_SAVE_DELAY_MS = 30_000;

interface UseFormDataDraftInput {
  userId: string | null;
  enabled: boolean;
  direction: TradeType;
  role: TradeRole;
  formData: TradeFormDataV3;
  currentStep: number;
  tradeId: string | null;
  onRestore: (draft: TradeDraftRow | null) => void;
}

export function useFormDataDraft({
  userId,
  enabled,
  direction,
  role,
  formData,
  currentStep,
  tradeId,
  onRestore,
}: UseFormDataDraftInput) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceRef = useRef(0);
  const hydratedRef = useRef(false);
  const formDataRef = useRef(formData);
  const stepRef = useRef(currentStep);
  const tradeIdRef = useRef(tradeId);
  const userIdRef = useRef(userId);
  const directionRef = useRef(direction);
  const roleRef = useRef(role);
  const onRestoreRef = useRef(onRestore);
  const enabledRef = useRef(enabled);
  const saveInFlightRef = useRef<Promise<void> | null>(null);

  formDataRef.current = formData;
  stepRef.current = currentStep;
  tradeIdRef.current = tradeId;
  userIdRef.current = userId;
  directionRef.current = direction;
  roleRef.current = role;
  onRestoreRef.current = onRestore;
  enabledRef.current = enabled;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushDraft = useCallback(async () => {
    const currentUserId = userIdRef.current;
    if (!currentUserId || !enabledRef.current || !hydratedRef.current) return;
    clearTimer();
    if (saveInFlightRef.current) await saveInFlightRef.current;
    const savePromise = (async () => {
      setSaveStatus('saving');
      try {
        const result = await saveTradeFormDraft({
          userId: currentUserId,
          direction: directionRef.current,
          role: roleRef.current,
          formData: formDataRef.current,
          currentStep: stepRef.current,
          tradeId: tradeIdRef.current,
        });
        if (userIdRef.current !== currentUserId) return;
        setLastSavedAt(result.updatedAt);
        setSaveStatus('saved');
      } catch (error) {
        console.error('[Trade Draft] form_data 자동 저장 실패:', error);
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
    const sequence = ++sequenceRef.current;
    const shouldFlushOnCleanup = Boolean(userId && enabled);
    clearTimer();
    hydratedRef.current = false;
    setIsHydrated(false);
    setSaveStatus('idle');
    setLastSavedAt(null);

    if (!userId || !enabled) {
      onRestoreRef.current(null);
      hydratedRef.current = true;
      setIsHydrated(true);
      return;
    }

    void loadTradeDraft(userId, direction, role)
      .then((draft) => {
        if (sequenceRef.current !== sequence) return;
        onRestoreRef.current(draft);
        if (draft) {
          setLastSavedAt(draft.updated_at);
          setSaveStatus('saved');
        }
      })
      .catch((error) => {
        if (sequenceRef.current !== sequence) return;
        console.error('[Trade Draft] form_data 복원 실패:', error);
        setSaveStatus('error');
        onRestoreRef.current(null);
      })
      .finally(() => {
        if (sequenceRef.current !== sequence) return;
        hydratedRef.current = true;
        setIsHydrated(true);
      });

    return () => {
      if (shouldFlushOnCleanup && hydratedRef.current) {
        void flushDraft().catch(() => undefined);
      }
      clearTimer();
      if (sequenceRef.current === sequence) sequenceRef.current += 1;
    };
  }, [clearTimer, direction, enabled, flushDraft, role, userId]);

  useEffect(() => {
    clearTimer();
    if (!userId || !enabled || !isHydrated || !hydratedRef.current) return;
    timerRef.current = setTimeout(() => {
      void flushDraft().catch(() => undefined);
    }, DATABASE_SAVE_DELAY_MS);
    return clearTimer;
  }, [
    clearTimer,
    currentStep,
    enabled,
    flushDraft,
    formData,
    isHydrated,
    tradeId,
    userId,
  ]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushDraft().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [flushDraft]);

  const completeDraft = useCallback(async () => {
    const currentUserId = userIdRef.current;
    if (!currentUserId) return;
    hydratedRef.current = false;
    clearTimer();
    if (saveInFlightRef.current) {
      try {
        await saveInFlightRef.current;
      } catch {
        // 저장 실패와 무관하게 제출 완료된 draft 정리를 시도합니다.
      }
    }
    await deleteTradeDraft(currentUserId, directionRef.current, roleRef.current);
    setSaveStatus('idle');
    setLastSavedAt(null);
  }, [clearTimer]);

  return {
    isHydrated,
    saveStatus,
    lastSavedAt,
    flushDraft,
    completeDraft,
  };
}
