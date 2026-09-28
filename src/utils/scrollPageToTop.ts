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

/**
 * 특정 영역의 맨 위에 화면을 맞춘다.
 *
 * 포워더 수출 업무 화면처럼 위쪽에 의뢰 수신함·페이지 제목이 길게 붙는 화면에서,
 * 단계를 넘길 때마다 페이지 최상단으로 올라가면 매번 다시 내려와야 한다.
 * 업무 카드부터 보이게 맞춘다.
 *
 * 화면이 지연 로딩(lazy)이라 아직 그려지지 않았을 수 있어 다음 프레임에 한 번 더 찾고,
 * 그래도 없으면 기존처럼 페이지 최상단으로 되돌린다.
 */
export function scrollElementToTop(selector: string): void {
  if (typeof window === 'undefined') return;
  const attempt = (retry: boolean): void => {
    const target = document.querySelector(selector);
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
      return;
    }
    if (retry) {
      window.requestAnimationFrame(() => attempt(false));
      return;
    }
    scrollPageToTop();
  };
  attempt(true);
}
