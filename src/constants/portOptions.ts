export interface PortOption {
  value: string;
  label: string;
}

export const LOAD_PORT_OPTIONS: PortOption[] = [
  { value: '부산항', label: '부산항' },
  { value: '인천항', label: '인천항' },
  { value: '광양항', label: '광양항' },
  { value: '로스앤젤레스항', label: '로스앤젤레스항 (미국)' },
  { value: '상하이항', label: '상하이항 (중국)' },
];

export const DISCHARGE_PORT_OPTIONS: PortOption[] = [
  { value: '부산항', label: '부산항' },
  { value: '인천항', label: '인천항' },
  { value: '상하이항', label: '상하이항 (중국)' },
  { value: '로스앤젤레스항', label: '로스앤젤레스항 (미국)' },
  { value: '로테르담항', label: '로테르담항 (네덜란드)' },
];
