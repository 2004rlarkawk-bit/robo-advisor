import type { HSCodeSuggestionResponse } from '../types/hsCodeSuggestion';

/**
 * 시연 모드 — 사이드바 고객지원센터 전화번호로 시연 데이터를 채우면 켜지고, '고객지원센터' 제목으로
 * 처음부터 다시 시작하면 꺼진다. 화면에는 아무 표시도 하지 않는다.
 *
 * 켜져 있는 동안에는 시연 시간이 늘 같도록 실시간 AI 호출을 건너뛴다.
 * - [AI 분석 실행]: AI 피드백 문장 생성을 건너뛴다(오류·서류는 고정 규칙이라 그대로 나온다).
 * - 품명 HS 추천: 시연 품목(책상·desk)의 종류 선택지는 분류 방향 AI 호출 없이 관세청 사전과 보조표로 띄운다.
 *   종류를 고른 뒤의 HS Code 추천은 그대로 AI가 실시간으로 한다.
 * 꺼져 있을 때(Q&A에서 즉석 입력)는 모두 실시간으로 돈다.
 *
 * 새로고침(배포 뒤 자동 새로고침 포함)해도 유지되도록 sessionStorage에 둔다 — 탭을 닫으면 꺼진다.
 */
const MODE_KEY = 'portai:demo-rehearsal';
/** 실시간으로 받은 HS 추천 결과를 품명별로 남겨 두는 자리 — 시연용 결과를 옮겨 담을 때 꺼내 쓴다. */
export const LAST_HS_RESULT_KEY_PREFIX = 'portai:hs-last:';

let memoryFlag = false;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function setDemoRehearsalMode(on: boolean): void {
  memoryFlag = on;
  try {
    if (on) storage()?.setItem(MODE_KEY, '1');
    else storage()?.removeItem(MODE_KEY);
  } catch {
    // 저장소를 못 써도 이 탭에서는 메모리 값으로 동작한다.
  }
}

export function isDemoRehearsalMode(): boolean {
  if (memoryFlag) return true;
  try {
    return storage()?.getItem(MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function normalizeDemoItemName(itemName: string): string {
  return itemName.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 시연 품목 — 책상. 램프·매트 같은 책상용 소품은 제외한다(hsProductScopes 책상 보조표와 같은 기준). */
const DEMO_HS_ITEM = /\bdesks?\b|책상/i;
const DEMO_HS_ITEM_EXCLUDE = /lamps?\b|mats?\b|pads?\b|organi[sz]ers?\b|calendars?\b|fans?\b|clocks?\b|스탠드|매트|패드|정리함|달력|선풍기|시계/i;

/** 시연 모드에서 시연 품목이면 true — 분류 방향 AI 호출을 건너뛰고 보조표로 바로 종류를 묻는다. */
export function isDemoHSItem(itemName: string): boolean {
  return isDemoRehearsalMode() && DEMO_HS_ITEM.test(itemName) && !DEMO_HS_ITEM_EXCLUDE.test(itemName);
}

/**
 * 시연 품목의 종류 선택지를 띄우기까지 기다리는 시간(ms).
 * AI 호출 없이 바로 띄우면 너무 빨라 오히려 어색해서, 실시간(AI 분류 방향 탐색)의 절반쯤으로 맞춘다.
 */
export const DEMO_DISAMBIGUATION_DELAY_MS = 4000;

/** 실시간 추천 결과를 품명별로 남긴다 — 시연용 결과로 옮겨 담을 때 쓴다. */
export function rememberLiveHSResult(itemName: string, result: HSCodeSuggestionResponse): void {
  if (result.suggestions.length === 0) return;
  try {
    storage()?.setItem(LAST_HS_RESULT_KEY_PREFIX + normalizeDemoItemName(itemName), JSON.stringify(result));
  } catch {
    // 저장 실패는 무시 — 추천 자체에는 영향이 없다.
  }
}
