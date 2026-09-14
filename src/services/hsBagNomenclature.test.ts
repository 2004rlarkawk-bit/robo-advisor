import { describe, it, expect } from 'vitest';
import {
  annotateBagNames,
  bagPrefixesForQuery,
} from './hsBagNomenclature';

describe('annotateBagNames', () => {
  it('같은 "기타" 품명도 여행가방·핸드백·배낭 소호로 구분되게 만든다', () => {
    const suitcase = annotateBagNames('4202121090', '기타', 'Other');
    const handbag = annotateBagNames('4202221090', '기타', 'Other');
    const rucksack = annotateBagNames('4202921090', '기타', 'Other');
    expect(new Set([suitcase.koreanName, handbag.koreanName, rucksack.koreanName]).size).toBe(3);
    expect(rucksack.koreanName).toContain('배낭');
    expect(rucksack.englishName).toContain('rucksacks');
  });

  it('외면 소재 기준을 함께 붙인다', () => {
    const textile = annotateBagNames('4202922000', '방직용 섬유재료로 만든 것', 'Of textile materials');
    expect(textile.koreanName).toContain('방직용 섬유');
    expect(annotateBagNames('4202911000', '가죽으로 만든 것', 'Of leather').koreanName).toContain('외면이 가죽');
  });

  it('보조표 밖이면 그대로 둔다', () => {
    expect(annotateBagNames('9608101000', '볼펜', 'Ball point pens'))
      .toEqual({ koreanName: '볼펜', englishName: 'Ball point pens' });
  });
});

describe('bagPrefixesForQuery', () => {
  it('배낭 단어를 4202.9x 소호로 잇는다 (직물·플라스틱 외면 우선)', () => {
    for (const query of ['backpack', 'Nylon Backpacks', 'back pack', 'rucksack', '등산용 배낭', '백팩']) {
      expect(bagPrefixesForQuery(query)[0]).toBe('420292');
    }
    expect(bagPrefixesForQuery('backpack')).toEqual(['420292', '420291', '420299']);
  });

  it('가방 품목 단어가 아니면 빈 배열', () => {
    expect(bagPrefixesForQuery('ballpoint pen')).toEqual([]);
    expect(bagPrefixesForQuery('packing tape')).toEqual([]);
  });
});
