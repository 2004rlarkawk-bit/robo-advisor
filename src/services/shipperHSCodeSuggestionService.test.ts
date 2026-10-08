import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  searchMock,
  lookupMock,
  prefixMock,
  hierarchyMock,
  titleSearchMock,
  discoverPrefixesMock,
  suggestFromCandidatesMock,
} = vi.hoisted(() => ({
  searchMock: vi.fn(),
  lookupMock: vi.fn(),
  prefixMock: vi.fn(),
  hierarchyMock: vi.fn(),
  titleSearchMock: vi.fn(),
  discoverPrefixesMock: vi.fn(),
  suggestFromCandidatesMock: vi.fn(),
}));

vi.mock('./hsDataService', () => ({
  searchHSByKeyword: searchMock,
  lookupHSByCode: lookupMock,
  findTenDigitHSKByPrefix: prefixMock,
  lookupHSHierarchy: hierarchyMock,
  searchHSHeadingsByKeyword: titleSearchMock,
  formatCode: (code: string) =>
    `${code.slice(0, 4)}.${code.slice(4, 6)}-${code.slice(6)}`,
}));

vi.mock('./claudeService', () => ({
  discoverHSCodePrefixes: discoverPrefixesMock,
  suggestHSCodeFromCandidates: suggestFromCandidatesMock,
}));

import {
  isSearchableItemName,
  normalizeHSKCode,
  recommendShipperHSCode,
} from './shipperHSCodeSuggestionService';

const localTenDigit = {
  code: '0101211000',
  ko: '농가 사육용',
  en: 'For farm breeding',
  qtyUnit: 'U',
  wtUnit: 'KG',
  category: '(말)',
  formattedCode: '0101.21-1000',
  score: 8,
};

beforeEach(() => {
  searchMock.mockReset();
  lookupMock.mockReset();
  prefixMock.mockReset();
  prefixMock.mockResolvedValue([]);
  hierarchyMock.mockReset();
  hierarchyMock.mockResolvedValue({ heading: '', subheading: '' });
  titleSearchMock.mockReset();
  titleSearchMock.mockResolvedValue([]);
  discoverPrefixesMock.mockReset();
  discoverPrefixesMock.mockResolvedValue({
    suggestedPrefixes: [],
    additionalInformationRequired: false,
    requiredAdditionalInfo: [],
  });
  suggestFromCandidatesMock.mockReset();
});

describe('수출 화주 HS Code 추천 서비스', () => {
  it('로컬 검색은 10자리 관세청 후보를 AI에 전달하는 용도로만 사용한다', async () => {
    searchMock.mockResolvedValue([
      { ...localTenDigit, code: '0207603' },
      localTenDigit,
    ]);
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [{
        code: '0101.21-1000',
        description: 'AI 설명',
        confidence: '높음',
        reasoning: '사육 목적 정보와 후보 설명이 일치',
      }],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    lookupMock.mockResolvedValue(localTenDigit);

    const result = await recommendShipperHSCode('농가 사육용 말');

    expect(suggestFromCandidatesMock).toHaveBeenCalledWith(
      '농가 사육용 말',
      [{
        code: '0101211000',
        koreanName: '농가 사육용',
        englishName: 'For farm breeding',
        classificationName: '(말)',
      }],
      undefined,
    );
    expect(result.suggestions).toEqual([{
      code: '0101211000',
      formattedCode: '0101.21-1000',
      koreanName: '농가 사육용',
      englishName: 'For farm breeding',
      classificationName: '(말)',
      reasoning: '사육 목적 정보와 후보 설명이 일치',
      confidenceLabel: '높음',
      distinguishingFactors: [],
      missingInformation: [],
      matchedTerms: [],
      source: 'openai-verified',
    }]);
  });

  it('AI가 보류하면 문자열 검색 후보를 최종 추천으로 대신 표시하지 않는다', async () => {
    searchMock.mockResolvedValue([localTenDigit]);
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [],
      additionalInformationRequired: true,
      requiredAdditionalInfo: ['제품 용도', '완제품/부분품 여부'],
    });

    const result = await recommendShipperHSCode('산업용 제품');

    expect(result).toEqual({
      suggestions: [],
      disambiguation: null,
      additionalInformationRequired: true,
      requiredAdditionalInfo: ['제품 용도', '완제품/부분품 여부'],
    });
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('후보 밖·실제 데이터에 없는 코드는 제거하고 보통 후보도 검증한다', async () => {
    const second = {
      ...localTenDigit,
      code: '0101219000',
      formattedCode: '0101.21-9000',
    };
    searchMock.mockResolvedValue([localTenDigit, second]);
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [
        { code: '9999999999', description: '', confidence: '높음', reasoning: '후보 밖' },
        { code: '0101211000', description: '', confidence: '보통', reasoning: '근거 부족' },
        { code: '0101219000', description: '', confidence: '높음', reasoning: '존재하지 않음' },
      ],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    lookupMock.mockResolvedValue(null);

    const result = await recommendShipperHSCode('상세한 테스트 품목');

    expect(result.suggestions).toEqual([]);
    expect(result.additionalInformationRequired).toBe(true);
    expect(lookupMock).toHaveBeenCalledTimes(2);
  });

  it('보통 후보와 추가정보 필요 상태를 동시에 유지한다', async () => {
    searchMock.mockResolvedValue([localTenDigit]);
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [{
        code: '0101211000',
        description: '농가 사육용 말',
        confidence: '보통',
        reasoning: '용도에 따라 달라질 수 있는 관련 후보',
        distinguishingFactors: ['농가 사육용'],
        missingInformation: ['실제 사육 목적'],
      }],
      additionalInformationRequired: true,
      requiredAdditionalInfo: ['실제 사육 목적'],
    });
    lookupMock.mockResolvedValue(localTenDigit);

    const result = await recommendShipperHSCode('사육용 말');

    expect(result.suggestions).toEqual([{
      code: '0101211000',
      formattedCode: '0101.21-1000',
      koreanName: '농가 사육용',
      englishName: 'For farm breeding',
      classificationName: '(말)',
      reasoning: '용도에 따라 달라질 수 있는 관련 후보',
      confidenceLabel: '보통',
      distinguishingFactors: ['농가 사육용'],
      missingInformation: ['실제 사육 목적'],
      matchedTerms: [],
      source: 'openai-verified',
    }]);
    expect(result.additionalInformationRequired).toBe(true);
    expect(result.requiredAdditionalInfo).toEqual(['실제 사육 목적']);
  });

  it('OpenAI 호출 실패 시 로컬 후보로 폴백하지 않고 오류를 전달한다', async () => {
    searchMock.mockResolvedValue([localTenDigit]);
    suggestFromCandidatesMock.mockRejectedValue(new Error('network'));

    await expect(
      recommendShipperHSCode('농가 사육용 말')
    ).rejects.toThrow('network');
  });

  it('배낭은 사전 품명에 없어도 4202.9x 소호를 먼저 끌어와 소호 기준을 붙여 AI에 넘긴다', async () => {
    const textileRucksack = {
      ...localTenDigit,
      code: '4202922000',
      ko: '방직용 섬유재료로 만든 것',
      en: 'Of textile materials',
      category: '(직물제 가방)',
      formattedCode: '4202.92-2000',
    };
    searchMock.mockResolvedValue([]);
    prefixMock.mockImplementation(async (prefix: string) =>
      prefix === '420292' ? [textileRucksack] : []
    );
    // AI 방향을 먼저 보존하면서 배낭 색인 소호도 함께 확장한다.
    discoverPrefixesMock.mockResolvedValue({
      suggestedPrefixes: ['4202'],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [],
      additionalInformationRequired: true,
      requiredAdditionalInfo: ['외면 소재'],
    });

    await recommendShipperHSCode('backpack');

    expect(prefixMock.mock.calls.map(([prefix]) => prefix))
      .toEqual(['4202', '420292', '420291', '420299']);
    const [, candidates] = suggestFromCandidatesMock.mock.calls[0];
    expect(candidates).toEqual([
      expect.objectContaining({
        code: '4202922000',
        koreanName: expect.stringContaining('배낭'),
      }),
    ]);
  });

  it('넓은 호로 확장해도 뒤쪽 소호가 잘리지 않게 소호별로 번갈아 담는다', async () => {
    const entry = (code: string) => ({
      ...localTenDigit,
      code,
      ko: '기타',
      en: 'Other',
      category: '',
      formattedCode: code,
    });
    // 앞쪽 소호 4202.11에만 40건, 맨 뒤 소호 4202.92는 1건 — 앞에서 자르면 4202.92가 빠진다.
    const crowded = Array.from({ length: 40 }, (_, index) =>
      entry(`420211${String(index).padStart(4, '0')}`)
    );
    searchMock.mockResolvedValue([]);
    prefixMock.mockImplementation(async (prefix: string) =>
      prefix === '4202' ? [...crowded, entry('4202921090')] : []
    );
    discoverPrefixesMock.mockResolvedValue({
      suggestedPrefixes: ['4202'],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [],
      additionalInformationRequired: true,
      requiredAdditionalInfo: [],
    });

    await recommendShipperHSCode('travel goods');

    const [, candidates] = suggestFromCandidatesMock.mock.calls[0];
    expect(candidates).toHaveLength(30);
    expect(candidates.map((candidate: { code: string }) => candidate.code))
      .toContain('4202921090');
  });

  it('AI 방향을 보조표보다 먼저 확장하고 최대 60개 후보를 전달한다', async () => {
    const entries = Array.from({ length: 61 }, (_, index) => ({
      ...localTenDigit,
      code: `610333${String(index).padStart(4, '0')}`,
    }));
    searchMock.mockResolvedValue([]);
    prefixMock.mockImplementation(async (prefix: string) =>
      prefix === '610333' ? entries : []
    );
    discoverPrefixesMock.mockResolvedValue({
      suggestedPrefixes: ['610333'],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });

    await recommendShipperHSCode('knitted jacket', { fabricConstruction: 'knitted' });

    expect(prefixMock.mock.calls[0][0]).toBe('610333');
    const [, candidates] = suggestFromCandidatesMock.mock.calls[0];
    expect(candidates).toHaveLength(60);
    expect(candidates[59].code).toBe('6103330059');
    expect(candidates.some(({ code }: { code: string }) => code === '6103330060')).toBe(false);
  });

  it('상세 정보의 용도를 반영해 주방용 목제 가구 후보를 선택한다', async () => {
    const kitchenCabinet = { ...localTenDigit, code: '9403409000' };
    searchMock.mockResolvedValue([]);
    prefixMock.mockImplementation(async (prefix: string) =>
      prefix === '940340' ? [kitchenCabinet] : []
    );
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });

    await recommendShipperHSCode('Wooden Cabinet', { intendedUse: 'kitchen' });

    expect(discoverPrefixesMock).not.toHaveBeenCalled();
    expect(prefixMock.mock.calls.map(([prefix]) => prefix)).toEqual(['940340']);
    expect(suggestFromCandidatesMock.mock.calls[0][1]).toEqual([
      expect.objectContaining({ code: '9403409000' }),
    ]);
  });

  it('AI에 넘기는 후보에만 호·소호 제목을 덧붙인다', async () => {
    searchMock.mockResolvedValue([localTenDigit]);
    hierarchyMock.mockResolvedValue({
      heading: 'Horses, asses, mules and hinnies; live',
      subheading: 'Horses; live, pure-bred breeding animals',
    });
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [],
      additionalInformationRequired: true,
      requiredAdditionalInfo: [],
    });

    await recommendShipperHSCode('농가 사육용 말');

    const [, candidates] = suggestFromCandidatesMock.mock.calls[0];
    expect(candidates[0].koreanName).toBe('농가 사육용');
    expect(candidates[0].classificationName).toBe(
      '(말) / HS 0101.21: Horses; live, pure-bred breeding animals / HS 0101: Horses, asses, mules and hinnies; live'
    );
    expect(candidates[0].classificationName.length).toBeLessThanOrEqual(300);
  });

  it('상위 3개는 서로 다른 6자리 소호를 먼저 채우고, 모자라면 같은 소호로 채운다', async () => {
    const entry = (code: string) => ({ ...localTenDigit, code, formattedCode: code });
    // 7117.19 아래 10자리 3개 + 7117.90 1개 — AI는 같은 소호를 연달아 1·2·3순위로 낸다.
    const codes = ['7117191000', '7117192000', '7117199000', '7117909000'];
    searchMock.mockResolvedValue(codes.map(entry));
    lookupMock.mockImplementation(async (code: string) => entry(code));
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: codes.map((code) => ({ code, description: '', confidence: '높음', reasoning: '근거' })),
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });

    const result = await recommendShipperHSCode('imitation jewelry necklace');

    // 서로 다른 소호(7117.19, 7117.90)가 먼저, 남은 자리는 같은 소호 다음 순위로 채운다.
    expect(result.suggestions.map((s) => s.code)).toEqual(['7117191000', '7117909000', '7117192000']);
  });

  it('실제 파이프라인 단계와 5개 방향 요청을 기록한다', async () => {
    searchMock.mockResolvedValue([localTenDigit]);
    lookupMock.mockResolvedValue(localTenDigit);
    discoverPrefixesMock.mockResolvedValue({
      suggestedPrefixes: ['010121'],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [{ code: localTenDigit.code, confidence: '높음', reasoning: '근거' }],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    const onTrace = vi.fn();

    await recommendShipperHSCode('farm breeding horses', {}, undefined, null, {
      discoveryPrefixLimit: 5,
      onTrace,
    });

    expect(discoverPrefixesMock).toHaveBeenCalledWith('farm breeding horses', [], {}, 5);
    expect(onTrace.mock.calls.map(([trace]) => trace.stage))
      .toEqual(['direction', 'expanded', 'transmitted', 'decision', 'final']);
    expect(onTrace.mock.calls[0][0].codes).toEqual(['010121']);
    expect(onTrace.mock.calls[2][0].codes).toEqual([localTenDigit.code]);
  });

  it('최종 AI가 보류해도 검증된 1차 방향 후보를 확인 필요 상태로 함께 보여준다', async () => {
    const entry = { ...localTenDigit, code: '7117191000' };
    searchMock.mockResolvedValue([entry]);
    lookupMock.mockResolvedValue(entry);
    discoverPrefixesMock.mockResolvedValue({
      suggestedPrefixes: ['711719'],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: [],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });

    const result = await recommendShipperHSCode('brooch pin', {});

    expect(result.suggestions.map(({ code }) => code)).toEqual(['7117191000']);
    expect(result.suggestions[0].confidenceLabel).toBe('보통');
    expect(result.suggestions[0].missingInformation).not.toHaveLength(0);
    expect(result.additionalInformationRequired).toBe(true);
  });

  it.each([true, false])('첫 방향 대체 후보의 검증 성공=%s일 때만 세 번째 추천을 교체한다', async (valid) => {
    const codes = ['9403609000', '9403209000', '9403899000', '4421999000'];
    const entry = (code: string) => ({ ...localTenDigit, code, category: '' });
    searchMock.mockResolvedValue(codes.map(entry));
    lookupMock.mockImplementation(async (code: string) => code === codes[3] && !valid ? null : entry(code));
    discoverPrefixesMock.mockResolvedValue({
      suggestedPrefixes: ['442199'],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    suggestFromCandidatesMock.mockResolvedValue({
      suggestions: codes.slice(0, 3).map((code) => ({ code, confidence: '높음', reasoning: '근거' })),
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });

    const result = await recommendShipperHSCode('decorative article', {});

    expect(result.suggestions.map(({ code }) => code))
      .toEqual(valid ? [codes[0], codes[1], codes[3]] : codes.slice(0, 3));
  });

  it('한글은 2글자부터, 영문은 3글자부터 검색 대상으로 본다', () => {
    expect(isSearchableItemName('백팩')).toBe(true);
    expect(isSearchableItemName('라면')).toBe(true);
    expect(isSearchableItemName('팩')).toBe(false);
    expect(isSearchableItemName('ab')).toBe(false);
    expect(isSearchableItemName('bag')).toBe(true);
  });

  it('코드 정규화가 선행 0을 보존한다', () => {
    expect(normalizeHSKCode('0101.21-1000')).toBe('0101211000');
  });
});

describe('시연 모드 — 책상(desk) 종류 선택지는 분류 방향 AI 없이 띄운다', () => {
  it('종류 선택지는 보조표로 조금 기다렸다 띄우고, 종류를 고른 뒤 추천은 AI가 한다', async () => {
    const { setDemoRehearsalMode } = await import('./demoRehearsalMode');
    setDemoRehearsalMode(true);
    vi.useFakeTimers();
    try {
      searchMock.mockResolvedValue([]);
      prefixMock.mockImplementation(async (prefix: string) => [
        { ...localTenDigit, code: `${prefix}1000`, ko: '책상', en: 'Desks', category: '(가구)' },
      ]);

      const pending = recommendShipperHSCode('desk');
      let settled = false;
      void pending.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(1000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(4000);
      const first = await pending;
      expect(discoverPrefixesMock).not.toHaveBeenCalled();
      expect(suggestFromCandidatesMock).not.toHaveBeenCalled();
      expect(first.disambiguation?.options.map((option) => option.subheading)).toContain('940330');

      suggestFromCandidatesMock.mockResolvedValue({ suggestions: [], additionalInformationRequired: false, requiredAdditionalInfo: [] });
      await recommendShipperHSCode('desk', undefined, undefined, '940330');
      expect(suggestFromCandidatesMock).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      setDemoRehearsalMode(false);
    }
  });
});
