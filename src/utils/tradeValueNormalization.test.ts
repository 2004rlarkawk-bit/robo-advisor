import { describe, expect, it } from 'vitest';
import { normalizeExportPortValue } from '../constants/ports';
import {
  areEquivalentTradeFieldValues,
  normalizeIncotermsCode,
  normalizePackageTypeValue,
} from './tradeValueNormalization';

describe('수출 자동입력 값 의미 정규화', () => {
  it.each(['Tokyo', 'Tokyo Port', 'TOKYO PORT', ' tokyo   port '])(
    '%s를 Tokyo Port로 정규화한다',
    (value) => expect(normalizeExportPortValue(value)).toBe('Tokyo Port'),
  );

  it('Port 유무와 대소문자만 다른 항만을 동일하게 판단한다', () => {
    expect(areEquivalentTradeFieldValues('dischargePort', 'Tokyo', 'TOKYO PORT')).toBe(true);
    expect(areEquivalentTradeFieldValues('loadPort', 'BUSAN', 'Busan Port')).toBe(true);
    expect(areEquivalentTradeFieldValues('loadPort', 'Busan Port', 'Incheon Port')).toBe(false);
  });

  it.each([
    ['Cartons', 'CARTON'], ['Boxes', 'BOX'], ['Pallets', 'PALLET'],
    ['Crates', 'CRATE'], ['Bags', 'BAG'], ['Drums', 'DRUM'],
    ['Bundles', 'BUNDLE'], ['Cases', 'CASE'], ['Pieces', 'PIECE'],
  ])('%s와 %s를 같은 포장종류로 판단한다', (plural, canonical) => {
    expect(normalizePackageTypeValue(plural)).toBe(canonical);
    expect(areEquivalentTradeFieldValues('packageType', plural, canonical)).toBe(true);
  });

  it('Incoterms 코드와 지정 장소를 분리해 비교한다', () => {
    expect(normalizeIncotermsCode('FOB Busan Port')).toBe('FOB');
    expect(areEquivalentTradeFieldValues('incoterms', 'FOB', 'FOB Busan Port')).toBe(true);
    expect(areEquivalentTradeFieldValues('incoterms', 'FOB', 'CIF Tokyo Port')).toBe(false);
  });

  it('일반 문자열은 공백과 대소문자만 다르면 동일하다', () => {
    expect(areEquivalentTradeFieldValues('companyName', '  ACME   Trading ', 'acme trading')).toBe(true);
  });
});
