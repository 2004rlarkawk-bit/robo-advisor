export interface PortOption {
  value: string;
  label: string;
}

export const PORT_OPTIONS: PortOption[] = [
  { value: 'Busan Port', label: 'Busan Port (부산항)' },
  { value: 'Incheon Port', label: 'Incheon Port (인천항)' },
  { value: 'Gwangyang Port', label: 'Gwangyang Port (광양항)' },
  { value: 'Ulsan Port', label: 'Ulsan Port (울산항)' },
  { value: 'Pyeongtaek-Dangjin Port', label: 'Pyeongtaek-Dangjin Port (평택·당진항)' },
  { value: 'Shanghai Port', label: 'Shanghai Port (상하이항)' },
  { value: 'Los Angeles Port', label: 'Los Angeles Port (로스앤젤레스항)' },
  { value: 'Rotterdam Port', label: 'Rotterdam Port (로테르담항)' },
  { value: 'Singapore Port', label: 'Singapore Port (싱가포르항)' },
  { value: 'Hamburg Port', label: 'Hamburg Port (함부르크항)' },
];

export const LOAD_PORT_OPTIONS = PORT_OPTIONS;
export const DISCHARGE_PORT_OPTIONS = PORT_OPTIONS;

/** 수출 화주 입력폼 전용 항만 목록. 공용/포워더 항만 목록과 분리해 영향 범위를 제한한다. */
/** 대한민국 출발 수출 업무에서 화주·포워더가 함께 사용하는 POL 목록. */
export const EXPORT_POL_OPTIONS: PortOption[] = [
  { value: 'Busan Port', label: 'Busan Port (부산항)' },
  { value: 'Incheon Port', label: 'Incheon Port (인천항)' },
  { value: 'Gwangyang Port', label: 'Gwangyang Port (광양항)' },
  { value: 'Ulsan Port', label: 'Ulsan Port (울산항)' },
  { value: 'Pyeongtaek-Dangjin Port', label: 'Pyeongtaek-Dangjin Port (평택·당진항)' },
];

/** 대한민국 출발 수출 업무에서 화주·포워더가 함께 사용하는 POD 목록. */
export const EXPORT_POD_OPTIONS: PortOption[] = [
  { value: 'Tokyo Port', label: 'Tokyo Port (도쿄항)' },
  { value: 'Yokohama Port', label: 'Yokohama Port (요코하마항)' },
  { value: 'Osaka Port', label: 'Osaka Port (오사카항)' },
  { value: 'Kobe Port', label: 'Kobe Port (고베항)' },
  { value: 'Shanghai Port', label: 'Shanghai Port (상하이항)' },
  { value: 'Ningbo Port', label: 'Ningbo Port (닝보항)' },
  { value: 'Qingdao Port', label: 'Qingdao Port (칭다오항)' },
  { value: 'Shenzhen Port', label: 'Shenzhen Port (선전항)' },
  { value: 'Los Angeles Port', label: 'Los Angeles Port (로스앤젤레스항)' },
  { value: 'Long Beach Port', label: 'Long Beach Port (롱비치항)' },
  { value: 'New York-New Jersey Port', label: 'New York-New Jersey Port (뉴욕·뉴저지항)' },
  { value: 'Singapore Port', label: 'Singapore Port (싱가포르항)' },
  { value: 'Ho Chi Minh Port', label: 'Ho Chi Minh Port (호찌민항)' },
  { value: 'Hai Phong Port', label: 'Hai Phong Port (하이퐁항)' },
  { value: 'Rotterdam Port', label: 'Rotterdam Port (로테르담항)' },
  { value: 'Hamburg Port', label: 'Hamburg Port (함부르크항)' },
];

// 기존 import 호환. 신규 화면은 역할 구분 없는 EXPORT_* 이름을 사용한다.
export const EXPORT_SHIPPER_LOAD_PORT_OPTIONS = EXPORT_POL_OPTIONS;
export const EXPORT_SHIPPER_DISCHARGE_PORT_OPTIONS = EXPORT_POD_OPTIONS;

export const OTHER_DOMESTIC_PORT_VALUE = '__OTHER_DOMESTIC_PORT__';
export const OTHER_FOREIGN_PORT_VALUE = '__OTHER_FOREIGN_PORT__';

const LEGACY_PORT_VALUES: Record<string, string> = {
  부산항: 'Busan Port',
  인천항: 'Incheon Port',
  광양항: 'Gwangyang Port',
  울산항: 'Ulsan Port',
  '평택·당진항': 'Pyeongtaek-Dangjin Port',
  상하이항: 'Shanghai Port',
  로스앤젤레스항: 'Los Angeles Port',
  로테르담항: 'Rotterdam Port',
};

export function normalizePortValue(value: string | null | undefined): string {
  if (!value) return '';
  return LEGACY_PORT_VALUES[value.trim()] ?? value.trim();
}

export function normalizePortComparisonKey(value: string | null | undefined): string {
  return normalizePortValue(value)
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .replace(/\s+PORT$/, '');
}

/** 알려진 수출 항만은 공통 canonical value로, 기타항은 원문을 보존한다. */
export function normalizeExportPortValue(value: string | null | undefined): string {
  const trimmed = normalizePortValue(value);
  if (!trimmed) return '';
  const key = normalizePortComparisonKey(trimmed);
  return [...EXPORT_POL_OPTIONS, ...EXPORT_POD_OPTIONS]
    .find((option) => normalizePortComparisonKey(option.value) === key)?.value ?? trimmed;
}

export function areEquivalentExportPorts(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return normalizePortComparisonKey(left) === normalizePortComparisonKey(right);
}
