// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { HSCodeSuggestionResponse } from '../types/hsCodeSuggestion';
import {
  DEMO_HS_RESULTS,
  LAST_HS_RESULT_KEY_PREFIX,
  demoHSResultFor,
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
    DEMO_HS_RESULTS['wooden office desk'] = null;
    window.sessionStorage.clear();
  });

  it('전화번호로 켜고 처음부터 다시 시작하면 꺼진다', () => {
    expect(isDemoRehearsalMode()).toBe(false);
    setDemoRehearsalMode(true);
    expect(isDemoRehearsalMode()).toBe(true);
    setDemoRehearsalMode(false);
    expect(isDemoRehearsalMode()).toBe(false);
  });

  it('시연 모드이고 저장된 결과가 있을 때만 그 결과를 쓴다 — 품명 대소문자·공백은 무시', () => {
    DEMO_HS_RESULTS['wooden office desk'] = saved;
    // 꺼져 있으면(Q&A) 실시간 추천
    expect(demoHSResultFor('Wooden Office Desk')).toBeNull();
    setDemoRehearsalMode(true);
    expect(demoHSResultFor('  wooden   OFFICE desk ')).toBe(saved);
    // 다른 품명은 시연 모드여도 실시간
    expect(demoHSResultFor('Steel Bolt')).toBeNull();
  });

  it('저장 결과가 아직 없으면 시연 모드여도 실시간으로 추천한다', () => {
    setDemoRehearsalMode(true);
    expect(demoHSResultFor('Wooden Office Desk')).toBeNull();
  });

  it('실시간 결과를 품명별로 남겨 시연용 결과로 옮겨 담을 수 있다', () => {
    rememberLiveHSResult('Wooden Office Desk', saved);
    expect(JSON.parse(window.sessionStorage.getItem(`${LAST_HS_RESULT_KEY_PREFIX}wooden office desk`) ?? 'null')).toEqual(saved);
    // 빈 결과는 남기지 않는다.
    rememberLiveHSResult('Nothing', { ...saved, suggestions: [] });
    expect(window.sessionStorage.getItem(`${LAST_HS_RESULT_KEY_PREFIX}nothing`)).toBeNull();
  });
});
