/** 한글은 2글자("백팩", "라면")도 품목명으로 충분하다. 영문 등은 3글자부터 HS 추천을 요청한다. */
export function isSearchableItemName(itemName: string): boolean {
  const normalized = itemName.trim();
  return /[가-힣]/.test(normalized)
    ? normalized.length >= 2
    : normalized.length >= 3;
}
