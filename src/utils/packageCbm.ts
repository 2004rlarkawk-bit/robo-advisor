/**
 * 포장 규격(가로·세로·높이 × 박스 수) 기반 CBM 계산.
 *
 * CBM은 AI가 추정하는 값이 아니라 실제 포장 크기로 계산하는 값이라,
 * 화주가 최종 포장 후 외부 크기만 넣으면 여기서 정확히 산출한다.
 * 규격이 다른 포장이 섞여 있으면 줄마다 계산해 합산한다.
 */
import type { NumericInput, PackageDimension, PackageDimensionUnit } from '../types';

/** 한 변의 길이를 cm로 바꾸는 계수. inch는 1in = 2.54cm(정의값)로 환산한다. */
const CENTIMETERS_PER_UNIT: Record<PackageDimensionUnit, number> = {
  cm: 1,
  mm: 0.1,
  m: 100,
  inch: 2.54,
};

export const PACKAGE_DIMENSION_UNIT_OPTIONS: { value: PackageDimensionUnit; label: string }[] = [
  { value: 'cm', label: 'cm' },
  { value: 'm', label: 'm' },
  { value: 'mm', label: 'mm' },
  { value: 'inch', label: 'inch' },
];

export const DEFAULT_PACKAGE_DIMENSION_UNIT: PackageDimensionUnit = 'cm';

/** 서류에 싣는 CBM 자릿수 — 해운 실무 표기와 같게 소수 3자리로 맞춘다. */
export const CBM_DECIMALS = 3;

function positiveNumber(value: NumericInput | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function createPackageDimension(id: string): PackageDimension {
  return { id, width: '', length: '', height: '', boxes: '' };
}

/** 세 변과 박스 수가 모두 채워진 줄만 계산 대상이다. */
export function isCompletePackageDimension(row: PackageDimension): boolean {
  return [row.width, row.length, row.height, row.boxes].every((value) => positiveNumber(value) !== null);
}

/** 줄 하나의 부피를 cm³로. 합산은 여기서 해야 소수 누적 오차가 생기지 않는다. */
function packageDimensionCubicCentimeters(
  row: PackageDimension,
  unit: PackageDimensionUnit,
): number | null {
  const width = positiveNumber(row.width);
  const length = positiveNumber(row.length);
  const height = positiveNumber(row.height);
  const boxes = positiveNumber(row.boxes);
  if (width === null || length === null || height === null || boxes === null) return null;
  const toCm = CENTIMETERS_PER_UNIT[unit] ?? CENTIMETERS_PER_UNIT.cm;
  return (width * toCm) * (length * toCm) * (height * toCm) * boxes;
}

/**
 * 줄 하나의 CBM. cm 기준 계산식은 가로 × 세로 × 높이 × 박스 수 ÷ 1,000,000이고,
 * 다른 단위는 각 변을 cm로 환산한 뒤 같은 식을 쓴다.
 * 중량(G.W./N.W.)은 CBM 계산에 쓰지 않는다.
 */
export function packageDimensionCbm(row: PackageDimension, unit: PackageDimensionUnit): number | null {
  const cubicCentimeters = packageDimensionCubicCentimeters(row, unit);
  return cubicCentimeters === null ? null : cubicCentimeters / 1_000_000;
}

export function roundCbm(value: number): number {
  const factor = 10 ** CBM_DECIMALS;
  return Math.round(value * factor) / factor;
}

/** 규격 줄 전체의 총 CBM. 계산 가능한 줄이 하나도 없으면 null(미산정). */
export function totalPackageCbm(
  rows: PackageDimension[] | undefined,
  unit: PackageDimensionUnit,
): number | null {
  if (!rows?.length) return null;
  let totalCubicCentimeters = 0;
  let counted = 0;
  for (const row of rows) {
    const cubicCentimeters = packageDimensionCubicCentimeters(row, unit);
    if (cubicCentimeters === null) continue;
    totalCubicCentimeters += cubicCentimeters;
    counted += 1;
  }
  return counted > 0 ? roundCbm(totalCubicCentimeters / 1_000_000) : null;
}

/** 규격 줄의 박스 수 합계 — 포장 수량(박스 수)을 두 번 입력하지 않도록 여기서 채운다. */
export function totalPackageBoxes(rows: PackageDimension[] | undefined): number | null {
  if (!rows?.length) return null;
  let total = 0;
  let counted = 0;
  for (const row of rows) {
    const boxes = positiveNumber(row.boxes);
    if (boxes === null) continue;
    total += boxes;
    counted += 1;
  }
  return counted > 0 ? total : null;
}

/** 서류·폼에 넣는 표기. 0.369처럼 소수 3자리로 적는다. */
export function formatCbm(value: number): string {
  return roundCbm(value).toFixed(CBM_DECIMALS);
}

/** "0.35", "1.25 M3" 같은 표기에서 소수 자릿수만 센다. 숫자가 없으면 null. */
export function decimalPlacesOf(value: string): number | null {
  const matched = /(\d+)(?:[.,](\d+))?/.exec(value ?? '');
  if (!matched) return null;
  return matched[2]?.length ?? 0;
}

/**
 * 서류에 적힌 자릿수로 반올림해 비교한다.
 * P/L에 0.35로 적혀 있으면 계산값 0.369는 0.37이 되어 불일치,
 * 0.4로 적혀 있으면 0.4가 되어 일치로 본다.
 */
export function isSameCbmAtDocumentPrecision(documentValue: string, computed: number): boolean {
  const decimals = decimalPlacesOf(documentValue);
  const documentNumber = Number(/(\d+(?:[.,]\d+)?)/.exec(documentValue ?? '')?.[1]?.replace(',', '.'));
  if (decimals === null || !Number.isFinite(documentNumber)) return false;
  const factor = 10 ** decimals;
  return Math.round(documentNumber * factor) === Math.round(computed * factor);
}
