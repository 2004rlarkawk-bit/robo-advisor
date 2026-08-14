import { areEquivalentExportPorts } from '../constants/ports';
import { getShipperPackageTypeOptionValue } from './shipperForm';

const INCOTERMS_CODE = /^(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)(?:\s|$)/;

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
