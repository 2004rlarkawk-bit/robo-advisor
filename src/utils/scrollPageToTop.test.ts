// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollPageToTop } from './scrollPageToTop';

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
