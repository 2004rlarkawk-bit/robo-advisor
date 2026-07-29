import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  searchMock,
  lookupMock,
  discoverPrefixesMock,
  suggestFromCandidatesMock,
} = vi.hoisted(() => ({
  searchMock: vi.fn(),
  lookupMock: vi.fn(),
  discoverPrefixesMock: vi.fn(),
  suggestFromCandidatesMock: vi.fn(),
}));

vi.mock('./hsDataService', () => ({
  searchHSByKeyword: searchMock,
  lookupHSByCode: lookupMock,
  formatCode: (code: string) =>
    `${code.slice(0, 4)}.${code.slice(4, 6)}-${code.slice(6)}`,
}));

vi.mock('./claudeService', () => ({
  discoverHSCodePrefixes: discoverPrefixesMock,
  suggestHSCodeFromCandidates: suggestFromCandidatesMock,
}));

import {
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

  it('코드 정규화가 선행 0을 보존한다', () => {
    expect(normalizeHSKCode('0101.21-1000')).toBe('0101211000');
  });
});
