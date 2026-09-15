/**
 * 확인 항목 표시 정리.
 * - 규칙 번호(IR8. 등)는 내부 기준이라 사용자에게 보이지 않게 제목 앞에서 뗀다.
 * - 업로드 파일 내부 id(UUID)는 문서 이름이 아니므로 관련 서류 칩에서 뺀다.
 * 이미 저장된 옛 결과에도 적용되도록 화면에서 한 번 더 거른다.
 */
const RULE_PREFIX = /^IR\d+\.\s*/i;
const INTERNAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanRiskTitle(title: string): string {
  return title.replace(RULE_PREFIX, '');
}

export function displayRelatedDocuments(documents: string[]): string[] {
  return [...new Set(documents.map((doc) => doc.trim()).filter((doc) => doc && !INTERNAL_ID.test(doc)))];
}
