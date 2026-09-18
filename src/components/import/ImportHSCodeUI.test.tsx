// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeImportAnalysisResult } from '../../services/importDocumentAnalysisService';
import ImportTradeFlow from './ImportTradeFlow';

const validateMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/importHSCodeSuggestionService', () => ({
  recommendImportHSKForItems: vi.fn().mockResolvedValue([]),
  validateOfficialImportHSK: validateMock,
}));
vi.mock('../../hooks/useFormDataDraft', () => ({
  useFormDataDraft: () => ({
    isHydrated: true,
    saveStatus: 'saved',
    lastSavedAt: null,
    flushDraft: vi.fn(),
    completeDraft: vi.fn(),
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const cacheKey = 'portai_import_draft:user-1:shipper';
let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(cacheKey, JSON.stringify({
    step: 2,
    documents: [],
    analysis: normalizeImportAnalysisResult({
      extracted: {
        items: [{
          id: 'item-1',
          description: "Women's Cotton Trousers",
          documentHSCode: '6204.62',
          confirmedHSCode: '',
        }],
      },
    }),
    suggestions: [{
      itemId: 'item-1',
      code: '6204621000',
      description: '데님의 것',
      reasoning: '공식 후보',
      confidence: 0.85,
      missingInformation: ['정확한 섬유 성분비'],
      source: 'official_hsk_ai_ranked',
    }, {
      itemId: 'item-1',
      code: '6204629000',
      description: '기타',
      reasoning: '차순위 후보',
      confidence: 0.65,
      source: 'official_hsk_ai_ranked',
    }],
    selectedCode: '',
    duty: null,
    dutyError: '',
    risks: [],
    cargo: null,
    arrivalNotice: null,
    generatedAt: null,
  }));
  validateMock.mockResolvedValue({
    valid: false,
    normalizedCode: '9999999999',
    error: '대한민국 HSK 10자리 코드가 아니거나 현재 관세청 HSK 목록에 존재하지 않는 코드입니다.',
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ImportTradeFlow
        role="shipper"
        userId="user-1"
        onGenerate={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
  });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  localStorage.clear();
  vi.clearAllMocks();
});

describe('수입-화주 대한민국 HSK UI', () => {
  it('해외 문서 코드는 참고용으로 표시하고 문서값 확정 버튼을 제공하지 않는다', () => {
    expect(container?.textContent).toContain('해외 문서 HS Code');
    expect(container?.textContent).toContain('대한민국 HSK 자동추천');
    expect(container?.textContent).not.toContain('문서값을 최종 확정');
  });

  it('후보를 고정 퍼센트가 아니라 추천 순위로 보여주고 안내문은 한 번만 표시한다', () => {
    const text = container?.textContent ?? '';
    expect(text).toContain('추천 1순위');
    expect(text).toContain('추천 2순위');
    expect(text).not.toContain('추천 신뢰도');
    expect(text).not.toMatch(/8[0-9]%|6[0-9]%|5[0-9]%/);

    const notes = container!.querySelectorAll('.import-hs-rank-note');
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain('최종 품목분류는 사용자 또는 전문가의 확인이 필요합니다');

    // 안내문은 후보 목록 뒤, '추가 확인 정보' 앞에 온다.
    const list = container!.querySelector('.hs-suggestion-list')!;
    const additional = container!.querySelector('.import-hs-additional')!;
    expect(list.compareDocumentPosition(notes[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notes[0].compareDocumentPosition(additional) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('순위 표기로 바뀌어도 추천 후보 선택·저장은 그대로 동작한다', () => {
    const radios = container!.querySelectorAll<HTMLInputElement>('.hs-suggestion input[type="radio"]');
    expect(radios).toHaveLength(2);
    act(() => { radios[1].click(); });
    expect(JSON.parse(localStorage.getItem(cacheKey)!).analysis.extracted.items[0].confirmedHSCode).toBe('6204629000');
  });

  it('공식 목록에 없는 직접 입력은 오류를 표시하고 confirmedHSCode를 변경하지 않는다', async () => {
    const input = container?.querySelector<HTMLInputElement>('input[placeholder="숫자 10자리"]');
    expect(input).not.toBeNull();
    act(() => {
      input!.value = '9999999999';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const button = Array.from(container!.querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.includes('직접 입력 확정'));
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('관세청 HSK 목록에 존재하지 않는 코드');
    expect(JSON.parse(localStorage.getItem(cacheKey)!).analysis.extracted.items[0].confirmedHSCode).toBe('');
  });
});
