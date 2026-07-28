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
