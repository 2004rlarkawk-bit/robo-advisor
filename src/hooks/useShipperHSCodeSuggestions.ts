import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ShipperItem } from '../types';
import type {
  ItemHSCodeSuggestionState,
} from '../types/hsCodeSuggestion';
import {
  normalizeHSKCode,
  recommendShipperHSCode,
} from '../services/shipperHSCodeSuggestionService';

const DEBOUNCE_MS = 700;

function normalizeItemName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function emptyState(): ItemHSCodeSuggestionState {
  return {
    loading: false,
    suggestions: [],
    error: null,
    lastRequestedItemName: '',
    requestId: 0,
    userEditedHSCode: false,
    appliedSuggestionCode: null,
    additionalInformationRequired: false,
    requiredAdditionalInfo: [],
  };
}

export function useShipperHSCodeSuggestions(
  items: ShipperItem[]
) {
  const [states, setStates] = useState<
    Record<string, ItemHSCodeSuggestionState>
  >({});
  const itemsRef = useRef(items);
  const timersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  );
  const requestSequencesRef = useRef(new Map<string, number>());
  const observedNamesRef = useRef(new Map<string, string>());

  itemsRef.current = items;

  const patchState = useCallback((
    itemId: string,
    patch: Partial<ItemHSCodeSuggestionState>
  ) => {
    setStates((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? emptyState()),
        ...patch,
      },
    }));
  }, []);

  const isCurrentRequest = useCallback((
    itemId: string,
    itemName: string,
    requestId: number
  ) => {
    const item = itemsRef.current.find(
      (candidate) => candidate.id === itemId
    );
    return (
      item !== undefined &&
      normalizeItemName(item.itemName) === itemName &&
      requestSequencesRef.current.get(itemId) === requestId
    );
  }, []);

  const requestSuggestions = useCallback(async (
    itemId: string,
    itemName: string
  ) => {
    const normalizedItemName = normalizeItemName(itemName);
    const requestId =
      (requestSequencesRef.current.get(itemId) ?? 0) + 1;
    requestSequencesRef.current.set(itemId, requestId);
    patchState(itemId, {
      loading: true,
      error: null,
      lastRequestedItemName: normalizedItemName,
      requestId,
      suggestions: [],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });

    try {
      const result = await recommendShipperHSCode(
        itemName,
        undefined,
        itemId
      );
      if (!isCurrentRequest(
        itemId,
        normalizedItemName,
        requestId
      )) return;

      patchState(itemId, {
        loading: false,
        suggestions: result.suggestions,
        additionalInformationRequired:
          result.additionalInformationRequired,
        requiredAdditionalInfo: result.requiredAdditionalInfo,
      });
    } catch {
      if (!isCurrentRequest(
        itemId,
        normalizedItemName,
        requestId
      )) return;

      patchState(itemId, {
        loading: false,
        suggestions: [],
        error:
          'HS Code 추천 요청에 실패했습니다. 잠시 후 다시 시도해주세요.',
        additionalInformationRequired: false,
        requiredAdditionalInfo: [],
      });
    }
  }, [isCurrentRequest, patchState]);

  useEffect(() => {
    const activeIds = new Set(items.map((item) => item.id));

    for (const [itemId, timer] of timersRef.current) {
      if (!activeIds.has(itemId)) {
        clearTimeout(timer);
        timersRef.current.delete(itemId);
      }
    }

    for (const itemId of observedNamesRef.current.keys()) {
      if (!activeIds.has(itemId)) {
        observedNamesRef.current.delete(itemId);
        requestSequencesRef.current.delete(itemId);
      }
    }

    setStates((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([itemId]) =>
          activeIds.has(itemId)
        )
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });

    for (const item of items) {
      const itemName = normalizeItemName(item.itemName);
      const requestItemName =
        item.itemName.trim().replace(/\s+/g, ' ');
      if (observedNamesRef.current.get(item.id) === itemName) {
        continue;
      }

      observedNamesRef.current.set(item.id, itemName);
      const previousTimer = timersRef.current.get(item.id);
      if (previousTimer) clearTimeout(previousTimer);

      const invalidatedRequestId =
        (requestSequencesRef.current.get(item.id) ?? 0) + 1;
      requestSequencesRef.current.set(
        item.id,
        invalidatedRequestId
      );
      patchState(item.id, {
        loading: false,
        suggestions: [],
        error: null,
        lastRequestedItemName: '',
        requestId: invalidatedRequestId,
        appliedSuggestionCode: null,
        additionalInformationRequired: false,
        requiredAdditionalInfo: [],
      });

      if (itemName.length < 3) continue;

      const timer = setTimeout(() => {
        timersRef.current.delete(item.id);
        void requestSuggestions(item.id, requestItemName);
      }, DEBOUNCE_MS);
      timersRef.current.set(item.id, timer);
    }
  }, [items, patchState, requestSuggestions]);

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
    requestSequencesRef.current.clear();
  }, []);

  const retry = useCallback((itemId: string) => {
    const item = itemsRef.current.find(
      (candidate) => candidate.id === itemId
    );
    if (!item) return;

    const normalizedItemName = normalizeItemName(item.itemName);
    if (normalizedItemName.length < 3) return;
    const requestItemName =
      item.itemName.trim().replace(/\s+/g, ' ');

    const timer = timersRef.current.get(itemId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(itemId);
    }
    void requestSuggestions(itemId, requestItemName);
  }, [requestSuggestions]);

  const markHSCodeManuallyEdited = useCallback(
    (itemId: string) => {
      patchState(itemId, {
        userEditedHSCode: true,
        appliedSuggestionCode: null,
      });
    },
    [patchState]
  );

  const markSuggestionApplied = useCallback((
    itemId: string,
    code: string
  ) => {
    patchState(itemId, {
      userEditedHSCode: false,
      appliedSuggestionCode: normalizeHSKCode(code),
    });
  }, [patchState]);

  const getState = useCallback(
    (itemId: string) => states[itemId] ?? emptyState(),
    [states]
  );

  return {
    getState,
    retry,
    markHSCodeManuallyEdited,
    markSuggestionApplied,
  };
}
