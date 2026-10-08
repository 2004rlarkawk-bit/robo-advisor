import type { HSCodeSuggestionResponse } from '../types/hsCodeSuggestion';

/**
 * 시연 모드 — 사이드바 고객지원센터 전화번호로 시연 데이터를 채우면 켜지고, '고객지원센터' 제목으로
 * 처음부터 다시 시작하면 꺼진다. 화면에는 아무 표시도 하지 않는다.
 *
 * 켜져 있는 동안에는 시연 시간이 늘 같도록 실시간 AI 호출을 건너뛴다.
 * - [AI 분석 실행]: AI 피드백 문장 생성을 건너뛴다(오류·서류는 고정 규칙이라 그대로 나온다).
 * - 품명 HS 추천: 시연 품목(책상·desk)은 AI를 부르지 않는다 — 종류 선택지는 관세청 사전과 보조표로 바로 띄우고,
 *   '목재 · 사무실용'을 고르면(또는 'wooden office desk'처럼 처음부터 분명하면) 아래 고정 결과를 바로 보여 준다.
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
 * 시연 품목의 소호(6자리)별 고정 추천 결과 — 시연 시간이 늘 같도록 AI 호출 없이 보여 준다.
 * 코드·품명은 관세청 HSK 사전(public/data/hsCodes.json) 그대로다.
 */
export const DEMO_HS_RESULTS: Record<string, HSCodeSuggestionResponse | null> = {
  '940330': {
    suggestions: [
      {
        code: '9403301000',
        formattedCode: '9403.30-1000',
        koreanName: '책상',
        englishName: 'Desks',
        classificationName: '(가구)',
        reasoning: '목재로 만든 사무실용 가구는 9403.30에 분류되고, 그중 책상은 9403.30-1000으로 따로 나뉩니다. 입력하신 품목이 사무실에서 쓰는 목재 책상이라 이 코드가 맞습니다.',
        confidenceLabel: '높음',
        distinguishingFactors: ['소재: 목재', '용도: 사무실용', '품목: 책상'],
        missingInformation: [],
        matchedTerms: [
          { input: 'desk', condition: '책상(9403.30-1000)' },
          { input: '목재 · 사무실용', condition: '사무실용 목제가구(9403.30)' },
        ],
        source: 'openai-verified',
      },
      {
        code: '9403309000',
        formattedCode: '9403.30-9000',
        koreanName: '기타',
        englishName: 'Other',
        classificationName: '(가구)',
        reasoning: '책상이 아닌 사무실용 목재 가구(서랍장·캐비닛·회의용 테이블 등)일 때 이 코드를 씁니다.',
        confidenceLabel: '보통',
        distinguishingFactors: ['소재: 목재', '용도: 사무실용', '품목: 책상 외 가구'],
        missingInformation: [],
        matchedTerms: [],
        source: 'openai-verified',
      },
    ],
    additionalInformationRequired: false,
    requiredAdditionalInfo: [],
    disambiguation: null,
  },
};

/** 시연 모드의 시연 품목이고 그 소호의 고정 결과가 있으면 그 결과, 아니면 null(실시간 추천). */
export function demoHSResultFor(itemName: string, subheading: string | null | undefined): HSCodeSuggestionResponse | null {
  if (!subheading || !isDemoHSItem(itemName)) return null;
  return DEMO_HS_RESULTS[subheading] ?? null;
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
