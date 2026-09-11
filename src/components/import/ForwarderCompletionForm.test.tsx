// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForwarderCompletionForm from './ForwarderCompletionForm';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function render(busy = false) {
  const onConfirm = vi.fn(async () => undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<ForwarderCompletionForm busy={busy} onCancel={() => undefined} onConfirm={onConfirm} />));
  return onConfirm;
}
async function fill(selector: string, value: string) {
  const input = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  await act(async () => {
    const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => { container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
async function acknowledge() {
  await act(async () => { container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click(); });
}
describe('수입 업무 완료 기록', () => {
  it('확인 근거·반출일·실제 확인 동의가 모두 있어야 완료한다', async () => {
    const onConfirm = render();
    await submit();
    expect(onConfirm).not.toHaveBeenCalled();
    await fill('textarea', '  관세사 확인 문서 REF-001  ');
    await fill('input[type="date"]', '2025-01-02');
    await submit();
    expect(onConfirm).not.toHaveBeenCalled();
    await acknowledge();
    await submit();
    expect(onConfirm).toHaveBeenCalledWith('관세사 확인 문서 REF-001', '2025-01-02');
  });
  it('미래 반출일은 완료 기록으로 저장하지 않는다', async () => {
    const onConfirm = render();
    await fill('textarea', '확인 문서');
    await fill('input[type="date"]', '2999-12-31');
    await acknowledge();
    await submit();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('button:not([type="button"])')?.disabled).toBe(true);
  });
  it('저장 중에는 중복 제출하지 않는다', async () => {
    const onConfirm = render(true);
    await fill('textarea', '확인 문서');
    await fill('input[type="date"]', '2025-01-02');
    await acknowledge();
    await submit();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
