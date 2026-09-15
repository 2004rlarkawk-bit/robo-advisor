// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { installPlaceholderTabFill, placeholderFillValue } from './placeholderTabFill';

describe('placeholderFillValue', () => {
  it('예시 값은 채우고 "예:" 접두어는 뗀다', () => {
    expect(placeholderFillValue('예: ABCDE2020123')).toBe('ABCDE2020123');
    expect(placeholderFillValue('123 Teheran-ro, Gangnam-gu')).toBe('123 Teheran-ro, Gangnam-gu');
    expect(placeholderFillValue('홍길동')).toBe('홍길동');
    expect(placeholderFillValue('예: 지게차 없음 · 오전 배송 희망')).toBe('지게차 없음 · 오전 배송 희망');
  });

  it('안내·형식 문구는 채우지 않는다', () => {
    ['선적항을 선택하세요', '숫자만 입력하세요', '5자리', '010-0000-0000', '관세청에서 부여받은 부호', '비우면 선적항과 동일하게 처리', '']
      .forEach((text) => expect(placeholderFillValue(text)).toBeNull());
  });
});

describe('installPlaceholderTabFill', () => {
  let uninstall: (() => void) | undefined;
  afterEach(() => { uninstall?.(); document.body.innerHTML = ''; });

  const pressTab = (element: HTMLElement, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...init });
    element.dispatchEvent(event);
    return event;
  };

  it('빈 칸에서 Tab 을 누르면 예시 값을 채우고 이동을 막는다', () => {
    uninstall = installPlaceholderTabFill();
    const input = document.createElement('input');
    input.placeholder = '예: ABCDE2020123';
    let inputEvents = 0;
    input.addEventListener('input', () => { inputEvents += 1; });
    document.body.appendChild(input);

    const event = pressTab(input);
    expect(input.value).toBe('ABCDE2020123');
    expect(event.defaultPrevented).toBe(true);
    expect(inputEvents).toBe(1);

    // 이미 값이 있으면 원래대로 다음 칸으로 이동
    expect(pressTab(input).defaultPrevented).toBe(false);
  });

  it('값이 있거나 Shift+Tab·읽기전용·안내 문구면 건드리지 않는다', () => {
    uninstall = installPlaceholderTabFill();
    const filled = Object.assign(document.createElement('input'), { placeholder: '홍길동', value: '김지민' });
    const readOnly = Object.assign(document.createElement('input'), { placeholder: '홍길동', readOnly: true });
    const guide = Object.assign(document.createElement('input'), { placeholder: '5자리' });
    const shift = Object.assign(document.createElement('input'), { placeholder: '홍길동' });
    document.body.append(filled, readOnly, guide, shift);

    pressTab(filled);
    pressTab(readOnly);
    pressTab(guide);
    pressTab(shift, { shiftKey: true });
    expect([filled.value, readOnly.value, guide.value, shift.value]).toEqual(['김지민', '', '', '']);
  });
});
