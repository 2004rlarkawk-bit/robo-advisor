import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  annotateProductNames,
  productDisambiguationForQuery,
  productPrefixesForQuery,
} from './hsProductScopes';
import { detectDisambiguation } from './shipperHSCodeSuggestionService';

type Row = [string, string, string, string, string, string];
const rows = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/hsCodes.json'), 'utf-8')) as Row[];
const tenDigit = rows.filter(([code]) => code.length === 10);

/** 추천 서비스가 색인으로 끌어오는 것과 같은 후보 — 관세청 사전의 실제 행을 쓴다. */
function candidatesFor(query: string) {
  const prefixes = productPrefixesForQuery(query);
  return tenDigit
    .filter(([code]) => prefixes.some((prefix) => code.startsWith(prefix)))
    .map(([code, ko, en]) => ({ code, ...annotateProductNames(code, ko, en) }));
}

const subheadingsFor = (query: string) =>
  detectDisambiguation(query, candidatesFor(query))?.options.map((option) => option.formattedSubheading) ?? null;

describe('흔한 품목 HS 보조표', () => {
  it('표에 적은 모든 소호가 관세청 사전에 실제로 있다', () => {
    const inDictionary = new Set(tenDigit.map(([code]) => code.slice(0, 6)));
    const queries = ['laptop', '공책', 'notebook', 'computer', 'desk', 'chair', 'pocket watch', 'watch', 'pencil', 'ballpoint pen'];
    for (const query of queries) {
      const prefixes = productPrefixesForQuery(query);
      expect(prefixes.length, query).toBeGreaterThan(0);
      for (const prefix of prefixes) expect(inDictionary.has(prefix), `${query} → ${prefix}`).toBe(true);
    }
  });

  it('시연 품목은 영문·한글 모두 제품 종류를 되묻는다', () => {
    expect(subheadingsFor('watch')).toEqual(['9102.11', '9102.12', '9102.19', '9102.21', '9102.29', '9101.11', '9101.19', '9101.21', '9101.29']);
    expect(subheadingsFor('시계')).toEqual(subheadingsFor('watch'));
    expect(subheadingsFor('desk')).toEqual(['9403.30', '9403.10', '9403.60', '9403.20', '9403.70', '9403.82', '9403.83', '9403.89']);
    expect(subheadingsFor('책상')).toEqual(subheadingsFor('desk'));
    expect(subheadingsFor('chair')).toEqual(['9401.39', '9401.71', '9401.79', '9401.61', '9401.69', '9401.80', '9401.31']);
    expect(subheadingsFor('의자')).toEqual(subheadingsFor('chair'));
    expect(subheadingsFor('computer')).toEqual(['8471.50', '8471.49', '8471.41', '8471.30']);
    expect(subheadingsFor('컴퓨터')).toEqual(subheadingsFor('computer'));
    expect(subheadingsFor('공책')).toEqual(['4820.10', '4820.20']);
  });

  it('"노트북"은 컴퓨터인지 공책인지 묻고, 컴퓨터라고 적으면 묻지 않는다', () => {
    expect(subheadingsFor('노트북')).toEqual(['8471.30', '4820.10', '4820.20']);
    expect(subheadingsFor('notebook')).toEqual(['8471.30', '4820.10', '4820.20']);
    expect(subheadingsFor('laptop')).toBeNull();
    expect(productPrefixesForQuery('laptop')).toEqual(['847130']);
    expect(productPrefixesForQuery('notebook computer')).toEqual(['847130']);
    expect(productPrefixesForQuery('노트북 컴퓨터')).toEqual(['847130']);
  });

  it('연필·볼펜은 소호가 하나라 묻지 않고 그 소호를 후보로 올린다', () => {
    expect(productPrefixesForQuery('pencil')).toEqual(['960910']);
    expect(productPrefixesForQuery('연필')).toEqual(['960910']);
    expect(productPrefixesForQuery('ballpoint pen')).toEqual(['960810']);
    expect(productPrefixesForQuery('ball pen')).toEqual(['960810']);
    expect(productPrefixesForQuery('볼펜')).toEqual(['960810']);
    expect(subheadingsFor('pencil')).toBeNull();
    expect(subheadingsFor('볼펜')).toBeNull();
  });

  it('검색어에 소재·방식이 있으면 그 범위로 좁힌다', () => {
    expect(subheadingsFor('wooden desk')).toEqual(['9403.30', '9403.60']);
    // "대나무"·"등나무" 안의 "나무"를 목재로 읽지 않는다.
    expect(productPrefixesForQuery('대나무 책상')).toEqual(['940382']);
    expect(productPrefixesForQuery('등나무 책상')).toEqual(['940383']);
    expect(productPrefixesForQuery('나무 책상')).toEqual(['940330', '940360']);
    expect(productPrefixesForQuery('glass desk')).toEqual(['940389']);
    expect(subheadingsFor('metal chair')).toEqual(['9401.71', '9401.79']);
    expect(subheadingsFor('office chair')).toEqual(['9401.39', '9401.31']);
    expect(productPrefixesForQuery('plastic chair')).toEqual(['940180']);
    expect(subheadingsFor('plastic chair')).toBeNull();
    expect(productPrefixesForQuery('digital watch')).toEqual(['910212']);
    // 선택지를 고른 뒤 들어간 품명으로 다시 물어도 같은 질문을 반복하지 않는다.
    expect(subheadingsFor('Digital Wrist Watch')).toBeNull();
    expect(subheadingsFor('Plastic Desk')).toBeNull();
  });

  it('본체가 아닌 것(부분품·다른 품목)에는 표를 쓰지 않는다', () => {
    const others = [
      'smart watch', 'stopwatch', 'watch band', 'watch case', 'wall clock', '스마트워치', '시계줄',
      'desk lamp', 'desk mat', 'chair cover', 'wheelchair', 'massage chair', '안마의자',
      'computer case', 'computer mouse', 'laptop bag', '노트북 가방', 'notebook case',
      'pencil case', 'mechanical pencil', '필통', '샤프', 'ballpoint pen refill', '볼펜심',
      'jacket', 'frozen hairtail',
    ];
    for (const query of others) expect(productPrefixesForQuery(query), query).toEqual([]);
    // "computer desk"는 컴퓨터가 아니라 책상이다.
    expect(productPrefixesForQuery('computer desk')).toContain('940330');
  });

  it('선택지를 고르면 들어가는 품명은 사전의 "Other"가 아니라 제품명이다', () => {
    for (const query of ['watch', 'desk', 'chair', 'computer', 'notebook', '공책']) {
      const result = productDisambiguationForQuery(query, candidatesFor(query).map((candidate) => candidate.code));
      expect(result, query).not.toBeNull();
      expect(result!.question.length, query).toBeGreaterThan(0);
      for (const option of result!.options) {
        expect(option.englishLabel, query).toMatch(/[A-Za-z]{3,}/);
        expect(option.englishLabel).not.toMatch(/^Other$/i);
        expect(option.candidateCount).toBeGreaterThan(0);
      }
    }
  });

  it('후보 품명에 분류 기준을 덧붙이고, 대상이 아니면 그대로 둔다', () => {
    expect(annotateProductNames('9102290000', '기타', 'Other').koreanName).toContain('손목시계');
    expect(annotateProductNames('9401399000', '기타', 'Other').englishName).toContain('swivel seats');
    expect(annotateProductNames('6203310000', '양모', 'Of wool')).toEqual({ koreanName: '양모', englishName: 'Of wool' });
  });
});

describe('productScopeExplanation — 추천 근거용 종류·달라지는 조건', () => {
  it('책상 9403.30은 목재·사무실용 선택지와, 금속·가정용 등 다른 소호를 함께 돌려준다', async () => {
    const { productScopeExplanation } = await import('./hsProductScopes');
    const scope = productScopeExplanation('Wooden Office Desk', '9403301000');
    expect(scope?.label).toBe('목재 · 사무실용');
    expect(scope?.ko).toBe('목재로 만든 사무실용 가구');
    expect(scope?.basis).toContain('소재와 사무실용 여부');
    expect(scope?.alternatives).toContainEqual({ label: '금속 · 사무실용', formattedSubheading: '9403.10' });
    expect(scope?.alternatives.map((alt) => alt.formattedSubheading)).not.toContain('9403.30');
  });

  it('보조표 밖 품목이면 null', async () => {
    const { productScopeExplanation } = await import('./hsProductScopes');
    expect(productScopeExplanation('Frozen fish', '0303890000')).toBeNull();
  });
});
