import { describe, it, expect } from 'vitest';
import {
  cbmDecimalsFor,
  normalizeCbm,
  formatCbm,
  MAX_CBM_DECIMALS,
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
    // 합계는 반올림하지 않고 그대로 두고, 서류 표기할 때만 0.401로 적는다.
    expect(totalPackageCbm(rows, 'cm')).toBe(0.4005);
    expect(formatCbm(totalPackageCbm(rows, 'cm')!)).toBe('0.401');
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

describe('작은 화물도 0으로 뭉개지 않는다', () => {
  it('1×1×11cm 2박스는 0.000이 아니라 0.000022로 계산된다', () => {
    const rows = [row({ width: 1, length: 1, height: 11, boxes: 2 })];
    expect(totalPackageCbm(rows, 'cm')).toBe(0.000022);
    expect(formatCbm(totalPackageCbm(rows, 'cm')!)).toBe('0.000022');
  });

  it('소수 3자리로 값이 남는 화물은 실무 표기대로 3자리를 유지한다', () => {
    expect(formatCbm(0.3)).toBe('0.300');
    expect(formatCbm(0.192)).toBe('0.192');
    expect(formatCbm(0.001)).toBe('0.001');
  });

  it('3자리로 0이 되는 값만 자릿수를 늘리고, 뒤에 붙는 0은 떼어낸다', () => {
    expect(formatCbm(0.000001)).toBe('0.000001');
    expect(formatCbm(0.0004)).toBe('0.0004');
    expect(cbmDecimalsFor(0.3)).toBe(3);
    expect(cbmDecimalsFor(0.000022)).toBe(6);
  });

  it('자릿수를 늘려도 한계는 둔다 — 0과 음수는 기본 표기로 돌린다', () => {
    expect(cbmDecimalsFor(0)).toBe(3);
    expect(formatCbm(0)).toBe('0.000');
    expect(cbmDecimalsFor(1e-30)).toBe(MAX_CBM_DECIMALS);
  });

  it('작은 값도 서류 기재값과 자릿수 기준으로 대조된다', () => {
    expect(isSameCbmAtDocumentPrecision('0.000022', 0.000022)).toBe(true);
    expect(isSameCbmAtDocumentPrecision('0.000030', 0.000022)).toBe(false);
  });

  it('3자리 반올림 경계값(0.0009995)은 0.001로 적는다', () => {
    expect(cbmDecimalsFor(0.0009995)).toBe(3);
    expect(formatCbm(0.0009995)).toBe('0.001');
    expect(formatCbm(0.0004999)).toBe('0.0005');
  });

  it('9자리로도 0이 되는 극소 부피는 0이 아니라 표기 가능한 최솟값으로 적는다', () => {
    expect(formatCbm(0.0000000004)).toBe('0.000000001');
    expect(formatCbm(1e-30)).toBe('0.000000001');
    // 부피가 0인 경우에만 0으로 적는다.
    expect(formatCbm(0)).toBe('0.000');
  });
});

describe('내부 보관값 정리 — 부동소수 찌꺼기만 털고 정밀도는 지킨다', () => {
  it('부동소수 오차는 털어낸다', () => {
    expect(normalizeCbm(0.1 + 0.2)).toBe(0.3);
    expect(normalizeCbm(0.4005)).toBe(0.4005);
  });

  it('작지만 의미 있는 값은 자릿수를 깎지 않는다', () => {
    expect(normalizeCbm(0.000000123456)).toBe(0.000000123456);
    expect(normalizeCbm(1.5e-12)).toBe(1.5e-12);
  });

  it('0과 비정상값은 그대로 둔다', () => {
    expect(normalizeCbm(0)).toBe(0);
    expect(normalizeCbm(Number.NaN)).toBeNaN();
  });
});

describe('서류 생성과 서류 대조가 같은 표기 규칙을 쓴다', () => {
  it('내부값 0.4005로 발행한 서류(0.401)는 다시 불일치로 잡히지 않는다', () => {
    const internal = 0.4005;
    const issued = formatCbm(internal); // 서류에 들어가는 값
    expect(issued).toBe('0.401');
    expect(isSameCbmAtDocumentPrecision(issued, internal)).toBe(true);
  });

  it('서류가 다른 값으로 적혀 있으면 그대로 불일치로 잡는다', () => {
    expect(isSameCbmAtDocumentPrecision('0.400', 0.4005)).toBe(false);
  });

  it('자릿수를 늘려 적은 작은 화물도 그 표기값으로 대조된다', () => {
    const internal = 0.000022;
    expect(isSameCbmAtDocumentPrecision(formatCbm(internal), internal)).toBe(true);
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
