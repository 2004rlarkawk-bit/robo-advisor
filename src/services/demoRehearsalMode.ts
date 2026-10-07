import type { HSCodeSuggestionResponse } from '../types/hsCodeSuggestion';

/**
 * 시연 모드 — 사이드바 고객지원센터 전화번호로 시연 데이터를 채우면 켜지고, '고객지원센터' 제목으로
 * 처음부터 다시 시작하면 꺼진다. 화면에는 아무 표시도 하지 않는다.
 *
 * 켜져 있는 동안에는 시연 시간이 늘 같도록 실시간 AI 호출을 건너뛴다.
 * - [AI 분석 실행]: AI 피드백 문장 생성을 건너뛴다(오류·서류는 고정 규칙이라 그대로 나온다).
 * - 품명 HS 추천: 아래 DEMO_HS_RESULTS에 저장해 둔 실제 AI 결과가 있으면 그 결과를 바로 쓴다.
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

/**
 * 시연 품명 → 미리 받아 둔 실제 AI HS 추천 결과.
 * 값이 null이면 아직 저장 전이라 시연 모드에서도 실시간으로 추천한다.
 * HS 추천 모델(GPT-5.5/5.6) 변경을 배포한 뒤 한 번 실시간으로 추천받고,
 * 개발자 도구에서 sessionStorage의 `portai:hs-last:wooden office desk` 값을 복사해 여기에 넣는다.
 */
export const DEMO_HS_RESULTS: Record<string, HSCodeSuggestionResponse | null> = {
  'wooden office desk': null,
};

/** 시연 모드이고 저장된 결과가 있으면 그 결과, 아니면 null(실시간 추천). */
export function demoHSResultFor(itemName: string): HSCodeSuggestionResponse | null {
  if (!isDemoRehearsalMode()) return null;
  return DEMO_HS_RESULTS[normalizeDemoItemName(itemName)] ?? null;
}

/** 실시간 추천 결과를 품명별로 남긴다 — 시연용 결과로 옮겨 담을 때 쓴다. */
export function rememberLiveHSResult(itemName: string, result: HSCodeSuggestionResponse): void {
  if (result.suggestions.length === 0) return;
  try {
    storage()?.setItem(LAST_HS_RESULT_KEY_PREFIX + normalizeDemoItemName(itemName), JSON.stringify(result));
  } catch {
    // 저장 실패는 무시 — 추천 자체에는 영향이 없다.
  }
}
