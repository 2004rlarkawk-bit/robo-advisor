import { describe, it, expect } from 'vitest';
import {
  annotateApparelNames,
  apparelPrefixesForQuery,
  apparelScopeOf,
  composeApparelGoodsName,
} from './hsApparelNomenclature';

describe('apparelScopeOf', () => {
  it('성별과 소재를 호·소호에서 읽는다', () => {
    expect(apparelScopeOf('6202301000')?.shortKo).toBe('여성용 · 면');
    expect(apparelScopeOf('6201201000')?.shortKo).toBe('남성용 · 양모');
  });

  it('재킷처럼 소호가 품목 종류까지 정하면 함께 표시한다', () => {
    expect(apparelScopeOf('6203320000')?.shortKo).toBe('남성용 · 재킷 · 면');
  });

  it('가죽 의류는 소재가 호로 정해진다', () => {
    expect(apparelScopeOf('4203101020')?.shortKo).toBe('가죽');
  });

  it('보조표 밖의 코드는 null', () => {
    expect(apparelScopeOf('9608101000')).toBeNull();
  });
});

describe('annotateApparelNames', () => {
  it('같은 공식 품명도 분류 기준으로 구분되게 만든다', () => {
    const base = '오버코트ㆍ레인코트ㆍ카코트ㆍ케이프ㆍ클록과 이와 유사한 의류';
    const men = annotateApparelNames('6201201000', base, 'Overcoats');
    const women = annotateApparelNames('6202301000', base, 'Overcoats');
    expect(men.koreanName).not.toBe(women.koreanName);
    expect(women.englishName).toContain("women's or girls'");
    expect(women.englishName).toContain('cotton');
  });

  it('보조표 밖이면 그대로 둔다', () => {
    expect(annotateApparelNames('9608101000', '볼펜', 'Ball point pens'))
      .toEqual({ koreanName: '볼펜', englishName: 'Ball point pens' });
  });
});

describe('composeApparelGoodsName', () => {
  it('성별·소재·품목으로 영문 품명을 만든다', () => {
    expect(composeApparelGoodsName('6201201000', 'coat')).toBe("Men's Wool Coat");
    expect(composeApparelGoodsName('6202301000', 'coat')).toBe("Women's Cotton Coat");
    expect(composeApparelGoodsName('4203101020', 'jacket')).toBe('Leather Jacket');
  });

  it('소호가 품목을 정하면 사용자 단어 대신 그 품목을 쓴다', () => {
    expect(composeApparelGoodsName('6203320000', 'blazer')).toBe("Men's Cotton Jacket");
  });

  it('기타 섬유는 소재를 생략한다', () => {
    expect(composeApparelGoodsName('6201901000', 'coat')).toBe("Men's Coat");
  });
});

describe('apparelPrefixesForQuery', () => {
  it('사전 품명에 없는 재킷 소호를 끌어온다', () => {
    const prefixes = apparelPrefixesForQuery('jacket');
    expect(prefixes).toContain('620332');
    expect(prefixes).toContain('620432');
    expect(prefixes).toContain('420310');
  });

  it('한글 품목 단어도 인식한다', () => {
    expect(apparelPrefixesForQuery('가죽 자켓')).toContain('420310');
    expect(apparelPrefixesForQuery('여성 코트')).toContain('6202');
  });

  it('의류가 아니면 빈 배열', () => {
    expect(apparelPrefixesForQuery('ballpoint pen')).toEqual([]);
  });
});
