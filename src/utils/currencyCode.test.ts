import { describe, expect, it } from 'vitest';
import { normalizeCurrencyCode } from './currencyCode';

describe('통화 표기를 ISO 코드로 맞추기', () => {
  it('상업송장에 흔한 달러 표기를 USD로 바꾼다', () => {
    expect(normalizeCurrencyCode('US$')).toBe('USD');
    expect(normalizeCurrencyCode('$')).toBe('USD');
    expect(normalizeCurrencyCode('us$')).toBe('USD');
    expect(normalizeCurrencyCode('U S $')).toBe('USD');
  });

  it('나라별 달러는 각자 코드로 구분한다 — 전부 USD로 뭉치면 환율이 틀린다', () => {
    expect(normalizeCurrencyCode('S$')).toBe('SGD');
    expect(normalizeCurrencyCode('HK$')).toBe('HKD');
    expect(normalizeCurrencyCode('A$')).toBe('AUD');
    expect(normalizeCurrencyCode('C$')).toBe('CAD');
  });

  it('기호·통칭도 코드로 바꾼다', () => {
    expect(normalizeCurrencyCode('€')).toBe('EUR');
    expect(normalizeCurrencyCode('¥')).toBe('JPY');
    expect(normalizeCurrencyCode('RMB')).toBe('CNY');
    expect(normalizeCurrencyCode('₩')).toBe('KRW');
    expect(normalizeCurrencyCode('DONG')).toBe('VND');
  });

  it('이미 올바른 코드는 그대로 둔다', () => {
    expect(normalizeCurrencyCode('USD')).toBe('USD');
    expect(normalizeCurrencyCode('vnd')).toBe('VND');
  });

  it('구두점이나 금액이 붙어 와도 코드만 남긴다', () => {
    expect(normalizeCurrencyCode('USD.')).toBe('USD');
    expect(normalizeCurrencyCode('(USD)')).toBe('USD');
    expect(normalizeCurrencyCode('USD 12,000')).toBe('USD');
  });

  it('빈 값은 빈 문자열', () => {
    expect(normalizeCurrencyCode('')).toBe('');
    expect(normalizeCurrencyCode(null)).toBe('');
    expect(normalizeCurrencyCode(undefined)).toBe('');
  });

  it('알 수 없는 표기는 USD로 단정하지 않는다 — 엉뚱한 환율로 세액을 계산하면 안 된다', () => {
    expect(normalizeCurrencyCode('머니')).not.toBe('USD');
  });
});
