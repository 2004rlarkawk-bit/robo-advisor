// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../services/profileService';
import ProfileForm from './ProfileForm';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const profile: UserProfile = {
  id: 'user-1',
  email: 'member@example.com',
  company_name: '인천테크',
  company_address: null,
  business_number: null,
  customs_clearance_code: null,
  contact_name: null,
  phone: null,
  country: null,
  default_load_port: null,
  default_discharge_port: null,
  default_incoterm: null,
  service_role: 'integrated',
  role: 'user',
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderForm(requireExplicitServiceRole = false) {
  const onSubmit = vi.fn(async () => undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ProfileForm
        profile={profile}
        submitLabel={'저장'}
        isSaving={false}
        onSubmit={onSubmit}
        requireExplicitServiceRole={requireExplicitServiceRole}
      />,
    );
  });
  return { container, onSubmit };
}

describe('ProfileForm 서비스 이용 목적 선택', () => {
  it('프로필 기본정보와 선택 통관고유부호를 수정하고 저장 payload로 전달한다', async () => {
    const rendered = renderForm();
    const labels = Array.from(rendered.container.querySelectorAll('label'));
    const companyInput = labels.find((label) => label.textContent?.includes('회사명'))?.querySelector('input');
    const customsCodeInput = labels.find((label) => label.textContent?.includes('통관고유부호'))?.querySelector('input');

    expect(companyInput?.readOnly).toBe(false);
    expect(companyInput?.disabled).toBe(false);
    expect(customsCodeInput?.readOnly).toBe(false);
    expect(customsCodeInput?.required).toBe(false);

    await act(async () => {
      if (!customsCodeInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(customsCodeInput, 'P123456789012');
      customsCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      rendered.container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(rendered.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ customs_clearance_code: 'P123456789012' }));
  });

  it('온보딩에서는 역할을 명시적으로 선택하기 전 저장하지 않는다', async () => {
    const rendered = renderForm(true);
    const form = rendered.container.querySelector('form');

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(rendered.onSubmit).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain('서비스 이용 목적');
  });

  it('온보딩에서는 담당자명, 회사 연락처, 국가가 없으면 저장하지 않는다', async () => {
    const rendered = renderForm(true);
    const shipper = rendered.container.querySelector<HTMLButtonElement>('[role="radio"]');

    await act(async () => shipper?.click());
    await act(async () => {
      rendered.container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const requiredInputs = rendered.container.querySelectorAll<HTMLInputElement>('input[required]');
    const countrySelect = Array.from(rendered.container.querySelectorAll<HTMLSelectElement>('select'))
      .find((select) => select.options[0]?.textContent === 'Select a country');
    expect(requiredInputs).toHaveLength(3);
    expect(countrySelect?.required).toBe(true);
    expect(rendered.onSubmit).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain('담당자명, 회사 연락처, 국가');
  });

  it('온보딩에서 선택한 역할을 기존 프로필 값과 함께 전달한다', async () => {
    const rendered = renderForm(true);
    const shipper = rendered.container.querySelector<HTMLButtonElement>('[role="radio"]');
    const form = rendered.container.querySelector('form');

    const labels = Array.from(rendered.container.querySelectorAll('label'));
    const contactName = labels.find((label) => label.textContent?.includes('담당자명'))?.querySelector('input');
    const companyPhone = labels.find((label) => label.textContent?.includes('회사 연락처'))?.querySelector('input');
    const country = Array.from(rendered.container.querySelectorAll<HTMLSelectElement>('select'))
      .find((select) => select.options[0]?.textContent === 'Select a country');

    await act(async () => shipper?.click());
    await act(async () => {
      if (contactName) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(contactName, 'Gildong Hong');
        contactName.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (companyPhone) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(companyPhone, '+82-2-1234-5678');
        companyPhone.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (country) {
        country.value = 'South Korea';
        country.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(rendered.onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      company_name: '인천테크',
      contact_name: 'Gildong Hong',
      phone: '+82-2-1234-5678',
      country: 'South Korea',
      service_role: 'shipper',
    }));
  });

  it('프로필 설정에서는 기존 integrated 역할을 선택 상태로 표시한다', () => {
    const rendered = renderForm();
    const selected = rendered.container.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]');

    expect(selected?.textContent).toContain('화주·포워더 통합');
  });

  it('프로필 설정에서 변경한 역할을 저장 값으로 전달한다', async () => {
    const rendered = renderForm();
    const forwarder = Array.from(rendered.container.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
      .find((button) => button.textContent?.includes('포워더') && !button.textContent.includes('통합'));
    const form = rendered.container.querySelector('form');

    await act(async () => forwarder?.click());
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(rendered.container.textContent).not.toContain('업무 설정');
    expect(rendered.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ service_role: 'forwarder' }));
    const submitted = (rendered.onSubmit.mock.calls as unknown as [[Record<string, unknown>]])[0][0];
    expect(submitted).not.toHaveProperty('industry');
    expect(submitted).not.toHaveProperty('trade_purpose');
  });
});
