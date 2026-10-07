/**
 * 가구(9403)의 소호를 재질로 바로 정하는 보조표.
 *
 * 9403 호는 재질이 소호를 가른다 — 금속(9403.10·20), 목재(9403.30~60), 플라스틱(9403.70),
 * 대나무(9403.82)·등나무(9403.83), 그 밖의 재료(돌·유리 등, 9403.89).
 * 그런데 관세청 HSK 사전의 말단 품명에는 "책상"이 목제 사무용(9403.30-1000)에만 있어서,
 * 품명 검색과 AI가 "Stone Desk"·"Marble Top Desk"까지 목제 책상으로 끌고 가거나
 * 숫돌(6804) 같은 엉뚱한 호를 고른다.
 * 품명에 가구 종류와 재질이 하나씩 분명하면 이 표로 소호를 먼저 정하고, AI는 그 안에서만 고르게 한다.
 *
 * 앉는 가구(의자 등)는 9401 호라 다루지 않는다. 재질이 둘 이상이면(예: 금속 다리 + 유리 상판)
 * 본질적 특성 판단이 필요하므로 정하지 않고 기존 추천 흐름에 맡긴다.
 */

type Material = 'metal' | 'wood' | 'plastic' | 'bamboo' | 'rattan' | 'other';

const FURNITURE = /\b(desks?|tables?|cabinets?|book ?cases?|book ?shelf|book ?shelves|shelf|shelves|shelving|wardrobes?|drawers?|dressers?)\b|책상|테이블|탁자|캐비닛|책장|선반|서랍장|옷장/i;
/**
 * 가구 단어가 수식어로만 쓰인 다른 물건 — "Desk Lamp", "Desk Organizer", "Table Cloth".
 * 이 규칙은 소호를 강제로 정하므로, 여기 걸리면 정하지 않고 AI 추천에 맡긴다.
 */
const NOT_FURNITURE = /\b(lamps?|lights?|lighting|chandeliers?|organi[sz]ers?|sundries|boxes|box|trays?|mats?|pads?|clocks?|fans?|calendars?|cloths?|covers?|hooks?|knobs?|handles?|legs?|parts?|accessor(y|ies))\b|스탠드|조명|램프|정리함|수납함|트레이|매트|패드|시계|선풍기|달력|커버|손잡이|부품/i;
const SEAT = /\b(chairs?|stools?|sofas?|benches|bench|seats?)\b|의자|소파|스툴|벤치/i;
const OFFICE = /\b(desks?|office|filing)\b|책상|사무/i;

// 대나무·등나무를 먼저 본다 — "bamboo"는 "wood"와 겹치지 않지만 한글 "나무"는 "대나무"·"등나무" 안에 들어 있다.
const MATERIALS: Array<[Material, RegExp]> = [
  ['bamboo', /\bbamboo\b|대나무/i],
  ['rattan', /\brattan\b|등나무/i],
  ['metal', /\b(metal|metallic|steel|iron|alumini?um|stainless)\b|철제|금속|스틸|강철|알루미늄/i],
  ['wood', /\b(wood|wooden|oak|pine|walnut|teak|timber|plywood|mdf)\b|원목|목재|목제|(?<![대등])나무/i],
  ['plastic', /\b(plastics?|acrylic|polypropylene|pvc)\b|플라스틱|아크릴/i],
  ['other', /\b(stone|marble|granite|glass|concrete|ceramic)\b|석재|대리석|화강암|유리|콘크리트|돌/i],
];

/** 가구 품명이면 재질에 맞는 6자리 소호(예: "940310"), 판단할 수 없으면 null. */
export function furnitureSubheadingForQuery(text: string): string | null {
  const query = text.trim();
  if (!query || !FURNITURE.test(query) || SEAT.test(query) || NOT_FURNITURE.test(query)) return null;

  const found = MATERIALS.filter(([, pattern]) => pattern.test(query)).map(([material]) => material);
  if (found.length !== 1) return null;

  const office = OFFICE.test(query);
  switch (found[0]) {
    case 'metal': return office ? '940310' : '940320';
    case 'wood': return office ? '940330' : '940360';
    case 'plastic': return '940370';
    case 'bamboo': return '940382';
    case 'rattan': return '940383';
    case 'other': return '940389';
  }
}
