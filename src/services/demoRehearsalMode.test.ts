// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { HSCodeSuggestionResponse } from '../types/hsCodeSuggestion';
import {
  LAST_HS_RESULT_KEY_PREFIX,
  isDemoHSItem,
  isDemoRehearsalMode,
  rememberLiveHSResult,
  setDemoRehearsalMode,
} from './demoRehearsalMode';

const saved: HSCodeSuggestionResponse = {
  suggestions: [{
    code: '9403301000', formattedCode: '9403.30-1000', koreanName: '책상', englishName: 'Desks',
    classificationName: '(가구)', reasoning: '사무실용 목제 가구(9403.30) 중 책상에 해당해요.',
    confidenceLabel: '높음', source: 'openai-verified',
  }],
  additionalInformationRequired: false,
  requiredAdditionalInfo: [],
};

describe('시연 모드', () => {
  afterEach(() => {
    setDemoRehearsalMode(false);
    window.sessionStorage.clear();
  });

  it('전화번호로 켜고 처음부터 다시 시작하면 꺼진다', () => {
    expect(isDemoRehearsalMode()).toBe(false);
    setDemoRehearsalMode(true);
    expect(isDemoRehearsalMode()).toBe(true);
    setDemoRehearsalMode(false);
    expect(isDemoRehearsalMode()).toBe(false);
  });

  it('시연 모드에서 책상(desk)만 시연 품목으로 본다 — 책상용 소품·다른 품명은 실시간', () => {
    expect(isDemoHSItem('desk')).toBe(false);
    setDemoRehearsalMode(true);
    expect(isDemoHSItem('desk')).toBe(true);
    expect(isDemoHSItem('Wooden Office Desk')).toBe(true);
    expect(isDemoHSItem('desk lamp')).toBe(false);
    expect(isDemoHSItem('Steel Bolt')).toBe(false);
  });

  it('실시간 결과를 품명별로 남긴다', () => {
    rememberLiveHSResult('Wooden Office Desk', saved);
    expect(JSON.parse(window.sessionStorage.getItem(`${LAST_HS_RESULT_KEY_PREFIX}wooden office desk`) ?? 'null')).toEqual(saved);
    // 빈 결과는 남기지 않는다.
    rememberLiveHSResult('Nothing', { ...saved, suggestions: [] });
    expect(window.sessionStorage.getItem(`${LAST_HS_RESULT_KEY_PREFIX}nothing`)).toBeNull();
  });
});
