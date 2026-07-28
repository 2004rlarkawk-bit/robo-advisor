/**
 * 항구 관련 기존 상수와 유틸리티를 다시 내보냅니다.
 */
export { normalizePortValue } from './ports';

export interface PortOption {
  value: string;
  label: string;
}

/**
 * 항구 값은 상업송장, 패킹리스트, 선하증권 등
 * 영문 무역 문서에 그대로 들어갈 수 있으므로
 * value는 "CITY, COUNTRY" 형식의 영문 표기로 통일합니다.
 *
 * label은 사용자가 쉽게 구분할 수 있도록
 * 영문명 뒤에 한글 안내를 함께 표시합니다.
 */

/**
 * 선적항 옵션
 *
 * - 수출 거래: 국내 항구가 선적항이 될 수 있음
 * - 수입 거래: 해외 항구가 선적항이 될 수 있음
 *
 * 따라서 국내외 항구를 모두 제공합니다.
 */
export const LOAD_PORT_OPTIONS: PortOption[] = [
  {
    value: 'BUSAN, KOREA',
    label: 'BUSAN, KOREA (부산)',
  },
  {
    value: 'INCHEON, KOREA',
    label: 'INCHEON, KOREA (인천)',
  },
  {
    value: 'GWANGYANG, KOREA',
    label: 'GWANGYANG, KOREA (광양)',
  },
  {
    value: 'PYEONGTAEK, KOREA',
    label: 'PYEONGTAEK, KOREA (평택)',
  },
  {
    value: 'ULSAN, KOREA',
    label: 'ULSAN, KOREA (울산)',
  },
  {
    value: 'OSAKA, JAPAN',
    label: 'OSAKA, JAPAN (오사카)',
  },
  {
    value: 'TOKYO, JAPAN',
    label: 'TOKYO, JAPAN (도쿄)',
  },
  {
    value: 'YOKOHAMA, JAPAN',
    label: 'YOKOHAMA, JAPAN (요코하마)',
  },
  {
    value: 'SHANGHAI, CHINA',
    label: 'SHANGHAI, CHINA (상하이)',
  },
  {
    value: 'QINGDAO, CHINA',
    label: 'QINGDAO, CHINA (칭다오)',
  },
  {
    value: 'NINGBO, CHINA',
    label: 'NINGBO, CHINA (닝보)',
  },
  {
    value: 'SHENZHEN, CHINA',
    label: 'SHENZHEN, CHINA (선전)',
  },
  {
    value: 'HAIPHONG, VIETNAM',
    label: 'HAIPHONG, VIETNAM (하이퐁)',
  },
  {
    value: 'HO CHI MINH CITY, VIETNAM',
    label: 'HO CHI MINH CITY, VIETNAM (호찌민)',
  },
  {
    value: 'SINGAPORE, SINGAPORE',
    label: 'SINGAPORE, SINGAPORE (싱가포르)',
  },
  {
    value: 'LOS ANGELES, USA',
    label: 'LOS ANGELES, USA (로스앤젤레스)',
  },
  {
    value: 'LONG BEACH, USA',
    label: 'LONG BEACH, USA (롱비치)',
  },
  {
    value: 'NEW YORK, USA',
    label: 'NEW YORK, USA (뉴욕)',
  },
  {
    value: 'ROTTERDAM, NETHERLANDS',
    label: 'ROTTERDAM, NETHERLANDS (로테르담)',
  },
  {
    value: 'HAMBURG, GERMANY',
    label: 'HAMBURG, GERMANY (함부르크)',
  },
];

/**
 * 도착항 옵션
 *
 * - 수출 거래: 해외 항구가 도착항이 될 수 있음
 * - 수입 거래: 국내 항구가 도착항이 될 수 있음
 *
 * 따라서 국내외 항구를 모두 제공합니다.
 */
export const DISCHARGE_PORT_OPTIONS: PortOption[] = [
  {
    value: 'OSAKA, JAPAN',
    label: 'OSAKA, JAPAN (오사카)',
  },
  {
    value: 'TOKYO, JAPAN',
    label: 'TOKYO, JAPAN (도쿄)',
  },
  {
    value: 'YOKOHAMA, JAPAN',
    label: 'YOKOHAMA, JAPAN (요코하마)',
  },
  {
    value: 'SHANGHAI, CHINA',
    label: 'SHANGHAI, CHINA (상하이)',
  },
  {
    value: 'QINGDAO, CHINA',
    label: 'QINGDAO, CHINA (칭다오)',
  },
  {
    value: 'NINGBO, CHINA',
    label: 'NINGBO, CHINA (닝보)',
  },
  {
    value: 'SHENZHEN, CHINA',
    label: 'SHENZHEN, CHINA (선전)',
  },
  {
    value: 'HAIPHONG, VIETNAM',
    label: 'HAIPHONG, VIETNAM (하이퐁)',
  },
  {
    value: 'HO CHI MINH CITY, VIETNAM',
    label: 'HO CHI MINH CITY, VIETNAM (호찌민)',
  },
  {
    value: 'SINGAPORE, SINGAPORE',
    label: 'SINGAPORE, SINGAPORE (싱가포르)',
  },
  {
    value: 'LOS ANGELES, USA',
    label: 'LOS ANGELES, USA (로스앤젤레스)',
  },
  {
    value: 'LONG BEACH, USA',
    label: 'LONG BEACH, USA (롱비치)',
  },
  {
    value: 'NEW YORK, USA',
    label: 'NEW YORK, USA (뉴욕)',
  },
  {
    value: 'ROTTERDAM, NETHERLANDS',
    label: 'ROTTERDAM, NETHERLANDS (로테르담)',
  },
  {
    value: 'HAMBURG, GERMANY',
    label: 'HAMBURG, GERMANY (함부르크)',
  },
  {
    value: 'BUSAN, KOREA',
    label: 'BUSAN, KOREA (부산)',
  },
  {
    value: 'INCHEON, KOREA',
    label: 'INCHEON, KOREA (인천)',
  },
  {
    value: 'GWANGYANG, KOREA',
    label: 'GWANGYANG, KOREA (광양)',
  },
  {
    value: 'PYEONGTAEK, KOREA',
    label: 'PYEONGTAEK, KOREA (평택)',
  },
  {
    value: 'ULSAN, KOREA',
    label: 'ULSAN, KOREA (울산)',
  },
];

/**
 * 선적항과 도착항에서 공통으로 사용할 수 있는 전체 항구 목록입니다.
 *
 * 동일한 value의 항구는 한 번만 포함합니다.
 */
export const ALL_PORT_OPTIONS: PortOption[] = [
  ...LOAD_PORT_OPTIONS,
  ...DISCHARGE_PORT_OPTIONS,
].filter(
  (port, index, ports) =>
    ports.findIndex(candidate => candidate.value === port.value) === index,
);