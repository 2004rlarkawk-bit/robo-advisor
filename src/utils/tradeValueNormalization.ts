import { areEquivalentExportPorts } from '../constants/ports';
import { getShipperPackageTypeOptionValue } from './shipperForm';

const INCOTERMS_CODE = /^(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)(?:\s|$)/;

/** 서류에서 "값 없음"을 뜻하는 표기. 실제 값으로 비교하면 불일치로 오판한다. */
const ABSENT_TRADE_VALUES = new Set(['', '-', '—', '(미기재)', 'n/a', 'na', '없음', '미기재', '해당없음', 'unknown', 'null']);

export function isAbsentTradeValue(value: unknown): boolean {
  return ABSENT_TRADE_VALUES.has(String(value ?? '').trim().toLowerCase());
}

export function normalizeComparableText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function normalizePackageTypeValue(value: unknown): string {
  const normalized = normalizeComparableText(value);
  return getShipperPackageTypeOptionValue(normalized) ?? normalized;
}

export function normalizeIncotermsCode(value: unknown): string {
  const normalized = normalizeComparableText(value);
  return normalized.match(INCOTERMS_CODE)?.[1] ?? normalized;
}

export function areEquivalentTradeFieldValues(field: string, left: unknown, right: unknown): boolean {
  if (field === 'loadPort' || field === 'dischargePort') {
    return areEquivalentExportPorts(String(left ?? ''), String(right ?? ''));
  }
  if (field === 'packageType') {
    return normalizePackageTypeValue(left) === normalizePackageTypeValue(right);
  }
  if (field === 'incoterms') {
    return normalizeIncotermsCode(left) === normalizeIncotermsCode(right);
  }
  return normalizeComparableText(left) === normalizeComparableText(right);
}
