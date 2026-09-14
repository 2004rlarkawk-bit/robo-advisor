// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OnboardingTour from './OnboardingTour';
import GuidePanel from './GuidePanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  localStorage.clear();
  vi.useRealTimers();
});

function renderWithMenu() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(
    <>
      <div className="menu-item">AI 통관 작업실</div>
      <GuidePanel />
      <OnboardingTour />
    </>,
  ));
  return container;
}

describe('OnboardingTour 다시 보기', () => {
  it('이미 투어를 본 사용자는 자동으로 뜨지 않지만 [알리미 다시 보기]로 1단계부터 다시 뜬다', () => {
    vi.useFakeTimers();
    localStorage.setItem('portai_tour_done_v1', '1');
    const view = renderWithMenu();

    act(() => { vi.advanceTimersByTime(1000); });
    expect(view.querySelector('.pot-tip')).toBeNull();

    const replay = [...view.querySelectorAll('button')].find((b) => b.textContent?.includes('알리미 다시 보기'));
    expect(replay).toBeTruthy();
    act(() => { replay!.click(); });
    act(() => { vi.advanceTimersByTime(500); });

    const tip = view.querySelector('.pot-tip');
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('STEP 1');
  });
});

describe('GuidePanel 수출/수입 탭', () => {
  it('기본은 수출 흐름과 서류 6종을 보여주고, 수입 탭을 누르면 수입 흐름으로 바뀐다', () => {
    const view = renderWithMenu();
    expect(view.textContent).toContain('필요 서류 자동 생성');
    expect(view.textContent).toContain('수출 서류 6종');
    expect(view.textContent).not.toContain('서류 업로드 · AI 분석');

    const importTab = [...view.querySelectorAll('button[role="tab"]')].find((b) => b.textContent?.includes('수입할 때'));
    act(() => { (importTab as HTMLButtonElement).click(); });

    expect(view.textContent).toContain('서류 업로드 · AI 분석');
    expect(view.textContent).not.toContain('수출 서류 6종');
  });

  it('FAQ는 공통·수출·수입 탭으로 나뉘고, 고른 묶음의 질문만 보인다', () => {
    const view = renderWithMenu();
    const faqTabs = [...view.querySelectorAll('.gs-faq-tab')];
    expect(faqTabs.map((el) => el.textContent)).toEqual(['공통', '수출', '수입']);

    // 기본은 공통
    expect(view.textContent).toContain('작성하다가 나가면 어떻게 되나요?');
    expect(view.textContent).not.toContain('해외 서류에 적힌 HS CODE를 그대로 쓰면 되나요?');

    act(() => { (faqTabs[2] as HTMLButtonElement).click(); });
    expect(view.textContent).toContain('해외 서류에 적힌 HS CODE를 그대로 쓰면 되나요?');
    expect(view.textContent).not.toContain('작성하다가 나가면 어떻게 되나요?');
  });
});
