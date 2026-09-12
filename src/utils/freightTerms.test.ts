import { describe, it, expect } from 'vitest';
import { deriveFreightTerms, isFreightTermsUnusual } from './freightTerms';

describe('deriveFreightTerms', () => {
  it('매도인이 주운송비를 부담하는 조건은 PREPAID', () => {
    expect(deriveFreightTerms('CIF')).toBe('PREPAID');
    expect(deriveFreightTerms('CFR')).toBe('PREPAID');
    expect(deriveFreightTerms('DDP')).toBe('PREPAID');
  });

  it('매수인이 주운송비를 부담하는 조건은 COLLECT', () => {
    expect(deriveFreightTerms('FOB')).toBe('COLLECT');
    expect(deriveFreightTerms('EXW')).toBe('COLLECT');
    expect(deriveFreightTerms('FCA')).toBe('COLLECT');
  });

  it('소문자·공백도 정규화한다', () => {
    expect(deriveFreightTerms(' cif ')).toBe('PREPAID');
  });

  it('미입력·미지원 조건은 빈 값', () => {
    expect(deriveFreightTerms('')).toBe('');
    expect(deriveFreightTerms('XXX')).toBe('');
  });
});

describe('isFreightTermsUnusual', () => {
  it('원칙과 어긋나면 true', () => {
    expect(isFreightTermsUnusual('CIF', 'COLLECT')).toBe(true);
    expect(isFreightTermsUnusual('FOB', 'PREPAID')).toBe(true);
  });

  it('원칙과 맞으면 false', () => {
    expect(isFreightTermsUnusual('CIF', 'PREPAID')).toBe(false);
  });

  it('값이 없거나 판단 불가면 false', () => {
    expect(isFreightTermsUnusual('CIF', '')).toBe(false);
    expect(isFreightTermsUnusual('XXX', 'PREPAID')).toBe(false);
  });
});
