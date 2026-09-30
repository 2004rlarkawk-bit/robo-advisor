// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollElementToTop, scrollPageToTop } from './scrollPageToTop';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('화면 최상단으로 되돌리기', () => {
  it('창 스크롤을 맨 위로 올린다', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    scrollPageToTop();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('본문 컨테이너도 함께 올린다 — 창만 올리면 컨테이너가 내려간 채로 남는다', () => {
    vi.stubGlobal('scrollTo', vi.fn());
    const body = document.createElement('div');
    body.className = 'content-body';
    const containerScroll = vi.fn();
    Object.assign(body, { scrollTo: containerScroll });
    document.body.append(body);

    scrollPageToTop();

    expect(containerScroll).toHaveBeenCalledWith(0, 0);
  });

  it('본문 컨테이너가 없어도 오류 없이 지나간다', () => {
    vi.stubGlobal('scrollTo', vi.fn());
    expect(() => scrollPageToTop()).not.toThrow();
  });
});

describe('특정 영역의 맨 위로 맞추기', () => {
  it('찾은 영역의 위쪽에 화면을 맞춘다', () => {
    vi.stubGlobal('scrollTo', vi.fn());
    const workspace = document.createElement('div');
    workspace.className = 'fwd-workspace';
    const scrollIntoView = vi.fn();
    Object.assign(workspace, { scrollIntoView });
    document.body.append(workspace);

    scrollElementToTop('.fwd-workspace');

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('아직 그려지지 않았으면 다음 프레임에 한 번 더 찾는다 — 화면이 지연 로딩된다', async () => {
    const pageScroll = vi.fn();
    vi.stubGlobal('scrollTo', pageScroll);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });

    scrollElementToTop('.fwd-workspace');
    expect(pageScroll).not.toHaveBeenCalled();

    // 다음 프레임에 화면이 붙은 경우
    const workspace = document.createElement('div');
    workspace.className = 'fwd-workspace';
    const scrollIntoView = vi.fn();
    Object.assign(workspace, { scrollIntoView });
    document.body.append(workspace);
    frames[0]?.(0);

    expect(scrollIntoView).toHaveBeenCalled();
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it('끝까지 못 찾으면 페이지 최상단으로 되돌린다', () => {
    const pageScroll = vi.fn();
    vi.stubGlobal('scrollTo', pageScroll);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    scrollElementToTop('.fwd-workspace');

    expect(pageScroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });
});
