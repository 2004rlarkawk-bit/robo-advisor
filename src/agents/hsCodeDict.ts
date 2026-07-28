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
export function classifyFishHS(
  name: string
): HSCodeDictEntry[] | null {
  if (!isFishSpecies(name)) {
    return null;
  }

  const normalizedName = normalizeItemName(name);

  /*
   * 조제 또는 통조림 여부를 먼저 확인합니다.
   *
   * 조제·보존처리된 어류는 일반적으로 제3류가 아닌
   * 제16류 검토가 필요할 수 있습니다.
   */
  if (
    /통조림|캔|조제|양념|소스|튀김|구이|익힌|canned|prepared|seasoned|cooked|fried|grilled/.test(
      normalizedName
    )
  ) {
    return [
      {
        keywords: [],
        code: '',
        description: '조제·보존처리 어류 — 세부 분류 확인 필요',
        confidence: '낮음 (확인 필요)',
        reasoning:
          '통조림, 조리, 양념 또는 소스 처리된 어류는 제3류가 아닌 HS 제16류에 분류될 수 있습니다. 어종, 조리방법, 배합비율과 포장형태를 확인해야 합니다.'
      }
    ];
  }

  /*
   * 어육, 필레, 다진 어육 등은 통어류와 분류가 달라질 수 있으므로
   * 정확한 세번을 임의로 추천하지 않습니다.
   */
  if (
    /필레|포|살코기|어육|다진|연육|fillet|fish meat|minced|surimi/.test(
      normalizedName
    )
  ) {
    return [
      {
        keywords: [],
        code: '',
        description: '어류 필레·어육 — 형태 및 보존상태 확인 필요',
        confidence: '낮음 (확인 필요)',
        reasoning:
          '어류 필레와 기타 어육은 통째 또는 절단된 어류와 다른 HS 소호가 적용될 수 있습니다. 어종, 냉동 여부, 뼈 포함 여부와 가공형태를 확인해야 합니다.'
      }
    ];
  }

  /*
   * 냉동 어류
   */
  if (/냉동|frozen/.test(normalizedName)) {
    return [
      {
        keywords: [],
        code: '',
        description: '냉동 어류 — HS 0303류 검토',
        confidence: '낮음 (확인 필요)',
        reasoning:
          '냉동 어류는 일반적으로 HS 0303류를 검토합니다. 다만 정확한 6자리 및 10자리 코드는 어종, 필레 여부, 절단 여부와 기타 가공상태에 따라 달라지므로 관세청 사전 또는 AI 분석으로 세부 코드를 확인해야 합니다.'
      }
    ];
  }

  /*
   * 신선 또는 냉장 어류
   *
   * 활어는 0301류일 수 있으므로 별도로 처리합니다.
   */
  if (/활어|살아있는|live fish|live/.test(normalizedName)) {
    return [
      {
        keywords: [],
        code: '',
        description: '활어 — HS 0301류 검토',
        confidence: '낮음 (확인 필요)',
        reasoning:
          '살아있는 어류는 일반적으로 HS 0301류를 검토합니다. 정확한 코드는 어종과 용도에 따라 달라질 수 있습니다.'
      }
    ];
  }

  if (/신선|생물|냉장|fresh|chilled/.test(normalizedName)) {
    return [
      {
        keywords: [],
        code: '',
        description: '신선·냉장 어류 — HS 0302류 검토',
        confidence: '낮음 (확인 필요)',
        reasoning:
          '신선하거나 냉장된 어류는 일반적으로 HS 0302류를 검토합니다. 정확한 세부 코드는 어종, 필레 여부와 절단상태에 따라 달라집니다.'
      }
    ];
  }

  /*
   * 훈제 어류
   */
  if (/훈제|smoked/.test(normalizedName)) {
    return [
      {
        keywords: [],
        code: '',
        description: '훈제 어류 — HS 0305류 검토',
        confidence: '낮음 (확인 필요)',
        reasoning:
          '훈제 어류는 일반적으로 HS 0305류를 검토합니다. 조리 여부, 어종과 세부 가공상태에 따라 정확한 소호가 달라질 수 있습니다.'
      }
    ];
  }

  /*
   * 건조 또는 염장 어류
   */
  if (
    /건조|말린|반건조|염장|소금에 절인|dried|salted|in brine/.test(
      normalizedName
    )
  ) {
    return [
      {
        keywords: [],
        code: '',
        description: '건조·염장 어류 — HS 0305류 검토',
        confidence: '낮음 (확인 필요)',
        reasoning:
          '건조 또는 염장한 어류는 일반적으로 HS 0305류를 검토합니다. 건조, 염장, 염수처리 여부와 어종에 따라 세부 소호가 달라집니다.'
      }
    ];
  }

  /*
   * 보존상태가 기재되지 않은 경우 임의로 추정하지 않습니다.
   */
  return [
    {
      keywords: [],
      code: '',
      description: '어류 — 보존상태 미기재',
      confidence: '낮음 (확인 필요)',
      reasoning:
        '어류는 보존상태와 가공형태에 따라 HS 분류가 달라집니다. 품목명에 활어, 신선, 냉장, 냉동, 건조, 염장, 훈제, 필레 또는 조제 여부를 포함해 주세요. 예: FROZEN HAIRTAIL.'
    }
  ];
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