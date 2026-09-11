import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ShipperItem } from '../types';
import type {
  HSCodeItemDetails,
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
    disambiguation: null,
    chosenSubheading: null,
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
    itemName: string,
    chosenSubheading: string | null = null,
    itemDetails?: HSCodeItemDetails
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
      disambiguation: null,
      chosenSubheading,
    });

    try {
      const result = await recommendShipperHSCode(
        itemName,
        itemDetails,
        itemId,
        chosenSubheading
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
        disambiguation: result.disambiguation ?? null,
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
        disambiguation: null,
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
        disambiguation: null,
        chosenSubheading: null,
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

  /**
   * 되묻기 선택지에서 하나를 고르면 그 소호 범위로 다시 추천한다.
   *
   * nextItemName 을 주면 품명 입력칸이 그 값으로 바뀌는데, 그대로 두면
   * 품명 변경 감지 이펙트가 새 검색을 처음부터 다시 돌려 선택이 무효가 된다.
   * 그래서 바뀔 이름을 미리 관찰값에 등록해 재요청을 막는다.
   */
  const chooseSubheading = useCallback((
    itemId: string,
    subheading: string,
    nextItemName?: string
  ) => {
    const item = itemsRef.current.find(
      (candidate) => candidate.id === itemId
    );
    if (!item) return;
    const requestItemName = (nextItemName ?? item.itemName)
      .trim()
      .replace(/\s+/g, ' ');
    if (nextItemName) {
      observedNamesRef.current.set(
        itemId,
        normalizeItemName(nextItemName)
      );
    }
    const timer = timersRef.current.get(itemId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(itemId);
    }
    void requestSuggestions(itemId, requestItemName, subheading);
  }, [requestSuggestions]);

  /**
   * 상세 정보(재질·성별·용도 등)를 반영해 다시 추천한다.
   * 타이핑마다 자동 재검색하지 않고, 사용자가 버튼을 눌렀을 때만 호출한다.
   * nextItemName 을 주면 chooseSubheading 과 같은 이유로 관찰값에 먼저 등록해
   * 품명 변경 이펙트가 상세 없이 재검색해 결과를 덮어쓰지 않게 한다.
   */
  const recommendWithDetails = useCallback((
    itemId: string,
    itemDetails: HSCodeItemDetails,
    nextItemName?: string
  ) => {
    const item = itemsRef.current.find(
      (candidate) => candidate.id === itemId
    );
    if (!item) return;
    const requestItemName = (nextItemName ?? item.itemName)
      .trim()
      .replace(/\s+/g, ' ');
    if (normalizeItemName(requestItemName).length < 3) return;
    if (nextItemName) {
      observedNamesRef.current.set(
        itemId,
        normalizeItemName(nextItemName)
      );
    }
    const timer = timersRef.current.get(itemId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(itemId);
    }
    void requestSuggestions(itemId, requestItemName, null, itemDetails);
  }, [requestSuggestions]);

  const getState = useCallback(
    (itemId: string) => states[itemId] ?? emptyState(),
    [states]
  );

  return {
    getState,
    retry,
    chooseSubheading,
    recommendWithDetails,
    markHSCodeManuallyEdited,
    markSuggestionApplied,
  };
}
