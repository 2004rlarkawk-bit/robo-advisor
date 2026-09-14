/**
 * 가방류(4202) HS 소호의 분류 기준(제품 종류·외면 소재) 보조표.
 *
 * 관세청 HSK 사전은 10자리 말단 품명만 담고 있어, 4202 호는 대부분
 * "기타 / Other", "방직용 섬유재료로 만든 것 / Of textile materials"처럼
 * 제품 종류가 빠진 품명뿐이다. 그래서
 *  - "backpack"으로 검색해도 배낭 코드(4202.92)가 걸리지 않고
 *  - AI 추천 후보가 모두 "기타 (합성수지제 가방)"으로 보여
 *    여행가방(4202.1x)·핸드백(4202.2x)·지갑(4202.3x)·배낭(4202.9x)을 구분하지 못한다.
 * 실제 구분 기준은 상위 소호 문구에만 있으므로 이 표로 보완한다.
 *
 * 문구는 HS 2022 품목분류표(WCO) 호·소호 용어를 따른다.
 */

interface BagGroup {
  ko: string;
  en: string;
}

interface BagSurface {
  ko: string;
  en: string;
}

const suitcase: BagGroup = {
  ko: '트렁크·슈트케이스·서류가방·학생가방류',
  en: 'trunks, suitcases, briefcases, school satchels and similar containers',
};
const handbag: BagGroup = {
  ko: '핸드백',
  en: 'handbags',
};
const pocketArticle: BagGroup = {
  ko: '지갑 등 주머니·핸드백에 넣는 물품',
  en: 'articles of a kind normally carried in the pocket or in the handbag',
};
const otherBag: BagGroup = {
  ko: '기타 가방류(배낭·여행가방·운동가방·쇼핑백·공구가방 등)',
  en: 'other bags (rucksacks, travelling-bags, sports bags, shopping-bags, tool bags, etc.)',
};

const leather: BagSurface = { ko: '외면이 가죽', en: 'outer surface of leather' };
const plasticOrTextile: BagSurface = {
  ko: '외면이 플라스틱(시트) 또는 방직용 섬유',
  en: 'outer surface of plastics or textile materials',
};
const otherSurface: BagSurface = { ko: '외면이 그 밖의 소재', en: 'outer surface of other materials' };

const SUBHEADING_SCOPE: Record<string, { group: BagGroup; surface: BagSurface }> = {
  '420211': { group: suitcase, surface: leather },
  '420212': { group: suitcase, surface: plasticOrTextile },
  '420219': { group: suitcase, surface: otherSurface },
  '420221': { group: handbag, surface: leather },
  '420222': { group: handbag, surface: plasticOrTextile },
  '420229': { group: handbag, surface: otherSurface },
  '420231': { group: pocketArticle, surface: leather },
  '420232': { group: pocketArticle, surface: plasticOrTextile },
  '420239': { group: pocketArticle, surface: otherSurface },
  '420291': { group: otherBag, surface: leather },
  '420292': { group: otherBag, surface: plasticOrTextile },
  '420299': { group: otherBag, surface: otherSurface },
};

/**
 * 후보 품명에 가방 소호 기준을 덧붙인다 (AI 추천 입력용).
 * "방직용 섬유재료로 만든 것" + 4202.92 → "방직용 섬유재료로 만든 것 [기타 가방류(배낭…) · 외면이 플라스틱(시트) 또는 방직용 섬유]"
 * 보조표 대상이 아니면 원래 품명을 그대로 돌려준다.
 */
export function annotateBagNames(
  code: string,
  koreanName: string,
  englishName: string,
): { koreanName: string; englishName: string } {
  const scope = SUBHEADING_SCOPE[code.replace(/\D/g, '').slice(0, 6)];
  if (!scope) return { koreanName, englishName };
  return {
    koreanName: `${koreanName} [${scope.group.ko} · ${scope.surface.ko}]`,
    englishName: englishName
      ? `${englishName} [${scope.group.en}, ${scope.surface.en}]`
      : englishName,
  };
}

/**
 * 품목 단어 → 해당 가방 소호.
 * 배낭은 사전 품명에 "rucksack·backpack·배낭"이 없어 검색으로 찾을 수 없으므로
 * 검색어를 소호로 직접 이어 준다. 외면 소재는 입력에 없을 수 있어 세 소호를 모두 올린다.
 */
const BAG_QUERY_INDEX: Array<{ pattern: RegExp; prefixes: string[] }> = [
  {
    pattern: /\b(back\s?-?packs?|rucksacks?|knapsacks?)\b|배낭|백팩/i,
    prefixes: ['420292', '420291', '420299'],
  },
];

/** 검색어가 가방 품목 단어면 후보로 끌어올 소호 목록. 해당 없으면 빈 배열. */
export function bagPrefixesForQuery(query: string): string[] {
  const prefixes = new Set<string>();
  for (const { pattern, prefixes: list } of BAG_QUERY_INDEX) {
    if (pattern.test(query)) list.forEach((prefix) => prefixes.add(prefix));
  }
  return Array.from(prefixes);
}
