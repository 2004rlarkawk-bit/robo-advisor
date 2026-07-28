export interface CountryOption {
  value: string;
  label: string;
}

export const OTHER_COUNTRY_VALUE = '__other__';

export const COUNTRY_OPTIONS: CountryOption[] = [
  { value: 'South Korea', label: 'South Korea' },
  { value: 'China', label: 'China' },
  { value: 'Japan', label: 'Japan' },
  { value: 'United States', label: 'United States' },
  { value: 'Vietnam', label: 'Vietnam' },
  { value: 'Thailand', label: 'Thailand' },
  { value: 'Singapore', label: 'Singapore' },
  { value: 'Germany', label: 'Germany' },
  { value: 'United Kingdom', label: 'United Kingdom' },
];

const LEGACY_COUNTRY_VALUES: Record<string, string> = {
  대한민국: 'South Korea',
  한국: 'South Korea',
  중국: 'China',
  일본: 'Japan',
  미국: 'United States',
  베트남: 'Vietnam',
  태국: 'Thailand',
  싱가포르: 'Singapore',
  독일: 'Germany',
  영국: 'United Kingdom',
};

export function normalizeCountryValue(value: string | null | undefined): string {
  if (!value) return '';
  return LEGACY_COUNTRY_VALUES[value.trim()] ?? value.trim();
}

export function isPresetCountry(value: string): boolean {
  return COUNTRY_OPTIONS.some((option) => option.value === value);
}
