export interface PortOption {
  value: string;
  label: string;
}

/**
 * 항구 값은 통관 문서(영문)에 그대로 들어가므로 영문 표기("CITY, COUNTRY")로 통일한다.
 * (한글 항구명은 R7 한글검사에 걸리고, 수입 건은 해외 선적항이 필요하다.)
 */

// 선적항(⑤From) — 수출은 국내항, 수입은 해외항이 선적항이 된다.
export const LOAD_PORT_OPTIONS: PortOption[] = [
  { value: 'BUSAN, KOREA', label: 'BUSAN, KOREA (부산)' },
  { value: 'INCHEON, KOREA', label: 'INCHEON, KOREA (인천)' },
  { value: 'GWANGYANG, KOREA', label: 'GWANGYANG, KOREA (광양)' },
  { value: 'PYEONGTAEK, KOREA', label: 'PYEONGTAEK, KOREA (평택)' },
  { value: 'OSAKA, JAPAN', label: 'OSAKA, JAPAN (오사카)' },
  { value: 'TOKYO, JAPAN', label: 'TOKYO, JAPAN (도쿄)' },
  { value: 'SHANGHAI, CHINA', label: 'SHANGHAI, CHINA (상하이)' },
  { value: 'QINGDAO, CHINA', label: 'QINGDAO, CHINA (칭다오)' },
  { value: 'NINGBO, CHINA', label: 'NINGBO, CHINA (닝보)' },
  { value: 'HAIPHONG, VIETNAM', label: 'HAIPHONG, VIETNAM (하이퐁)' },
  { value: 'LOS ANGELES, USA', label: 'LOS ANGELES, USA (LA)' },
  { value: 'LONG BEACH, USA', label: 'LONG BEACH, USA (롱비치)' },
  { value: 'ROTTERDAM, NETHERLANDS', label: 'ROTTERDAM, NETHERLANDS (로테르담)' },
];

// 도착항(⑥To)
export const DISCHARGE_PORT_OPTIONS: PortOption[] = [
  { value: 'OSAKA, JAPAN', label: 'OSAKA, JAPAN (오사카)' },
  { value: 'TOKYO, JAPAN', label: 'TOKYO, JAPAN (도쿄)' },
  { value: 'SHANGHAI, CHINA', label: 'SHANGHAI, CHINA (상하이)' },
  { value: 'QINGDAO, CHINA', label: 'QINGDAO, CHINA (칭다오)' },
  { value: 'LOS ANGELES, USA', label: 'LOS ANGELES, USA (LA)' },
  { value: 'LONG BEACH, USA', label: 'LONG BEACH, USA (롱비치)' },
  { value: 'NEW YORK, USA', label: 'NEW YORK, USA (뉴욕)' },
  { value: 'ROTTERDAM, NETHERLANDS', label: 'ROTTERDAM, NETHERLANDS (로테르담)' },
  { value: 'HAMBURG, GERMANY', label: 'HAMBURG, GERMANY (함부르크)' },
  { value: 'HAIPHONG, VIETNAM', label: 'HAIPHONG, VIETNAM (하이퐁)' },
  { value: 'BUSAN, KOREA', label: 'BUSAN, KOREA (부산)' },
  { value: 'INCHEON, KOREA', label: 'INCHEON, KOREA (인천)' },
];
