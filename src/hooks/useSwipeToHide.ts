import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** 행을 이만큼 왼쪽으로 밀고 놓으면 숨긴다. */
export const SWIPE_HIDE_PX = 140;
/** 행이 따라 움직이는 최대 거리 */
const SWIPE_MAX_PX = 240;

function readHidden(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return new Set(raw ? JSON.parse(raw) as string[] : []);
  } catch {
    return new Set();
  }
}

/**
 * 목록 행을 꾹 누른 채 왼쪽으로 밀어 숨긴다.
 * DB의 거래는 그대로 두고 이 브라우저·이 사용자의 목록에서만 숨긴다 — 상대방 쪽 의뢰·대화를 건드리지 않게.
 * 숨긴 id는 storageKey로 남아 새로고침해도 유지되고, restoreAll로 한 번에 되돌린다.
 * 버튼·입력칸 위에서 시작한 드래그와 세로 스크롤은 밀기로 보지 않는다.
 */
export function useSwipeToHide(storageKey: string) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => readHidden(storageKey));
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; dx: number; active: boolean } | null>(null);
  // 밀기를 끝낸 직후의 click은 행 선택으로 처리하지 않는다.
  const swipedRef = useRef(false);

  // 계정을 바꾸면(같은 브라우저에서 화주·포워더 전환) 그 사용자의 숨김 목록을 다시 읽는다.
  useEffect(() => { setHiddenIds(readHidden(storageKey)); }, [storageKey]);

  const save = useCallback((next: Set<string>) => {
    setHiddenIds(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* 저장 실패는 무시 */ }
  }, [storageKey]);

  const restoreAll = useCallback(() => save(new Set()), [save]);
  const restore = useCallback((id: string) => {
    const next = new Set(hiddenIds);
    next.delete(id);
    save(next);
  }, [hiddenIds, save]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a, input, label, select')) return;
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, dx: 0, active: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      // 세로 스크롤과 구분 — 가로로 확실히 움직였을 때만 밀기로 본다.
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
      drag.active = true;
    }
    drag.dx = Math.max(Math.min(dx, 0), -SWIPE_MAX_PX);
    setSwipe({ id: drag.id, dx: drag.dx });
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setSwipe(null);
    if (!drag?.active) return;
    swipedRef.current = true;
    if (drag.dx <= -SWIPE_HIDE_PX) save(new Set(hiddenIds).add(drag.id));
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setSwipe(null);
  };

  /** 행 click 처리 앞에서 부른다 — 방금 민 행이면 true를 돌려주고 플래그를 지운다. */
  const consumeSwipeClick = () => {
    const swiped = swipedRef.current;
    swipedRef.current = false;
    return swiped;
  };

  const rowProps = (id: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => onPointerDown(event, id),
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  });

  return {
    hiddenIds,
    swipe,
    isArmed: (id: string) => swipe?.id === id && swipe.dx <= -SWIPE_HIDE_PX,
    rowProps,
    restore,
    restoreAll,
    consumeSwipeClick,
  };
}
