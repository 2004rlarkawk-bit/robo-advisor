import { describe, expect, it } from 'vitest';
import { loadPortEntries } from '../lib';
import {
  companyRelaxedEqual, dateEqual, judgeField, numericEqual, numericWithUnitEqual, parseDate, parseNumberWithUnit,
  portEqual, productTextEqual, resolvePortLocode, strictEqual,
} from '../normalize';

const ports = loadPortEntries('public/data/unlocodePorts.json');

describe('숫자·단위 정규화', () => {
  it('550.00 KG 와 550 KG 는 같다', () => {
    expect(numericWithUnitEqual('550 KG', null, '550.00 KG', { allowConversion: false })).toBe(true);
    expect(parseNumberWithUnit('550.00 KG')).toEqual({ value: 550, unit: 'KG' });
  });

  it('1,250 과 1250.00 은 같다', () => {
    expect(numericEqual('1,250', '1250.00')).toBe(true);
    expect(parseNumberWithUnit('1,250')).toEqual({ value: 1250, unit: null });
  });

  it('550, 550.00, 550 KG, 550.00 KG 는 숫자 비교에서 모두 같다', () => {
    for (const value of ['550', '550.00', '550 KG', '550.00 KG']) expect(numericEqual('550', value)).toBe(true);
  });

  it('0.55 MT 와 550 KG 는 환산을 허용할 때만 같다', () => {
    expect(numericWithUnitEqual('550', 'KG', '0.55 MT', { allowConversion: true })).toBe(true);
    expect(numericWithUnitEqual('550', 'KG', '0.55 MT', { allowConversion: false })).toBe(false);
  });

  it('G ↔ KG 환산, KGS 는 KG 별칭', () => {
    expect(numericWithUnitEqual('1.5', 'KG', '1500 G', { allowConversion: true })).toBe(true);
    expect(numericWithUnitEqual('550', 'KG', '550 KGS', { allowConversion: false })).toBe(true);
  });

  it('정답에 단위가 있는데 예측에 단위가 없거나 모르는 단위면 불일치', () => {
    expect(numericWithUnitEqual('550', 'KG', '550', { allowConversion: true })).toBe(false);
    expect(numericWithUnitEqual('550', 'KG', '550 CBM', { allowConversion: true })).toBe(false);
  });
});

describe('날짜 정규화', () => {
  it('2026-09-30 과 30 SEP 2026 은 같다', () => {
    expect(dateEqual('2026-09-30', '30 SEP 2026')).toBe(true);
  });

  it('SEP. 30, 2026 과 2026/09/30 은 같다', () => {
    expect(dateEqual('SEP. 30, 2026', '2026/09/30')).toBe(true);
  });

  it('불완전한 날짜는 임의로 채우지 않는다', () => {
    expect(parseDate('SEP 2026')).toBeNull();
    expect(parseDate('30 SEP')).toBeNull();
    expect(parseDate('2026-09')).toBeNull();
    expect(dateEqual('2026-09-01', 'SEP 2026')).toBe(false);
  });

  it('존재하지 않는 날짜·일월 순서가 모호한 숫자 날짜는 null', () => {
    expect(parseDate('2026-02-30')).toBeNull();
    expect(parseDate('09/10/2026')).toBeNull();
  });
});

describe('회사명 정규화', () => {
  it('ABC CO., LTD. 와 ABC CO LTD 는 relaxed 에서만 같다', () => {
    expect(companyRelaxedEqual('ABC CO., LTD.', 'ABC CO LTD')).toBe(true);
    expect(strictEqual('ABC CO., LTD.', 'ABC CO LTD')).toBe(false);
  });

  it('CORPORATION 과 CORP. 는 relaxed 에서 같다', () => {
    expect(companyRelaxedEqual('SAMPLE IMPORTS CORPORATION', 'Sample Imports Corp.')).toBe(true);
  });

  it('핵심 회사명이 다르면 relaxed 에서도 다르다', () => {
    expect(companyRelaxedEqual('ABC CO., LTD.', 'ABD CO., LTD.')).toBe(false);
    expect(companyRelaxedEqual('ABC TRADING CO LTD', 'ABC CO LTD')).toBe(false);
  });
});

describe('항구 정규화 (UN/LOCODE)', () => {
  it('Busan 과 Busan Port 는 같다', () => {
    expect(portEqual('Busan', 'Busan Port', ports)).toBe(true);
  });

  it('Busan Port 와 KRPUS 는 같다', () => {
    expect(portEqual('Busan Port', 'KRPUS', ports)).toBe(true);
  });

  it('Busan / Busan Port / BUSAN, KOREA / KRPUS 모두 KRPUS', () => {
    for (const value of ['Busan', 'Busan Port', 'BUSAN, KOREA', 'KRPUS']) expect(resolvePortLocode(value, ports)).toBe('KRPUS');
  });

  it('오타 추정(fuzzy)은 일치로 보지 않는다', () => {
    expect(resolvePortLocode('Busn', ports)).toBeNull();
  });
});

describe('품명 모드', () => {
  it('strict / punctuation_relaxed / core_text_contains 를 구분한다', () => {
    expect(productTextEqual('COTTON SHIRT', 'Cotton Shirt', 'strict')).toBe(false);
    expect(productTextEqual('COTTON SHIRT', 'Cotton-Shirt', 'punctuation_relaxed')).toBe(true);
    expect(productTextEqual('COTTON SHIRT', 'COTTON SHIRT, LIGHT GREEN', 'core_text_contains')).toBe(true);
    expect(productTextEqual('COTTON SHIRT', 'COTTON PANTS', 'core_text_contains')).toBe(false);
  });
});

describe('judgeField', () => {
  it('빈 값·"-"·N/A 는 누락으로 센다', () => {
    for (const value of ['', '-', 'N/A', null, undefined]) {
      expect(judgeField('strict', 'X', null, value)).toEqual({ missing: true, strict: false, normalized: false });
    }
  });

  it('strict 는 원문 일치, normalized 는 모드 규칙', () => {
    expect(judgeField('numeric', '1500', null, '1,500 PCS')).toEqual({ missing: false, strict: false, normalized: true });
    expect(judgeField('port_locode', 'Busan', null, 'KRPUS', { ports })).toEqual({ missing: false, strict: false, normalized: true });
  });
});
