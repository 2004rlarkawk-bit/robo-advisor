// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CountrySelect from './CountrySelect';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderSelect(value = '') {
  const onChange = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<CountrySelect value={value} onChange={onChange} />));
  return { container, onChange };
}

describe('CountrySelect', () => {
  it('stores the English country value selected from the shared options', () => {
    const rendered = renderSelect();
    const select = rendered.container.querySelector('select');

    act(() => {
      if (!select) return;
      select.value = 'United States';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(rendered.onChange).toHaveBeenCalledWith('United States');
  });

  it('shows a direct input for Other and forwards the typed English value', () => {
    const rendered = renderSelect();
    const select = rendered.container.querySelector('select');

    act(() => {
      if (!select) return;
      select.value = '__other__';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const input = rendered.container.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();

    act(() => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Canada');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(rendered.onChange).toHaveBeenLastCalledWith('Canada');
  });
});
