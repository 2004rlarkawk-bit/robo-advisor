/**
 * 사무용품·가구·시계 등 흔한 품목의 HS 소호 분류 기준 보조표.
 *
 * 관세청 HSK 사전은 10자리 말단 품명만 담고 있어, 제품 종류가 상위 호·소호 문구에만
 * 있는 품목은 품명으로 검색되지 않는다. 예)
 *  - 손목시계(9102.11~29)의 말단 품명은 "기타"·"자동권식"뿐이고 "watch"는 스톱워치에만 있다.
 *  - 의자(9401.31~79)는 "가죽으로 덮어씌운 것"·"기타"뿐이라 "chair"는 리프트·치과용 의자에만 걸린다.
 *  - 컴퓨터(8471.30~50)는 "64비트 이상인 것…"뿐이라 "computer"는 케이스·소프트웨어에만 걸린다.
 * 그래서 검색어를 소호로 직접 이어 주고, 실제 구분 기준(소재·구동 방식·구성)으로 되묻는다.
 *
 * 문구는 HS 2022 품목분류표(WCO) 호·소호 용어를 따른다.
 */

import type { HSCodeDisambiguation } from '../types/hsCodeSuggestion';

interface ProductOption {
  /** 6자리 소호 */
  subheading: string;
  /** 되묻기 선택지 라벨 */
  label: string;
  /** 고르면 품명이 되는 무역서류용 영문 품명 */
  goodsName: string;
  /** AI 후보 설명용 전체 기준 */
  ko: string;
  en: string;
  /** 검색어에 이 단어가 있으면 이 선택지로 좁힌다 ("wooden desk" → 목재만) */
  narrow?: RegExp;
}

interface ProductGroup {
  /** 이 품목을 가리키는 검색어 */
  pattern: RegExp;
  /** 본체가 아닌 것(부분품·다른 품목)을 가리키는 단어 — 있으면 이 표를 쓰지 않는다 */
  exclude?: RegExp;
  /** 선택지가 2개 이상일 때 묻는 말 */
  question: string;
  /** 왜 묻는지 — 품목군마다 구분 기준이 다르다 */
  basis: string;
  options: ProductOption[];
}

const PRECIOUS_KO = '케이스가 귀금속(또는 귀금속을 입힌 금속)';
const PRECIOUS_EN = 'with case of precious metal or of metal clad with precious metal';
const BASE_KO = '케이스가 귀금속이 아닌 것';
const BASE_EN = 'other than those with case of precious metal';

const LAPTOP: ProductOption = {
  subheading: '847130',
  label: '노트북 컴퓨터(휴대용)',
  goodsName: 'Laptop Computer',
  ko: '휴대용 자동자료처리기계(10kg 이하, 노트북 컴퓨터)',
  en: 'portable automatic data processing machines (laptop, notebook computers)',
  narrow: /portable|휴대/i,
};
const PAPER_NOTEBOOK: ProductOption = {
  subheading: '482010',
  label: '공책 · 노트 · 메모철',
  goodsName: 'Paper Notebook',
  ko: '공책·노트·장부·메모철·일기장 (종이제)',
  en: 'paper notebooks, registers, memorandum pads, diaries',
};
const EXERCISE_BOOK: ProductOption = {
  subheading: '482020',
  label: '연습장(학습용)',
  goodsName: 'Exercise Book',
  ko: '연습장 (종이제)',
  en: 'exercise books of paper',
  narrow: /exercise|연습장/i,
};

/** 앞에 있는 품목군부터 본다 — "notebook computer"는 공책보다 노트북 컴퓨터가 먼저다. */
const PRODUCT_GROUPS: ProductGroup[] = [
  {
    pattern: /\blaptops?\b|\bnote\s?books?\s+(computers?|pcs?)\b|노트북\s*(컴퓨터|pc)|랩톱|랩탑/i,
    exclude: /bags?\b|cases?\b|sleeves?\b|stands?\b|chargers?\b|adapt|batter|covers?\b|가방|케이스|파우치|거치대|충전기|어댑터|배터리/i,
    question: '',
    basis: '',
    options: [LAPTOP],
  },
  {
    pattern: /공책|연습장|\bexercise\s+books?\b|\bpaper\s+note\s?books?\b/i,
    question: '정확한 HS CODE 분류를 위해 공책 종류를 선택해 주세요.',
    basis: '종이 문구류는 용도에 따라 HS Code가 달라집니다.',
    options: [PAPER_NOTEBOOK, EXERCISE_BOOK],
  },
  {
    // 관세청 사전은 "노트북"을 종이 공책(4820.10)의 품명으로 쓴다 — 컴퓨터인지 공책인지 물어야 한다.
    pattern: /\bnote\s?books?\b|노트북/i,
    exclude: /bags?\b|cases?\b|sleeves?\b|stands?\b|가방|케이스|파우치|거치대/i,
    question: '정확한 HS CODE 분류를 위해 제품 종류를 선택해 주세요.',
    basis: '"노트북"은 노트북 컴퓨터와 종이 공책을 모두 가리킬 수 있습니다.',
    options: [LAPTOP, PAPER_NOTEBOOK, EXERCISE_BOOK],
  },
  {
    pattern: /\bcomputers?\b|\bpcs?\b|\bdesktops?\b|컴퓨터|데스크톱|데스크탑/i,
    exclude: /cases?\b|software|cables?\b|desks?\b|tables?\b|chairs?\b|bags?\b|mouse|mice|keyboards?\b|monitors?\b|parts?\b|speakers?\b|케이스|소프트웨어|케이블|책상|의자|가방|마우스|키보드|모니터|부품|부분품|스피커/i,
    question: '정확한 HS CODE 분류를 위해 컴퓨터 종류를 선택해 주세요.',
    basis: '컴퓨터는 휴대용인지, 본체와 모니터·키보드의 구성이 어떤지에 따라 HS Code가 달라집니다.',
    options: [
      {
        subheading: '847150',
        label: '데스크톱 본체만',
        goodsName: 'Desktop Computer Main Unit',
        ko: '처리장치(데스크톱 본체) — 모니터·키보드 없이 본체만',
        en: 'processing units (desktop computer main unit), presented without monitor or keyboard',
        narrow: /main\s?unit|본체/i,
      },
      {
        subheading: '847149',
        label: '본체 + 모니터 · 키보드 세트',
        goodsName: 'Desktop Computer System',
        ko: '시스템 형태로 제시하는 것 — 본체와 모니터·키보드를 함께',
        en: 'presented in the form of systems (main unit with monitor and keyboard)',
        narrow: /systems?\b|sets?\b|세트/i,
      },
      {
        subheading: '847141',
        label: '일체형(본체 · 모니터 한 몸)',
        goodsName: 'All-in-One Computer',
        ko: '중앙처리장치와 입출력장치를 같은 하우징에 갖춘 것(일체형)',
        en: 'comprising in the same housing a central processing unit and an input and output unit (all-in-one)',
        narrow: /all[\s-]?in[\s-]?one|일체형/i,
      },
      LAPTOP,
    ],
  },
  {
    pattern: /\bdesks?\b|책상/i,
    exclude: /lamps?\b|mats?\b|pads?\b|organi[sz]ers?\b|calendars?\b|fans?\b|clocks?\b|스탠드|매트|패드|정리함|달력|선풍기|시계/i,
    question: '정확한 HS CODE 분류를 위해 책상의 소재와 용도를 선택해 주세요.',
    basis: '가구는 소재와 사무실용 여부에 따라 HS Code가 달라집니다.',
    options: [
      {
        subheading: '940330',
        label: '목재 · 사무실용',
        goodsName: 'Wooden Office Desk',
        ko: '목재로 만든 사무실용 가구',
        en: 'wooden furniture of a kind used in offices',
        narrow: /wood|목재|원목|(?<![대등])나무/i,
      },
      {
        subheading: '940310',
        label: '금속 · 사무실용',
        goodsName: 'Metal Office Desk',
        ko: '금속으로 만든 사무실용 가구',
        en: 'metal furniture of a kind used in offices',
        narrow: /metal|steel|금속|철제|스틸/i,
      },
      {
        subheading: '940360',
        label: '목재 · 가정용 등 기타',
        goodsName: 'Wooden Desk',
        ko: '그 밖의 목재가구(사무실용·주방용·침실용 제외)',
        en: 'other wooden furniture (not for offices, kitchens or bedrooms)',
        narrow: /wood|목재|원목|(?<![대등])나무/i,
      },
      {
        subheading: '940320',
        label: '금속 · 가정용 등 기타',
        goodsName: 'Metal Desk',
        ko: '그 밖의 금속가구(사무실용 제외)',
        en: 'other metal furniture (not for offices)',
        narrow: /metal|steel|금속|철제|스틸/i,
      },
      {
        subheading: '940370',
        label: '플라스틱',
        goodsName: 'Plastic Desk',
        ko: '플라스틱으로 만든 가구',
        en: 'furniture of plastics',
        narrow: /plastic|플라스틱/i,
      },
      {
        subheading: '940382',
        label: '대나무',
        goodsName: 'Bamboo Desk',
        ko: '대나무로 만든 가구',
        en: 'furniture of bamboo',
        narrow: /bamboo|대나무/i,
      },
      {
        subheading: '940383',
        label: '등나무',
        goodsName: 'Rattan Desk',
        ko: '등나무로 만든 가구',
        en: 'furniture of rattan',
        narrow: /rattan|등나무/i,
      },
      {
        subheading: '940389',
        label: '돌 · 유리 등 그 밖의 재료',
        goodsName: 'Stone Desk',
        ko: '그 밖의 재료(돌·유리 등)로 만든 가구',
        en: 'furniture of other materials (stone, glass, etc.)',
        narrow: /stone|marble|granite|glass|돌|석재|대리석|화강암|유리/i,
      },
    ],
  },
  {
    pattern: /\bchairs?\b|의자/i,
    exclude: /wheel|lifts?\b|massage|dental|dentist|barber|car\s?seats?\b|covers?\b|cushions?\b|mats?\b|휠체어|리프트|안마|치과|이발|미용|카시트|커버|방석|매트/i,
    question: '정확한 HS CODE 분류를 위해 의자 종류를 선택해 주세요.',
    basis: '의자는 회전식 여부, 프레임 소재, 쿠션 유무에 따라 HS Code가 달라집니다.',
    options: [
      {
        subheading: '940139',
        label: '회전의자(높이 조절) · 금속 · 플라스틱',
        goodsName: 'Swivel Office Chair',
        ko: '높이를 조절할 수 있는 회전의자 — 목재가 아닌 것',
        en: 'swivel seats with variable height adjustment, other than of wood',
        narrow: /swivel|office|회전|사무/i,
      },
      {
        subheading: '940171',
        label: '금속 프레임 · 쿠션 있음',
        goodsName: 'Upholstered Metal Frame Chair',
        ko: '금속 프레임 의자 — 속을 채워 덮어씌운 것',
        en: 'seats with metal frames, upholstered',
        narrow: /metal|steel|금속|철제|스틸/i,
      },
      {
        subheading: '940179',
        label: '금속 프레임 · 쿠션 없음',
        goodsName: 'Metal Frame Chair',
        ko: '금속 프레임 의자 — 그 밖의 것',
        en: 'seats with metal frames, not upholstered',
        narrow: /metal|steel|금속|철제|스틸/i,
      },
      {
        subheading: '940161',
        label: '목재 프레임 · 쿠션 있음',
        goodsName: 'Upholstered Wooden Chair',
        ko: '목재 프레임 의자 — 속을 채워 덮어씌운 것',
        en: 'seats with wooden frames, upholstered',
        narrow: /wood|목재|원목|(?<![대등])나무/i,
      },
      {
        subheading: '940169',
        label: '목재 프레임 · 쿠션 없음',
        goodsName: 'Wooden Chair',
        ko: '목재 프레임 의자 — 그 밖의 것',
        en: 'seats with wooden frames, not upholstered',
        narrow: /wood|목재|원목|(?<![대등])나무/i,
      },
      {
        subheading: '940180',
        label: '플라스틱 등 그 밖의 의자',
        goodsName: 'Plastic Chair',
        ko: '그 밖의 의자(플라스틱제 등)',
        en: 'other seats (of plastics, etc.)',
        narrow: /plastic|플라스틱/i,
      },
      {
        subheading: '940131',
        label: '회전의자(높이 조절) · 목재',
        goodsName: 'Wooden Swivel Chair',
        ko: '높이를 조절할 수 있는 회전의자 — 목재',
        en: 'swivel seats with variable height adjustment, of wood',
        narrow: /swivel|office|회전|사무|wood|목재|원목|(?<![대등])나무/i,
      },
    ],
  },
  {
    pattern: /\bpocket[\s-]?watch(es)?\b|회중시계/i,
    question: '정확한 HS CODE 분류를 위해 시계 종류를 선택해 주세요.',
    basis: '시계는 케이스 소재와 구동 방식에 따라 HS Code가 달라집니다.',
    options: [
      {
        subheading: '910291',
        label: '전자식',
        goodsName: 'Quartz Pocket Watch',
        ko: `회중시계 등 그 밖의 휴대용 시계 · ${BASE_KO} · 전기구동식`,
        en: `pocket-watches and other watches, ${BASE_EN}, electrically operated`,
      },
      {
        subheading: '910299',
        label: '기계식',
        goodsName: 'Mechanical Pocket Watch',
        ko: `회중시계 등 그 밖의 휴대용 시계 · ${BASE_KO} · 기타`,
        en: `pocket-watches and other watches, ${BASE_EN}, other`,
      },
      {
        subheading: '910191',
        label: '귀금속 케이스 · 전자식',
        goodsName: 'Precious Metal Case Quartz Pocket Watch',
        ko: `회중시계 등 그 밖의 휴대용 시계 · ${PRECIOUS_KO} · 전기구동식`,
        en: `pocket-watches and other watches, ${PRECIOUS_EN}, electrically operated`,
      },
      {
        subheading: '910199',
        label: '귀금속 케이스 · 기계식',
        goodsName: 'Precious Metal Case Mechanical Pocket Watch',
        ko: `회중시계 등 그 밖의 휴대용 시계 · ${PRECIOUS_KO} · 기타`,
        en: `pocket-watches and other watches, ${PRECIOUS_EN}, other`,
      },
    ],
  },
  {
    pattern: /\bwatch(es)?\b|손목시계|시계/i,
    // 스마트워치는 통신기기(8517), 스톱워치는 사전 품명으로 찾히고, 밴드·케이스·무브먼트는 부분품(9108~9114)이다.
    exclude: /smart|stop|bands?\b|straps?\b|bracelets?\b|cases?\b|glass|crystal|batter|movements?\b|parts?\b|box|winder|clocks?\b|스마트|스톱|밴드|줄|케이스|유리|배터리|무브먼트|부품|부분품|벽|탁상|알람/i,
    question: '정확한 HS CODE 분류를 위해 시계 종류를 선택해 주세요.',
    basis: '시계는 케이스 소재와 구동·표시 방식에 따라 HS Code가 달라집니다.',
    options: [
      {
        subheading: '910211',
        label: '전자식 · 아날로그(바늘)',
        goodsName: 'Quartz Analog Wrist Watch',
        ko: `손목시계 · ${BASE_KO} · 전기구동식 · 기계식 표시부(바늘)만`,
        en: `wrist-watches, ${BASE_EN}, electrically operated, with mechanical display only`,
        narrow: /analog|아날로그/i,
      },
      {
        subheading: '910212',
        label: '전자식 · 디지털',
        goodsName: 'Digital Wrist Watch',
        ko: `손목시계 · ${BASE_KO} · 전기구동식 · 광전자 표시부(디지털)만`,
        en: `wrist-watches, ${BASE_EN}, electrically operated, with opto-electronic display only`,
        narrow: /digital|디지털/i,
      },
      {
        subheading: '910219',
        label: '전자식 · 아날로그+디지털',
        goodsName: 'Analog-Digital Wrist Watch',
        ko: `손목시계 · ${BASE_KO} · 전기구동식 · 기타(아날로그+디지털 등)`,
        en: `wrist-watches, ${BASE_EN}, electrically operated, other`,
      },
      {
        subheading: '910221',
        label: '기계식 · 오토매틱',
        goodsName: 'Automatic Mechanical Wrist Watch',
        ko: `손목시계 · ${BASE_KO} · 기계식 · 자동권식`,
        en: `wrist-watches, ${BASE_EN}, with automatic winding`,
        narrow: /automatic|오토매틱|자동/i,
      },
      {
        subheading: '910229',
        label: '기계식 · 수동 태엽',
        goodsName: 'Hand-wound Mechanical Wrist Watch',
        ko: `손목시계 · ${BASE_KO} · 기계식 · 기타(수동 태엽)`,
        en: `wrist-watches, ${BASE_EN}, other than electrically operated or automatic winding`,
        narrow: /hand[\s-]?wound|수동/i,
      },
      {
        subheading: '910111',
        label: '귀금속 케이스 · 전자식 · 아날로그',
        goodsName: 'Precious Metal Case Quartz Analog Wrist Watch',
        ko: `손목시계 · ${PRECIOUS_KO} · 전기구동식 · 기계식 표시부(바늘)만`,
        en: `wrist-watches, ${PRECIOUS_EN}, electrically operated, with mechanical display only`,
        narrow: /analog|아날로그/i,
      },
      {
        subheading: '910119',
        label: '귀금속 케이스 · 전자식 · 기타',
        goodsName: 'Precious Metal Case Quartz Wrist Watch',
        ko: `손목시계 · ${PRECIOUS_KO} · 전기구동식 · 기타`,
        en: `wrist-watches, ${PRECIOUS_EN}, electrically operated, other`,
      },
      {
        subheading: '910121',
        label: '귀금속 케이스 · 오토매틱',
        goodsName: 'Precious Metal Case Automatic Wrist Watch',
        ko: `손목시계 · ${PRECIOUS_KO} · 기계식 · 자동권식`,
        en: `wrist-watches, ${PRECIOUS_EN}, with automatic winding`,
        narrow: /automatic|오토매틱|자동/i,
      },
      {
        subheading: '910129',
        label: '귀금속 케이스 · 수동 태엽',
        goodsName: 'Precious Metal Case Hand-wound Wrist Watch',
        ko: `손목시계 · ${PRECIOUS_KO} · 기계식 · 기타(수동 태엽)`,
        en: `wrist-watches, ${PRECIOUS_EN}, other than electrically operated or automatic winding`,
        narrow: /hand[\s-]?wound|수동/i,
      },
    ],
  },
  {
    // 샤프(9608.40)·필통·연필깎이·연필심은 다른 소호다.
    pattern: /\bpencils?\b|연필/i,
    exclude: /cases?\b|sharpen|leads?\b|mechanical|propelling|sliding|필통|깎이|심|샤프/i,
    question: '',
    basis: '',
    options: [{
      subheading: '960910',
      label: '연필 · 색연필',
      goodsName: 'Pencil',
      ko: '연필과 크레용(심이 딱딱한 외장에 든 것)',
      en: 'pencils and crayons, with leads encased in a rigid sheath',
    }],
  },
  {
    pattern: /\bball[\s-]?(point)?[\s-]?pens?\b|볼펜/i,
    exclude: /refills?\b|inks?\b|심|잉크/i,
    question: '',
    basis: '',
    options: [{
      subheading: '960810',
      label: '볼펜',
      goodsName: 'Ballpoint Pen',
      ko: '볼펜',
      en: 'ball point pens',
    }],
  },
];

const OPTION_BY_SUBHEADING = new Map<string, ProductOption>();
for (const group of PRODUCT_GROUPS) {
  for (const option of group.options) {
    if (!OPTION_BY_SUBHEADING.has(option.subheading)) OPTION_BY_SUBHEADING.set(option.subheading, option);
  }
}

const subheadingOf = (code: string) => code.replace(/\D/g, '').slice(0, 6);

function groupForQuery(query: string): ProductGroup | null {
  return PRODUCT_GROUPS.find(
    (group) => group.pattern.test(query) && !(group.exclude && group.exclude.test(query)),
  ) ?? null;
}

/** 검색어에 소재·방식이 적혀 있으면 그에 맞는 선택지만 남긴다. 없으면 전부. */
function optionsForQuery(group: ProductGroup, query: string): ProductOption[] {
  const narrowed = group.options.filter((option) => option.narrow?.test(query));
  return narrowed.length > 0 ? narrowed : group.options;
}

/** 검색어가 보조표 품목이면 후보로 끌어올 소호 목록. 해당 없으면 빈 배열. */
export function productPrefixesForQuery(query: string): string[] {
  const group = groupForQuery(query);
  return group ? optionsForQuery(group, query).map((option) => option.subheading) : [];
}

/**
 * 후보 품명에 소호 기준을 덧붙인다 (AI 추천 입력용).
 * "기타" + 9102.29 → "기타 [손목시계 · 케이스가 귀금속이 아닌 것 · 기계식 · 기타(수동 태엽)]"
 * 보조표 대상이 아니면 원래 품명을 그대로 돌려준다.
 */
export function annotateProductNames(
  code: string,
  koreanName: string,
  englishName: string,
): { koreanName: string; englishName: string } {
  const option = OPTION_BY_SUBHEADING.get(subheadingOf(code));
  if (!option) return { koreanName, englishName };
  return {
    koreanName: `${koreanName} [${option.ko}]`,
    englishName: englishName ? `${englishName} [${option.en}]` : englishName,
  };
}

/**
 * 검색어가 보조표 품목이고 고를 선택지가 둘 이상이면 되묻기를 만든다.
 * 관세청 사전에 실제로 있는 소호(후보에 들어온 것)만 선택지로 올린다.
 */
export function productDisambiguationForQuery(
  query: string,
  candidateCodes: string[],
): HSCodeDisambiguation | null {
  const group = groupForQuery(query);
  if (!group) return null;

  const counts = new Map<string, number>();
  for (const code of candidateCodes) {
    const subheading = subheadingOf(code);
    counts.set(subheading, (counts.get(subheading) ?? 0) + 1);
  }
  const options = optionsForQuery(group, query).filter((option) => counts.has(option.subheading));
  if (options.length < 2) return null;

  return {
    question: group.question,
    note: `${group.basis} "${query.trim()}"에 맞는 항목을 골라 주세요.`,
    options: options.map((option) => ({
      subheading: option.subheading,
      formattedSubheading: `${option.subheading.slice(0, 4)}.${option.subheading.slice(4, 6)}`,
      label: option.label,
      englishLabel: option.goodsName,
      candidateCount: counts.get(option.subheading) ?? 0,
    })),
  };
}
