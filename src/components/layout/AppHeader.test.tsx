// @vitest-environment happy-dom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppHeader from './AppHeader';

vi.mock('../NotificationBell', () => ({ default: () => <button>알림</button> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AppHeader role label', () => {
  let container: HTMLDivElement;
  let root: Root;
  const props = {
    collapsed: true,
    user: { id: 'test', email: 'test@example.com', type: 'member' },
    profile: { contact_name: '담당자', company_name: '테스트 회사' },
    onToggleSidebar: vi.fn(), onNavigate: vi.fn(), onLogout: vi.fn(),
  } as unknown as ComponentProps<typeof AppHeader>;

  beforeEach(() => { container = document.createElement('div'); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); vi.clearAllMocks(); });

  it('updates the label and header theme when the workspace role changes', () => {
    act(() => root.render(<AppHeader {...props} forwarderMode />));
    expect(container.querySelector('.header--forwarder')).not.toBeNull();
    expect(container.querySelector('.header-role-chip')?.textContent).toBe('포워더 업무');
    act(() => root.render(<AppHeader {...props} forwarderMode={false} />));
    expect(container.querySelector('.header--shipper')).not.toBeNull();
    expect(container.querySelector('.header-role-chip')?.textContent).toBe('화주 업무');
    expect(container.querySelector('.header-product-name')?.textContent).toBe('PortAI');
    expect(container.textContent).not.toContain('포워더 업무');
  });

  it('keeps the existing navigation and account controls in shipper mode', () => {
    act(() => root.render(<AppHeader {...props} />));
    expect(container.textContent).toContain('알림');
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="사용 안내 페이지로 이동"]')!.click());
    expect(props.onNavigate).toHaveBeenCalledWith('guide');
    act(() => container.querySelector<HTMLButtonElement>('.btn-logout')!.click());
    expect(props.onLogout).toHaveBeenCalledOnce();
  });
});
