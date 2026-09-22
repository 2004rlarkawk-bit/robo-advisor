import { describe, it, expect } from 'vitest';
import {
  formatCbm,
  isSameCbmAtDocumentPrecision,
  packageDimensionCbm,
  totalPackageBoxes,
  totalPackageCbm,
} from './packageCbm';
import type { PackageDimension } from '../types';

const row = (overrides: Partial<PackageDimension> = {}): PackageDimension => ({
  id: 'dim-1', width: 45, length: 20, height: 41, boxes: 10, ...overrides,
});

describe('포장 규격 기반 CBM 계산', () => {
  it('cm 기준으로 가로×세로×높이×박스수÷1,000,000을 계산한다', () => {
    // 45 × 20 × 41 × 10 = 369,000 cm³ → 0.369 CBM
    expect(packageDimensionCbm(row(), 'cm')).toBeCloseTo(0.369, 6);
    expect(formatCbm(packageDimensionCbm(row(), 'cm')!)).toBe('0.369');
  });

  it('m·mm·inch도 cm로 환산해 같은 식으로 계산한다', () => {
    expect(packageDimensionCbm(row({ width: 0.45, length: 0.2, height: 0.41 }), 'm')).toBeCloseTo(0.369, 6);
    expect(packageDimensionCbm(row({ width: 450, length: 200, height: 410 }), 'mm')).toBeCloseTo(0.369, 6);
    // 1in = 2.54cm이므로 10×10×10in × 1박스 = 16,387.064 cm³
    expect(packageDimensionCbm(row({ width: 10, length: 10, height: 10, boxes: 1 }), 'inch'))
      .toBeCloseTo(0.016387, 6);
  });

  it('세 변이나 박스 수가 비어 있으면 계산하지 않는다', () => {
    expect(packageDimensionCbm(row({ height: '' }), 'cm')).toBeNull();
    expect(packageDimensionCbm(row({ boxes: '' }), 'cm')).toBeNull();
    expect(packageDimensionCbm(row({ width: 0 }), 'cm')).toBeNull();
  });

  it('중량은 CBM 계산에 영향을 주지 않는다 — 규격만으로 값이 정해진다', () => {
    const withWeightLikeFields = { ...row(), grossWeight: 2400, netWeight: 2200 } as PackageDimension;
    expect(packageDimensionCbm(withWeightLikeFields, 'cm')).toBe(packageDimensionCbm(row(), 'cm'));
  });

  it('규격이 다른 포장은 줄마다 계산해 합산한다', () => {
    const rows = [
      row({ id: 'a', width: 45, length: 20, height: 41, boxes: 5 }),   // 0.1845
      row({ id: 'b', width: 60, length: 40, height: 30, boxes: 3 }),   // 0.216
    ];
    expect(totalPackageCbm(rows, 'cm')).toBe(0.401);
    expect(totalPackageBoxes(rows)).toBe(8);
  });

  it('계산할 수 있는 줄이 없으면 총 CBM은 미산정(null)이다', () => {
    expect(totalPackageCbm([row({ width: '', length: '', height: '', boxes: '' })], 'cm')).toBeNull();
    expect(totalPackageCbm([], 'cm')).toBeNull();
  });

  it('박스 수만 적힌 줄은 박스 수 합계에는 들어간다', () => {
    expect(totalPackageBoxes([row({ width: '', height: '', boxes: 7 })])).toBe(7);
  });
});

describe('서류 기재값과 CBM 대조 — 서류 표기 자릿수로 반올림해 비교', () => {
  it('P/L에 0.35로 적혀 있으면 계산값 0.369(→0.37)는 불일치다', () => {
    expect(isSameCbmAtDocumentPrecision('0.35', 0.369)).toBe(false);
  });

  it('서류가 0.37이면 계산값 0.369는 일치로 본다', () => {
    expect(isSameCbmAtDocumentPrecision('0.37', 0.369)).toBe(true);
  });

  it('서류가 소수 1자리(0.4)면 계산값 0.369도 일치로 본다', () => {
    expect(isSameCbmAtDocumentPrecision('0.4', 0.369)).toBe(true);
  });

  it('단위 표기(M3·CBM)가 붙어 있어도 숫자만 비교한다', () => {
    expect(isSameCbmAtDocumentPrecision('0.369 M3', 0.369)).toBe(true);
    expect(isSameCbmAtDocumentPrecision('1.25 CBM', 1.25)).toBe(true);
  });

  it('정수로만 적힌 서류(1)는 계산값 1.4를 일치로, 1.6은 불일치로 본다', () => {
    expect(isSameCbmAtDocumentPrecision('1', 1.4)).toBe(true);
    expect(isSameCbmAtDocumentPrecision('1', 1.6)).toBe(false);
  });

  it('숫자가 없는 서류 값은 일치로 보지 않는다', () => {
    expect(isSameCbmAtDocumentPrecision('미기재', 0.369)).toBe(false);
  });
});
