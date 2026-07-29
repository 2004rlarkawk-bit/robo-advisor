export interface HSCodeDictEntry {
  keywords: string[];
  code: string;
  description: string;
  confidence: '높음' | '보통' | '낮음' | '낮음 (확인 필요)';
  reasoning: string;
}

export const hsCodeDict: HSCodeDictEntry[] = [
  // 1. IT기기 / IT Devices
  {
    keywords: [
      'it기기',
      'it 기기',
      '컴퓨터',
      'computer',
      '노트북',
      'laptop',
      '태블릿',
      'tablet'
    ],
    code: '8471.30-0000',
    description: '휴대용 자동자료처리기계 (노트북, 태블릿 등)',
    confidence: '보통',
    reasoning:
      '휴대용 퍼스널 컴퓨터 또는 자동자료처리기계에 해당할 가능성이 있습니다. 정확한 분류를 위해 무게, 입력장치, 화면 구성과 주된 기능을 확인해야 합니다.'
  },
  {
    keywords: [
      '네트워크',
      '라우터',
      'router',
      '네트워크 허브',
      'network hub',
      '스위치',
      'network switch',
      '통신기기'
    ],
    code: '8517.62-0000',
    description: '데이터의 수신·변환·송신 또는 재생용 기기',
    confidence: '보통',
    reasoning:
      '라우터, 스위치 등 데이터 송수신이나 변환 기능을 수행하는 통신기기에 해당할 가능성이 있습니다. 장비의 구체적인 통신 기능을 확인해야 합니다.'
  },

  // 2. 반도체 / Semiconductors
  {
    keywords: [
      '반도체',
      'semiconductor',
      '프로세서',
      'processor',
      'controller',
      '컨트롤러',
      'cpu',
      '마이크로프로세서',
      'microprocessor'
    ],
    code: '8542.31-0000',
    description: '전자집적회로 - 프로세서와 컨트롤러',
    confidence: '보통',
    reasoning:
      '연산 또는 제어 기능을 수행하는 전자집적회로일 가능성이 있습니다. 메모리와 기타 회로가 결합되었는지 여부를 추가로 확인해야 합니다.'
  },
  {
    keywords: [
      '반도체 메모리',
      'semiconductor memory',
      '메모리 반도체',
      'memory chip',
      'dram',
      'sram',
      'nand',
      '낸드',
      'flash memory',
      '플래시 메모리'
    ],
    code: '8542.32-0000',
    description: '전자집적회로 - 메모리',
    confidence: '높음',
    reasoning:
      'DRAM, SRAM, NAND 플래시처럼 데이터 저장 기능을 주된 용도로 하는 전자집적회로에 해당합니다.'
  },

  // 3. 의류 / Clothing
  {
    keywords: [
      '면 티셔츠',
      '면티',
      'cotton t-shirt',
      'cotton tshirt',
      '니트 티셔츠',
      '편직 티셔츠'
    ],
    code: '6109.10-0000',
    description: '면으로 만든 티셔츠·싱글릿 및 기타 조끼',
    confidence: '높음',
    reasoning:
      '면 재질의 편직 또는 메리야스 방식으로 제작된 티셔츠류에 해당합니다.'
  },
  {
    keywords: [
      '남성 면바지',
      '남자 면바지',
      'men cotton pants',
      'men cotton trousers',
      '남성 청바지',
      'men jeans'
    ],
    code: '6203.42-0000',
    description: '남성용 또는 소년용 면제 바지와 반바지',
    confidence: '보통',
    reasoning:
      '편직물이 아닌 직물로 만든 남성용 면 바지 또는 청바지일 가능성이 있습니다. 성별, 재질과 직조 방식을 확인해야 합니다.'
  },

  // 4. 자동차 부품 / Automotive Parts
  {
    keywords: [
      '자동차 차체 부품',
      '자동차 외장 부품',
      'car body parts',
      'vehicle body parts',
      '차체 부속품'
    ],
    code: '8708.29-9000',
    description: '자동차 차체의 기타 부분품과 부속품',
    confidence: '보통',
    reasoning:
      '자동차 차체의 조립이나 외장에 전용 또는 주로 사용되는 부품일 가능성이 있습니다. 범용 부품인지 여부를 추가 확인해야 합니다.'
  },
  {
    keywords: [
      '자동차 브레이크',
      '차량 브레이크',
      'car brake',
      'vehicle brake',
      '브레이크 부품',
      'brake parts'
    ],
    code: '8708.30-0000',
    description: '자동차용 브레이크와 서보브레이크 및 그 부분품',
    confidence: '높음',
    reasoning:
      '자동차 제동장치, 서보브레이크 또는 관련 부분품에 해당합니다.'
  },

  // 5. 커피 / Coffee
  {
    keywords: [
      '커피 생두',
      '생두',
      'green coffee bean',
      'green coffee beans',
      'unroasted coffee'
    ],
    code: '0901.11-0000',
    description: '볶지 않은 커피 중 카페인을 제거하지 않은 것',
    confidence: '높음',
    reasoning:
      '로스팅하지 않은 커피 생두이며 카페인이 제거되지 않은 제품에 해당합니다.'
  },
  {
    keywords: [
      '볶은 커피',
      '커피 원두',
      '로스팅 원두',
      'roasted coffee',
      'roasted coffee bean',
      'roasted coffee beans'
    ],
    code: '0901.21-0000',
    description: '볶은 커피 중 카페인을 제거하지 않은 것',
    confidence: '높음',
    reasoning:
      '로스팅 공정을 거친 커피 원두이며 카페인이 제거되지 않은 제품에 해당합니다.'
  },

  // 6. 플라스틱 / Plastic
  {
    keywords: [
      '기타 플라스틱 제품',
      '플라스틱 생활용품',
      'plastic article',
      'plastic products',
      '플라스틱 사출품',
      'injection molded plastic'
    ],
    code: '3926.90-9000',
    description: '기타 플라스틱 제품',
    confidence: '낮음 (확인 필요)',
    reasoning:
      '플라스틱이라는 재질만으로는 정확한 HS Code를 확정할 수 없습니다. 제품의 구체적인 용도, 형태와 다른 호에 별도로 분류되는지 확인해야 합니다.'
  },
  {
    keywords: [
      '폴리에틸렌 필름',
      'pe 필름',
      'pe film',
      'polyethylene film',
      '폴리에틸렌 시트',
      'polyethylene sheet'
    ],
    code: '3920.10-0000',
    description: '에틸렌 중합체로 만든 비접착성 판·시트·필름',
    confidence: '보통',
    reasoning:
      '비발포 상태의 에틸렌 중합체로 만든 비접착성 판, 시트 또는 필름일 가능성이 있습니다. 보강, 적층과 표면처리 여부를 확인해야 합니다.'
  },
  {
    keywords: [
      '저밀도 폴리에틸렌',
      'ldpe',
      'ldpe resin',
      '폴리에틸렌 수지',
      'polyethylene resin',
      'pe resin'
    ],
    code: '3901.10-0000',
    description: '비중이 0.94 미만인 폴리에틸렌',
    confidence: '낮음 (확인 필요)',
    reasoning:
      '저밀도 폴리에틸렌 수지일 가능성이 있습니다. 정확한 분류를 위해 비중, 형태와 시험성적서 또는 물질명세서를 확인해야 합니다.'
  }
];

/**
 * 어류명 목록
 *
 * 어류는 같은 어종이라도 보존상태, 가공상태, 절단 여부 등에 따라
 * HS Code가 달라질 수 있으므로 별도로 감지합니다.
 */
const FISH_SPECIES = [
  '갈치',
  'hairtail',
  '고등어',
  'mackerel',
  '명태',
  'pollock',
  'pollack',
  '참치',
  'tuna',
  '연어',
  'salmon',
  '대구',
  'cod',
  '청어',
  'herring',
  '멸치',
  'anchovy',
  '삼치',
  'spanish mackerel',
  '방어',
  'yellowtail',
  '조기',
  'croaker',
  '광어',
  '넙치',
  'flatfish',
  'flounder',
  '가자미',
  'sole',
  '임연수',
  'atka mackerel',
  '전갱이',
  'horse mackerel',
  '장어',
  'eel',
  '붕장어',
  'conger',
  '정어리',
  'sardine',
  '도미',
  'sea bream',
  '민어',
  '옥돔',
  '아귀',
  'anglerfish',
  '메로',
  'toothfish'
];

/**
 * 문자열을 키워드 비교용으로 정리합니다.
 */
function normalizeItemName(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 품목명에 어종명이 포함되어 있는지 확인합니다.
 */
export function isFishSpecies(name: string): boolean {
  const normalizedName = normalizeItemName(name);

  if (!normalizedName) {
    return false;
  }

  return FISH_SPECIES.some(species =>
    normalizedName.includes(species.toLowerCase())
  );
}

/**
 * 어류 품목을 보존상태에 따라 1차 분류합니다.
 *
 * 주의:
 * 이 함수는 정확한 10자리 HSK를 확정하지 않습니다.
 * 어종과 세부 가공상태에 따라 세번이 달라질 수 있기 때문입니다.
 *
 * 반환값:
 * - 어류가 아니면 null
 * - 어류이면 추가 확인이 필요한 안내 후보 반환
 */
export interface FishHSCandidate {
  code: string;
  description: string;
  confidence: HSCodeDictEntry['confidence'];
  reasoning: string;
}
export interface FishStateOption {
  key: string;
  label: string;
  candidates: FishHSCandidate[];
}
export interface FishClassification {
  species: string;
  resolved?: FishHSCandidate[];
  disambiguation?: {
    question: string;
    note: string;
    options: FishStateOption[];
  };
}

// 보존·가공 상태별 표준 HS 후보 (상태당 최대 3개, confidence 내림차순).
// 통관 안전: 류·소호(4~6자리)까지만, 정확한 10자리는 관세청 품목분류로 확인 안내.
const FISH_STATE_CANDIDATES: Record<string, FishHSCandidate[]> = {
  live: [
    { code: '0301.99', description: '활어 (기타)', confidence: '보통',
      reasoning: '살아있는 어류는 HS 제0301호(활어)로 분류됩니다. 어종·용도에 따라 세부 소호가 달라지므로 정확한 10자리는 관세청 품목분류로 확인하세요.' },
  ],
  fresh: [
    { code: '0302.89', description: '신선·냉장 어류 (기타, 통째)', confidence: '보통',
      reasoning: '신선하거나 냉장된 통어류는 HS 제0302호입니다. 어종이 별도 소호에 없으면 0302.89(기타)를 검토합니다.' },
    { code: '0304.49', description: '신선·냉장 필레', confidence: '낮음 (확인 필요)',
      reasoning: '필레·어육 형태이면 통어류(0302)가 아니라 HS 제0304호(필레)가 적용됩니다. 필레 여부를 확인하세요.' },
  ],
  frozen: [
    { code: '0303.89', description: '냉동 어류 (기타, 통째)', confidence: '보통',
      reasoning: '냉동 통어류는 HS 제0303호입니다. 어종이 별도 소호에 없으면 0303.89(기타)를 검토합니다.' },
    { code: '0304.89', description: '냉동 필레', confidence: '낮음 (확인 필요)',
      reasoning: '냉동 필레·어육이면 HS 제0304호가 적용됩니다. 필레 여부를 확인하세요.' },
  ],
  dried_salted: [
    { code: '0305.59', description: '건조 어류 (기타)', confidence: '보통',
      reasoning: '건조 어류는 HS 제0305호입니다. 건조품은 0305.59(기타 건조)를 검토합니다.' },
    { code: '0305.69', description: '염장·염수장 어류 (기타)', confidence: '낮음 (확인 필요)',
      reasoning: '염장 또는 염수장 어류이면 0305.6x를 검토합니다. 건조인지 염장인지 확인하세요.' },
  ],
  smoked: [
    { code: '0305.49', description: '훈제 어류 (기타)', confidence: '보통',
      reasoning: '훈제 어류는 HS 제0305호(훈제 소호)입니다. 조리 여부·어종에 따라 세부 소호가 달라질 수 있습니다.' },
  ],
  prepared: [
    { code: '1604.19', description: '조제·저장처리 어류 (기타, 통째·절단)', confidence: '보통',
      reasoning: '통조림·양념·조리 등 조제·저장처리된 어류는 제3류가 아니라 HS 제1604호입니다. 조리방법·포장을 확인하세요.' },
    { code: '1604.20', description: '기타 조제 어류 (어묵 등)', confidence: '낮음 (확인 필요)',
      reasoning: '어육 반죽·성형품(어묵 등)은 1604.20을 검토합니다.' },
  ],
};

const FISH_DISAMBIG_KEYS: { key: string; label: string }[] = [
  { key: 'fresh',        label: '신선·냉장' },
  { key: 'frozen',       label: '냉동' },
  { key: 'dried_salted', label: '건조·염장' },
  { key: 'smoked',       label: '훈제' },
  { key: 'prepared',     label: '조제·통조림' },
];

const FISH_KO_NAME: Record<string, string> = {
  hairtail: '갈치', mackerel: '고등어', pollock: '명태', pollack: '명태', tuna: '참치',
  salmon: '연어', cod: '대구', herring: '청어', anchovy: '멸치', 'spanish mackerel': '삼치',
  yellowtail: '방어', croaker: '조기', flatfish: '광어', flounder: '광어', sole: '가자미',
};
function detectFishSpecies(normalized: string): string {
  for (const sp of FISH_SPECIES) {
    if (normalized.includes(sp.toLowerCase())) {
      return /[가-힣]/.test(sp) ? sp : (FISH_KO_NAME[sp.toLowerCase()] || sp);
    }
  }
  return '어류';
}

/**
 * 어류 품목을 보존·가공 상태에 따라 분류한다.
 * - 품목명에 상태(냉동·신선 등)가 있으면 → 해당 상태의 실제 HS 후보(resolved)
 * - 상태가 불명확하면 → 사용자가 상태를 고르도록 선택지(disambiguation) 반환(빈 코드 금지)
 */
export function classifyFishHS(name: string): FishClassification | null {
  if (!isFishSpecies(name)) return null;
  const n = normalizeItemName(name);
  const species = detectFishSpecies(n);
  const resolve = (key: string): FishClassification => ({ species, resolved: FISH_STATE_CANDIDATES[key] });

  if (/통조림|캔|조제|양념|소스|튀김|구이|익힌|canned|prepared|seasoned|cooked|fried|grilled/.test(n)) return resolve('prepared');
  if (/훈제|smoked/.test(n)) return resolve('smoked');
  if (/건조|말린|반건조|염장|소금에 절인|dried|salted|in brine/.test(n)) return resolve('dried_salted');
  if (/냉동|frozen/.test(n)) return resolve('frozen');
  if (/활어|살아있는|live fish|live/.test(n)) return resolve('live');
  if (/신선|생물|냉장|fresh|chilled/.test(n)) return resolve('fresh');

  return {
    species,
    disambiguation: {
      question: '정확한 분류를 위해 보존·가공 상태를 선택해 주세요',
      note: species + ' · 보존 상태와 가공 형태에 따라 HS CODE가 달라집니다. 아래에서 해당 상태를 선택하면 적합한 코드를 추천해 드립니다.',
      options: FISH_DISAMBIG_KEYS.map((o) => ({ key: o.key, label: o.label, candidates: FISH_STATE_CANDIDATES[o.key] })),
    },
  };
}

/**
 * 내장 HS 사전에서 품목명과 일치하는 후보를 검색합니다.
 *
 * 이 함수는 API 및 관세청 HS 사전 검색이 실패하거나
 * 결과가 없을 때 사용하는 최종 폴백입니다.
 *
 * 일치 항목이 없으면 가짜 HS Code를 반환하지 않고 빈 배열을 반환합니다.
 */
export function findHSCodesByItemName(
  itemName: string
): HSCodeDictEntry[] {
  const normalizedItemName = normalizeItemName(itemName);

  if (!normalizedItemName) {
    return [];
  }

  /*
   * 키워드 매칭
   *
   * 입력값에 사전 키워드가 포함되어 있는 항목을 반환합니다.
   */
  const matches = hsCodeDict.filter(entry =>
    entry.keywords.some(keyword =>
      normalizedItemName.includes(
        normalizeItemName(keyword)
      )
    )
  );

  if (matches.length === 0) {
    return [];
  }

  /*
   * 중복 코드 제거
   *
   * 여러 키워드가 같은 HS 항목과 일치해도
   * 동일 코드가 중복 노출되지 않도록 합니다.
   */
  const uniqueMatches = matches.filter(
    (entry, index, array) =>
      array.findIndex(
        candidate => candidate.code === entry.code
      ) === index
  );

  /*
   * 신뢰도가 높은 후보가 먼저 노출되도록 정렬합니다.
   */
  const confidenceOrder: Record<
    HSCodeDictEntry['confidence'],
    number
  > = {
    높음: 4,
    보통: 3,
    낮음: 2,
    '낮음 (확인 필요)': 1
  };

  return uniqueMatches.sort(
    (a, b) =>
      confidenceOrder[b.confidence] -
      confidenceOrder[a.confidence]
  );
}