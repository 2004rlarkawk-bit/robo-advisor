import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportItem } from '../types/importTrade';

const mocks = vi.hoisted(() => ({
  discover: vi.fn(),
  rank: vi.fn(),
  findByPrefix: vi.fn(),
  search: vi.fn(),
  lookup: vi.fn(),
  isOfficial: vi.fn(),
}));

vi.mock('./claudeService', () => ({
  discoverHSCodePrefixes: mocks.discover,
  suggestHSCodeFromCandidates: mocks.rank,
}));
vi.mock('./hsDataService', () => ({
  findTenDigitHSKByPrefix: mocks.findByPrefix,
  searchHSByKeyword: mocks.search,
  lookupHSByCode: mocks.lookup,
  isOfficialTenDigitHSK: mocks.isOfficial,
}));

import {
  INVALID_IMPORT_HSK_MESSAGE,
  recommendImportHSK,
  validateOfficialImportHSK,
} from './importHSCodeSuggestionService';

const official = (code: string, ko: string) => ({
  code,
  ko,
  en: ko === '데님의 것' ? 'Of denim' : 'Other',
  qtyUnit: 'U',
  wtUnit: 'KG',
  category: '(직물제 의류)',
});

function item(overrides: Partial<ImportItem> = {}): ImportItem {
  return {
    id: 'item-1',
    description: "Women's Cotton Trousers",
    koreanDescription: '여성용 면 바지',
    documentHSCode: '6204.62',
    confirmedHSCode: '',
    modelName: '',
    specification: '',
    material: 'Cotton',
    composition: '',
    fabricConstruction: 'woven',
    productForm: 'trousers',
    processingState: 'finished',
    gender: 'women',
    intendedUse: 'clothing',
    originCountry: 'China',
    quantity: '10',
    quantityUnit: 'PCS',
    unitPrice: '10',
    currency: 'USD',
    amount: '100',
    sourceDocumentIds: ['ci-1'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockResolvedValue([]);
  mocks.discover.mockResolvedValue({
    suggestedPrefixes: [],
    additionalInformationRequired: false,
    requiredAdditionalInfo: [],
  });
  mocks.rank.mockResolvedValue({
    suggestions: [],
    additionalInformationRequired: false,
    requiredAdditionalInfo: [],
  });
  mocks.lookup.mockImplementation(async (code: string) => {
    if (code === '6204621000') return official(code, '데님의 것');
    if (code === '6204629000') return official(code, '기타');
    if (code === '6109100000') return official(code, '면으로 만든 것');
    return null;
  });
});

describe('수입 대한민국 HSK 추천', () => {
  it('문서 6204.62의 공식 하위 후보 밖 코드를 추천하지 않는다', async () => {
    mocks.findByPrefix.mockResolvedValue([
      official('6204621000', '데님의 것'),
      official('6204629000', '기타'),
    ]);
    mocks.rank.mockResolvedValue({
      suggestions: [
        { code: '6204621000', description: 'AI 설명', confidence: '높음', reasoning: '데님 바지 후보' },
        { code: '9999999999', description: '가짜', confidence: '높음', reasoning: '허용되지 않은 코드' },
      ],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });

    const result = await recommendImportHSK(item());

    expect(mocks.findByPrefix).toHaveBeenCalledWith('620462', 30);
    expect(result.suggestions.map(({ code }) => code)).toEqual(['6204621000']);
    expect(result.suggestions.every(({ code }) => code.startsWith('620462'))).toBe(true);
  });

  it('문서 HS가 없으면 상품정보 검색과 공식 접두 확장으로 후보를 만든다', async () => {
    mocks.search.mockResolvedValue([{ ...official('6109100000', '면으로 만든 것'), score: 8, formattedCode: '6109.10-0000' }]);
    mocks.discover.mockResolvedValue({
      suggestedPrefixes: ['610910'],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    mocks.findByPrefix.mockResolvedValue([official('6109100000', '면으로 만든 것')]);
    mocks.rank.mockResolvedValue({
      suggestions: [{ code: '6109100000', description: '면 티셔츠', confidence: '높음', reasoning: '면 티셔츠 상품정보' }],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });

    const result = await recommendImportHSK(item({ documentHSCode: '', description: 'Cotton T-shirts' }));

    expect(mocks.discover).toHaveBeenCalled();
    expect(result.suggestions[0].code).toBe('6109100000');
  });

  it('AI가 허용 후보 밖 코드만 반환하면 폐기하고 공식 후보로 폴백한다', async () => {
    mocks.findByPrefix.mockResolvedValue([
      official('6204621000', '데님의 것'),
      official('6204629000', '기타'),
    ]);
    mocks.rank.mockResolvedValue({
      suggestions: [{ code: '9999999999', description: '가짜', confidence: '높음', reasoning: '가짜' }],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });

    const result = await recommendImportHSK(item());

    expect(result.suggestions.map(({ code }) => code)).toEqual(['6204621000', '6204629000']);
    expect(result.suggestions.every(({ source }) => source === 'official_hsk_fallback')).toBe(true);
  });

  it('정보가 부족해 AI가 선택하지 못해도 공식 후보와 추가 확인 정보를 표시한다', async () => {
    mocks.findByPrefix.mockResolvedValue([
      official('6204621000', '데님의 것'),
      official('6204629000', '기타'),
    ]);

    const result = await recommendImportHSK(item({
      composition: '', fabricConstruction: '', productForm: '', gender: '', intendedUse: '',
    }));

    expect(result.suggestions).toHaveLength(2);
    expect(result.requiredAdditionalInfo).toEqual(expect.arrayContaining([
      '직물/편물 여부', '정확한 섬유 성분비', '제품 형태',
    ]));
  });
});

describe('수입 HSK 직접 입력 검증', () => {
  it('공식 목록에 없는 숫자 10자리 코드를 확정하지 않는다', async () => {
    mocks.isOfficial.mockResolvedValue(false);

    await expect(validateOfficialImportHSK('9999999999')).resolves.toEqual({
      valid: false,
      normalizedCode: '9999999999',
      error: INVALID_IMPORT_HSK_MESSAGE,
    });
  });
});
