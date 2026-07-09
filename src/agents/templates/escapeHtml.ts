/**
 * HTML 이스케이프 유틸
 *
 * 문서 템플릿은 사용자 입력(품목명·업체명·주소 등)과 LLM 응답을
 * HTML 문자열에 보간한 뒤 dangerouslySetInnerHTML/innerHTML로 렌더링한다.
 * 보간되는 모든 값은 반드시 이 함수를 거쳐야 XSS(스크립트 주입)를 막을 수 있다.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
