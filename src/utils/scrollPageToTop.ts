/**
 * 화면을 최상단으로 되돌린다.
 *
 * 단계를 넘기거나 메뉴를 바꿀 때 이전 스크롤 위치가 남으면, 새 화면이 중간이나
 * 맨 아래부터 보여 사용자가 직접 위로 올려야 한다. 창 스크롤과 본문 컨테이너
 * 스크롤이 따로 움직이므로 둘 다 초기화한다.
 */
export function scrollPageToTop(): void {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  document.querySelector('.content-body')?.scrollTo?.(0, 0);
}
