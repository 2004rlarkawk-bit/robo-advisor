// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShipperItem, TradeProfile } from '../types';
import { EMPTY_SHIPPER_SUPPLEMENTAL_STATE } from '../utils/shipperForm';
import ShipperWorkspaceForm from './ShipperWorkspaceForm';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const profile: TradeProfile = {
  tradeType: 'export', itemName: '코트', hsCode: '620211', loadPort: '인천항', dischargePort: '상하이항',
  incoterms: 'FOB', quantity: 2, weight: '', departureDate: '', arrivalDate: '', companyName: '인천테크',
  contact: '010-1234-5678', buyerName: 'Buyer Co', buyerAddress: 'Buyer Street', buyerCountry: 'US',
  partnerName: '', partnerAddress: '', partnerCountry: '', notifyPartyName: '', notifyPartyAddress: '',
  unit: 'EA', unitPrice: 10, currency: 'USD', packageCount: '', packageType: '', netWeight: '',
  grossWeight: '', measurement: '', paymentTerms: '',
};

const firstItem: ShipperItem = {
  id: 'primary-item', itemName: '코트', hsCode: '620211', quantity: 2, unit: 'EA', unitPrice: 10, currency: 'USD',
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderForm(items: ShipperItem[] = [firstItem], linked = false) {
  const onItemsChange = vi.fn();
  const onProfilePatch = vi.fn();
  const onSupplementalChange = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ShipperWorkspaceForm
        profile={profile}
        items={items}
        supplemental={{
          ...EMPTY_SHIPPER_SUPPLEMENTAL_STATE,
          buyerMatchesConsignee: linked,
          consigneeMatchesNotifyParty: linked,
        }}
        isProcessing={false}
        onProfilePatch={onProfilePatch}
        onItemsChange={onItemsChange}
        onSupplementalChange={onSupplementalChange}
        onReset={vi.fn()}
        onGenerate={vi.fn()}
      />,
    );
  });
  return { container, onItemsChange, onProfilePatch };
}

describe('화주용 통관 입력 폼', () => {
  it('품목을 추가하고 최소 한 품목에서는 삭제를 비활성화한다', () => {
    const rendered = renderForm();
    const buttons = Array.from(rendered.container.querySelectorAll<HTMLButtonElement>('button'));
    const addButton = buttons.find((button) => button.textContent?.includes('품목 추가'));
    const deleteButton = buttons.find((button) => button.textContent?.includes('삭제'));

    expect(deleteButton?.disabled).toBe(true);
    act(() => addButton?.click());
    expect(rendered.onItemsChange.mock.calls[0][0]).toHaveLength(2);
  });

  it('여러 품목 중 하나를 삭제해도 한 품목을 유지한다', () => {
    const rendered = renderForm([firstItem, { ...firstItem, id: 'second-item', itemName: '셔츠' }]);
    const deleteButtons = Array.from(rendered.container.querySelectorAll<HTMLButtonElement>('button'))
      .filter((button) => button.textContent?.includes('삭제'));

    act(() => deleteButtons[1]?.click());
    expect(rendered.onItemsChange.mock.calls[0][0]).toEqual([firstItem]);
  });

  it('연결 상태에서 Buyer 변경값을 Consignee와 Notify Party에 함께 전달한다', () => {
    const rendered = renderForm([firstItem], true);
    const buyerLabel = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent === 'Buyer 회사명');
    const input = buyerLabel?.parentElement?.querySelector('input');

    act(() => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Changed Buyer');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(rendered.onProfilePatch).toHaveBeenCalledWith({
      buyerName: 'Changed Buyer',
      partnerName: 'Changed Buyer',
      notifyPartyName: 'Changed Buyer',
    });
  });

  it('동일 정보 체크를 해제해도 연결된 입력값을 삭제하지 않는다', () => {
    const rendered = renderForm([firstItem], true);
    const buyerMatchesConsignee = rendered.container.querySelector<HTMLInputElement>('input[type="checkbox"]');

    act(() => buyerMatchesConsignee?.click());

    expect(rendered.onProfilePatch).not.toHaveBeenCalled();
  });

  it('다중 통화 품목은 Invoice 총액 대신 합산 불가 안내를 표시한다', () => {
    const rendered = renderForm([firstItem, { ...firstItem, id: 'krw-item', currency: 'KRW' }]);
    expect(rendered.container.textContent).toContain('통화가 서로 달라 Invoice 총액을 단순 합산하지 않습니다.');
  });

  it('프로필에서 초기화된 화주 기본정보를 표시하고 거래별로 직접 수정할 수 있다', () => {
    const rendered = renderForm();
    const companyInput = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent === '회사명(상호명)')
      ?.parentElement?.querySelector<HTMLInputElement>('input');

    expect(companyInput?.value).toBe('인천테크');
    expect(companyInput?.readOnly).toBe(false);

    act(() => {
      if (!companyInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(companyInput, 'Changed Exporter Co., Ltd.');
      companyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ companyName: 'Changed Exporter Co., Ltd.' });
    expect(rendered.container.textContent).not.toContain('통관고유부호');
  });
});
