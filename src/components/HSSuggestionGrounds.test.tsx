// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedHSCodeSuggestion } from '../types/hsCodeSuggestion';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { headingKoMock, hierarchyMock } = vi.hoisted(() => ({
  headingKoMock: vi.fn(),
  hierarchyMock: vi.fn(),
}));

vi.mock('../services/hsDataService', () => ({
  lookupHSHeadingKo: headingKoMock,
  lookupHSHierarchy: hierarchyMock,
}));

import HSSuggestionGrounds from './HSSuggestionGrounds';

const desk: VerifiedHSCodeSuggestion = {
  code: '9403301000',
  formattedCode: '9403.30-1000',
  koreanName: '책상',
  englishName: 'Desks',
  classificationName: '',
  reasoning: '목재로 만든 사무실용 책상이므로 9403.30 중 책상 코드에 해당해요.',
  confidenceLabel: '높음',
  source: 'openai-verified',
};

describe('HS 추천 근거 — 데이터로 조립한 부분', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    headingKoMock.mockResolvedValue('그 밖의 가구와 그 부분품');
    hierarchyMock.mockResolvedValue({ heading: 'Furniture; other', subheading: 'Furniture; wooden, of a kind used in offices' });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('1순위 후보는 해당 종류 → 분류 경로 → 코드가 달라지는 조건을 보여 준다', async () => {
    await act(async () => root.render(<HSSuggestionGrounds suggestion={desk} primary />));
    const text = container.textContent ?? '';
    expect(text).toContain('해당 종류');
    expect(text).toContain('목재 · 사무실용 — 목재로 만든 사무실용 가구');
    const path = [...container.querySelectorAll('.shipper-hs-path li')].map((li) => li.textContent);
    expect(path).toEqual([
      '9403 그 밖의 가구와 그 부분품',
      '9403.30 목재로 만든 사무실용 가구',
      '9403.30-1000 책상',
    ]);
    expect(text).toContain('가구는 소재와 사무실용 여부에 따라');
    expect(text).toContain('금속 · 사무실용 → 9403.10');
  });

  it('2순위 이하는 분류 경로만 보여 주고, 보조표에 없는 품목은 영문 소호 제목으로 채운다', async () => {
    headingKoMock.mockResolvedValue('');
    hierarchyMock.mockResolvedValue({ heading: 'Suits; men', subheading: 'Trousers; of wool' });
    const trousers: VerifiedHSCodeSuggestion = { ...desk, code: '6203310000', formattedCode: '6203.31-0000', koreanName: '양모' };
    await act(async () => root.render(<HSSuggestionGrounds suggestion={trousers} primary={false} />));
    const text = container.textContent ?? '';
    expect(text).not.toContain('해당 종류');
    expect(text).not.toContain('코드가 달라지는 조건');
    const path = [...container.querySelectorAll('.shipper-hs-path li')].map((li) => li.textContent);
    expect(path).toEqual(['6203 Suits; men', '6203.31 Trousers; of wool', '6203.31-0000 양모']);
  });
});
