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
    keywords: ['it기기', 'it 기기', '컴퓨터', 'computer', '노트북', '태블릿', 'tablet'],
    code: '8471.30-0000',
    description: '휴대용 자동자료처리기계 (노트북, 태블릿 등)',
    confidence: '높음',
    reasoning: '휴대용 퍼스널 컴퓨터 및 자동자료처리기계 분류군에 해당합니다.'
  },
  {
    keywords: ['it기기', 'it 기기', '네트워크', '라우터', 'router', '허브', 'hub', '통신기기'],
    code: '8517.62-0000',
    description: '송수신용 통신기기 (네트워크 스위치, 라우터 등)',
    confidence: '높음',
    reasoning: '데이터 송수신 및 네트워크 변환을 위한 통신기기에 해당합니다.'
  },
  
  // 2. 반도체 / Semiconductors
  {
    keywords: ['반도체', 'semiconductor', 'ic', '칩', 'chip', '프로세서', 'processor'],
    code: '8542.31-0000',
    description: '전자집적회로 - 프로세서와 컨트롤러',
    confidence: '높음',
    reasoning: '컴퓨터나 전기 기기의 연산 및 제어를 담당하는 집적회로 반도체입니다.'
  },
  {
    keywords: ['반도체', 'semiconductor', '메모리', 'memory', 'dram', 'nand', '낸드'],
    code: '8542.32-0000',
    description: '전자집적회로 - 메모리',
    confidence: '높음',
    reasoning: '데이터 저장 용도로 사용되는 DRAM, NAND 플래시 등의 반도체 메모리입니다.'
  },

  // 3. 의류 / Clothing
  {
    keywords: ['의류', '옷', '티셔츠', 't-shirt', 't셔츠', 'shirt', '셔츠', '면티'],
    code: '6109.10-0000',
    description: '면제 티셔츠 (편직물/니트 재질)',
    confidence: '높음',
    reasoning: '면 재질로 제작된 니트/편직물 티셔츠 및 메리야스류 품목입니다.'
  },
  {
    keywords: ['의류', '옷', '바지', 'pants', 'trousers', '청바지', 'jeans'],
    code: '6203.42-0000',
    description: '남성용 면 바지 (직물 재질)',
    confidence: '보통',
    reasoning: '편직물이 아닌 면직물 재질의 남성용 바지, 작업복, 데님 팬츠 분류입니다.'
  },

  // 4. 자동차 부품 / Automotive Parts
  {
    keywords: ['자동차 부품', '자동차부품', 'car parts', 'auto parts', '차체', 'body parts'],
    code: '8708.29-9000',
    description: '자동차 차체의 부분품과 부속품',
    confidence: '높음',
    reasoning: '차체 조립 및 외장에 사용되는 기계식 차량 부품입니다.'
  },
  {
    keywords: ['자동차 부품', '자동차부품', 'car parts', 'auto parts', '브레이크', 'brake'],
    code: '8708.30-0000',
    description: '차량용 브레이크 및 그 부분품',
    confidence: '높음',
    reasoning: '차량 제동 장치와 브레이크 서보, 관련 핵심 제동 부품류입니다.'
  },

  // 5. 커피 / Coffee
  {
    keywords: ['커피', 'coffee', '생두', 'green bean'],
    code: '0901.11-0000',
    description: '커피 생두 (카페인을 제거하지 않은 생두)',
    confidence: '높음',
    reasoning: '로스팅을 거치지 않은 가공 전 커피 나무의 씨앗(생두)에 해당합니다.'
  },
  {
    keywords: ['커피', 'coffee', '원두', 'roasted coffee', '로스팅'],
    code: '0901.21-0000',
    description: '볶은 커피 원두 (카페인을 제거하지 않은 것)',
    confidence: '높음',
    reasoning: '로스팅 공정을 거쳐 바로 분쇄 및 추출이 가능한 볶은 원두 제품군입니다.'
  },

  // 6. 플라스틱 / Plastic
  {
    keywords: ['플라스틱', 'plastic', '용기', '제품', '사출'],
    code: '3926.90-9000',
    description: '기타 플라스틱 제품',
    confidence: '낮음 (확인 필요)',
    reasoning: '단순 플라스틱 재질 표시만으로는 세부 용도 판별이 불가능하여, 수입 신고 전 실제 용도 및 구성 요소의 정밀 확인이 필요합니다.'
  },
  {
    keywords: ['플라스틱', 'plastic', '필름', 'film', '시트', 'sheet'],
    code: '3920.10-0000',
    description: '비가공 에틸렌계 플라스틱 필름/시트',
    confidence: '보통',
    reasoning: '포장용 등으로 널리 활용되는 비가공 또는 반가공 에틸렌 중합체의 판, 시트, 필름입니다.'
  },
  {
    keywords: ['플라스틱', 'plastic', '원료', '수지', 'resin', 'pe', 'ldpe'],
    code: '3901.10-0000',
    description: '저밀도 폴리에틸렌 원자재 수지',
    confidence: '낮음 (확인 필요)',
    reasoning: '플라스틱 사출 원료로 사용되는 폴리에틸렌 수지로, 밀도 및 분자량 확인을 위한 시험성적서 검토가 요구됩니다.'
  }
];

export function findHSCodesByItemName(itemName: string): HSCodeDictEntry[] {
  const cleanName = itemName.toLowerCase().trim();
  if (!cleanName) return [];

  // 키워드 매칭 수행
  const matches = hsCodeDict.filter(entry =>
    entry.keywords.some(kw => cleanName.includes(kw))
  );

  // 일치하는 항목이 없을 경우 플라스틱 등 기본 폴백 제공
  if (matches.length === 0) {
    if (cleanName.includes('플라스틱') || cleanName.includes('plastic')) {
      return hsCodeDict.filter(entry => entry.keywords.includes('플라스틱'));
    }
    // 일반 폴백
    return [
      {
        keywords: [],
        code: '9999.99-0000',
        description: '일반 상품 - 분류 미확정',
        confidence: '낮음 (확인 필요)',
        reasoning: '정확한 분류를 위해 더 구체적인 용도나 재질 정보(원재료명, 용도 등)를 품목명에 기재해 주세요.'
      }
    ];
  }

  return matches;
}
