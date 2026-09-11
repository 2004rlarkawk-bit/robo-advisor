import { describe, expect, it } from 'vitest';
import { parseTradeNumber } from './number';

describe('parseTradeNumber', () => {
  it.each([
    ['1200', 1200],
    ['1,200', 1200],
    ['1,200 KG', 1200],
    ['850.0 kg', 850],
    ['850 KGS', 850],
    ['USD 8,000.50', 8000.5],
    ['USD8,000', 8000],
    ['KRW 10000', 10000],
    ['-5', -5],
    ['10 x 20', 10],
  ])('서류 표기 %j → %j', (input, expected) => {
    expect(parseTradeNumber(input)).toBe(expected);
  });

  it.each([
    ['1.25 M3', 1.25],
    ['1.25M3', 1.25],
    ['M3 1.25', 1.25],
    ['1.25 ㎥', 1.25],
    ['12 M2', 12],
  ])('단위 지수(M3·㎡)를 숫자에 붙이지 않는다: %j → %j', (input, expected) => {
    expect(parseTradeNumber(input)).toBe(expected);
  });

  it.each(['', '   ', '-', '—', 'N/A', '미기재', 'not stated'])('숫자가 없으면 null: %j', (input) => {
    expect(parseTradeNumber(input)).toBeNull();
  });

  it('숫자 타입은 그대로, 숫자가 아닌 타입은 null', () => {
    expect(parseTradeNumber(42)).toBe(42);
    expect(parseTradeNumber(Number.NaN)).toBeNull();
    expect(parseTradeNumber(undefined)).toBeNull();
    expect(parseTradeNumber(null)).toBeNull();
  });
});
