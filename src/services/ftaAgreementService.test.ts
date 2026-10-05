import { describe, expect, it } from 'vitest';
import {
  assessFtaEligibility,
  buildFtaCandidate,
  findAgreementsForOrigin,
  ftaCountryCode,
  pickFtaRate,
} from './ftaAgreementService';
import type { TariffRate } from './unipassService';

const rate = (typeCode: string, typeName: string, value: number): TariffRate => ({
  hsCode: '0710400000', typeCode, typeName, rate: value, applyStart: '20260101', applyEnd: '20261231', source: 'api',
});
const basic = rate('A', '기본세율', 30);
const korus = rate('FUS1', '한·미 FTA협정세율', 0);
const wto = rate('C', 'WTO협정세율', 30);

describe('FTA 협정 찾기', () => {
  it('서류의 국가 표기를 협정 상대국으로 읽는다', () => {
    expect(ftaCountryCode('U.S.A.')).toBe('US');
    expect(ftaCountryCode('미국')).toBe('US');
    expect(findAgreementsForOrigin('United States').map((a) => a.name)).toEqual(['한·미 FTA']);
    expect(findAgreementsForOrigin('Germany').map((a) => a.name)).toEqual(['한·EU FTA']);
    expect(findAgreementsForOrigin('Viet Nam').map((a) => a.name)).toEqual(['한·베트남 FTA', '한·아세안 FTA', 'RCEP']);
  });

  it('협정이 없는 나라와 모르는 표기는 빈 목록이다', () => {
    expect(findAgreementsForOrigin('Brazil')).toEqual([]);
    expect(findAgreementsForOrigin('')).toEqual([]);
    expect(findAgreementsForOrigin('Korea')).toEqual([]);
  });

  it('관세율 행에서 세율구분코드 또는 세율구분명으로 협정세율을 고른다', () => {
    const agreements = findAgreementsForOrigin('USA');
    expect(pickFtaRate([basic, wto, korus], agreements)?.rate.rate).toBe(0);
    const byName = rate('ZZZ9', '한·미 FTA협정세율', 2);
    expect(pickFtaRate([basic, byName], agreements)?.rate.rate).toBe(2);
    expect(pickFtaRate([basic, wto], agreements)).toBeNull();
  });
});

describe('FTA 후보와 적용 가능성', () => {
  const item = { hsCode: '0710400000', rates: [basic, wto, korus], customsValue: 46_414_188, basicDuty: 13_924_256 };

  it('미국산 냉동 옥수수: 한·미 FTA 0%로 절감액을 낸다', () => {
    const candidate = buildFtaCandidate('U.S.A.', 'KOREA', [item]);
    expect(candidate.agreement).toBe('한·미 FTA');
    expect(candidate.rate).toBe(0);
    expect(candidate.duty).toBe(0);
    expect(candidate.savings).toBe(13_924_256);
    expect(candidate.coverage).toBe('all');
  });

  it('협정은 있는데 세율 행이 없으면 후보를 만들지 않고 확인 안내를 남긴다', () => {
    const candidate = buildFtaCandidate('USA', 'KOREA', [{ ...item, rates: [basic, wto] }]);
    expect(candidate.rate).toBeNull();
    expect(candidate.agreements).toEqual(['한·미 FTA']);
    expect(candidate.notes[0]).toContain('협정세율 행을 찾지 못했습니다');
  });

  it('원산지증명서가 없으면 "증빙 확인 필요"이고 세율을 반영하지 않는다', () => {
    const candidate = buildFtaCandidate('U.S.A.', 'KOREA', [item]);
    const result = assessFtaEligibility(candidate, { originCountry: 'U.S.A.', basicRate: 30, basicDuty: 13_924_256, hasCertificateOfOrigin: false, certificateMismatches: null });
    expect(result.status).toBe('needs-evidence');
    expect(result.label).toBe('FTA 적용 가능성 있음 · 증빙 확인 필요');
    expect(result.applyRate).toBe(false);
  });

  it('원산지증명서가 붙고 기재 정보가 맞으면 "적용 가능성 있음"이다', () => {
    const candidate = buildFtaCandidate('U.S.A.', 'KOREA', [item]);
    const result = assessFtaEligibility(candidate, { originCountry: 'U.S.A.', basicRate: 30, basicDuty: 13_924_256, hasCertificateOfOrigin: true, certificateMismatches: 0 });
    expect(result.status).toBe('possible');
    expect(result.applyRate).toBe(true);
    expect(result.checks[result.checks.length - 1].label).toBe('원산지 결정기준');
  });

  it('원산지증명서 기재가 다른 서류와 어긋나면 적용하지 않는다', () => {
    const candidate = buildFtaCandidate('U.S.A.', 'KOREA', [item]);
    const result = assessFtaEligibility(candidate, { originCountry: 'U.S.A.', basicRate: 30, basicDuty: 13_924_256, hasCertificateOfOrigin: true, certificateMismatches: 1 });
    expect(result.status).toBe('needs-evidence');
  });

  it('협정이 없는 나라는 "적용 대상 아님"이다', () => {
    const candidate = buildFtaCandidate('Brazil', 'KOREA', [item]);
    const result = assessFtaEligibility(candidate, { originCountry: 'Brazil', basicRate: 30, basicDuty: 13_924_256, hasCertificateOfOrigin: true, certificateMismatches: 0 });
    expect(result.status).toBe('not-applicable');
    expect(result.label).toBe('FTA 적용 대상 아님');
  });

  it('협정세율이 기본세율보다 낮지 않으면 실익 없음으로 본다', () => {
    const candidate = buildFtaCandidate('USA', 'KOREA', [{ ...item, rates: [basic, rate('FUS1', '한·미 FTA협정세율', 30)] }]);
    const result = assessFtaEligibility(candidate, { originCountry: 'USA', basicRate: 30, basicDuty: 13_924_256, hasCertificateOfOrigin: true, certificateMismatches: 0 });
    expect(result.status).toBe('not-applicable');
    expect(result.label).toBe('FTA 적용 실익 없음');
  });
});
