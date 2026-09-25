import { describe, expect, it } from 'vitest';
import { formatKstDate, formatKstDateSpaced, formatKstDateTime, toValidDate } from './formatDate';

describe('formatKstDate', () => {
  it('ISO 시각을 한국 시간 날짜로 찍는다', () => {
    expect(formatKstDate('2026-09-25T05:30:00Z')).toBe('2026.09.25');
  });

  it('UTC 기준 전날 늦은 밤도 한국에서는 다음 날이다', () => {
    // 09-24 15:00Z = 09-25 00:00 KST. 실행 환경 시간대와 무관하게 25일이어야 한다.
    expect(formatKstDate('2026-09-24T15:00:00Z')).toBe('2026.09.25');
  });

  it('값이 없으면 1970이 아니라 fallback', () => {
    expect(formatKstDate(null)).toBe('-');
    expect(formatKstDate(undefined)).toBe('-');
    expect(formatKstDate('')).toBe('-');
    expect(formatKstDate('   ')).toBe('-');
  });

  it('날짜가 아닌 문자열도 fallback', () => {
    expect(formatKstDate('미정')).toBe('-');
  });

  it('fallback은 호출 쪽에서 정할 수 있다', () => {
    expect(formatKstDate(null, '미정')).toBe('미정');
  });

  it('한 자리 월·일은 0을 채운다', () => {
    expect(formatKstDate('2026-01-05T04:00:00Z')).toBe('2026.01.05');
  });
});

describe('formatKstDateTime', () => {
  it('날짜와 분까지 찍되 연도를 빠뜨리지 않는다', () => {
    expect(formatKstDateTime('2026-09-25T05:30:00Z')).toBe('2026.09.25 14:30');
  });

  it('자정은 24시가 아니라 00시', () => {
    expect(formatKstDateTime('2026-09-24T15:00:00Z')).toBe('2026.09.25 00:00');
  });

  it('정오는 12시', () => {
    expect(formatKstDateTime('2026-09-25T03:00:00Z')).toBe('2026.09.25 12:00');
  });

  it('값이 없으면 fallback', () => {
    expect(formatKstDateTime(null)).toBe('-');
  });
});

describe('formatKstDateSpaced', () => {
  it('서식 칸 표기', () => {
    expect(formatKstDateSpaced('2026-09-25T05:30:00Z')).toBe('2026. 09. 25');
  });

  it('Date 객체도 받는다', () => {
    expect(formatKstDateSpaced(new Date('2026-09-25T05:30:00Z'))).toBe('2026. 09. 25');
  });

  it('값이 없으면 fallback', () => {
    expect(formatKstDateSpaced('', '')).toBe('');
  });
});

describe('toValidDate', () => {
  it('null·빈 문자열·잘못된 값은 null', () => {
    expect(toValidDate(null)).toBeNull();
    expect(toValidDate('')).toBeNull();
    expect(toValidDate('어제')).toBeNull();
    expect(toValidDate(new Date('nope'))).toBeNull();
  });

  it('유효한 값은 Date', () => {
    expect(toValidDate('2026-09-25T00:00:00Z')?.toISOString()).toBe('2026-09-25T00:00:00.000Z');
  });
});
