import { describe, expect, it } from 'vitest';
import { calcExportFobValue, parseKrwInput } from './exportFobValueService';

// 송장 10,000 USD · 환율 1,300원/USD · 운임 1,000,000원 · 보험료 100,000원
const base = { invoiceAmount: 10000, rate: 1300, freightKrw: 1_000_000, insuranceKrw: 100_000 };

describe('수출신고서용 FOB 환산액(참고)', () => {
  it('FOB는 송장 총액 × 환율', () => {
    expect(calcExportFobValue({ ...base, incoterms: 'FOB' })).toMatchObject({ status: 'fob', fobKrw: 13_000_000, invoiceKrw: 13_000_000 });
  });

  it('CFR은 운임을 뺀다', () => {
    expect(calcExportFobValue({ ...base, incoterms: 'CFR' })).toMatchObject({ status: 'fob', fobKrw: 12_000_000, freightKrw: 1_000_000, insuranceKrw: null });
  });

  it('CIF는 운임과 보험료를 뺀다', () => {
    expect(calcExportFobValue({ ...base, incoterms: 'cif' })).toMatchObject({ status: 'fob', fobKrw: 11_900_000 });
  });

  it('CFR 운임 누락, CIF 보험료 누락은 계산을 보류한다 (빈칸을 0원으로 보지 않는다)', () => {
    expect(calcExportFobValue({ ...base, incoterms: 'CFR', freightKrw: '' })).toMatchObject({
      status: 'pending', missing: ['freightKrw'], reason: '국제운임을 입력하면 FOB 기준 환산액을 확인할 수 있어요.',
    });
    const cif = calcExportFobValue({ ...base, incoterms: 'CIF', insuranceKrw: '' });
    expect(cif).toMatchObject({ status: 'pending' });
    expect(cif).toMatchObject({ missing: ['insuranceKrw'], reason: '국제운임과 보험료를 입력하면 FOB 기준 환산액을 확인할 수 있어요.' });
    expect(calcExportFobValue({ ...base, incoterms: 'CIF', freightKrw: undefined, insuranceKrw: null })).toMatchObject({ status: 'pending' });
  });

  it('사용자가 명시한 0원은 미입력과 구분해 계산한다', () => {
    expect(calcExportFobValue({ ...base, incoterms: 'CIF', insuranceKrw: 0 })).toMatchObject({ status: 'fob', fobKrw: 12_000_000, insuranceKrw: 0 });
  });

  it('잘못된 환율·송장금액은 숫자 대신 확인 안내', () => {
    expect(calcExportFobValue({ ...base, incoterms: 'FOB', rate: 0 })).toMatchObject({ status: 'invalid', invoiceKrw: null });
    expect(calcExportFobValue({ ...base, incoterms: 'FOB', rate: Number.NaN })).toMatchObject({ status: 'invalid' });
    expect(calcExportFobValue({ ...base, incoterms: 'FOB', invoiceAmount: '' })).toMatchObject({ status: 'invalid' });
  });

  it('음수·숫자 아닌 비용, 차감 후 0 이하는 확인 안내', () => {
    expect(calcExportFobValue({ ...base, incoterms: 'CFR', freightKrw: -1 })).toMatchObject({ status: 'invalid' });
    expect(calcExportFobValue({ ...base, incoterms: 'CFR', freightKrw: '백만원' })).toMatchObject({ status: 'invalid' });
    expect(calcExportFobValue({ ...base, incoterms: 'CIF', freightKrw: 13_000_000 })).toMatchObject({ status: 'invalid' });
  });

  it('FCA·FAS 등 미지원 조건은 FOB로 간주하지 않는다', () => {
    const fca = calcExportFobValue({ ...base, incoterms: 'FCA' });
    expect(fca).toMatchObject({ status: 'unsupported', invoiceKrw: 13_000_000 });
    expect(fca).not.toHaveProperty('fobKrw');
    expect(calcExportFobValue({ ...base, incoterms: 'FAS' }).status).toBe('unsupported');
  });

  it('조건을 바꾸면 다시 계산되고 입력한 원본 값은 바뀌지 않는다', () => {
    const input = { ...base, incoterms: 'CIF' };
    const snapshot = { ...input };
    expect(calcExportFobValue(input)).toMatchObject({ fobKrw: 11_900_000 });
    expect(calcExportFobValue({ ...input, incoterms: 'FOB' })).toMatchObject({ fobKrw: 13_000_000 });
    expect(input).toEqual(snapshot);
  });

  it('비용 입력 파싱: 빈칸은 empty, 쉼표 허용', () => {
    expect(parseKrwInput('')).toEqual({ kind: 'empty' });
    expect(parseKrwInput('  ')).toEqual({ kind: 'empty' });
    expect(parseKrwInput('1,000,000')).toEqual({ kind: 'value', value: 1_000_000 });
    expect(parseKrwInput(0)).toEqual({ kind: 'value', value: 0 });
    expect(parseKrwInput('abc')).toEqual({ kind: 'invalid' });
  });
});
