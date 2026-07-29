// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShipperItem, ShipperSupplementalState, TradeProfile } from '../types';
import { EMPTY_SHIPPER_SUPPLEMENTAL_STATE } from '../utils/shipperForm';

const { recommendMock } = vi.hoisted(() => ({
  recommendMock: vi.fn(),
}));

vi.mock('../services/shipperHSCodeSuggestionService', () => ({
  recommendShipperHSCode: recommendMock,
  normalizeHSKCode: (code: string) => code.replace(/[\s.-]/g, ''),
}));

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

beforeEach(() => {
  recommendMock.mockReset();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

function renderForm(
  items: ShipperItem[] = [firstItem],
  linked = false,
  profileOverride: Partial<TradeProfile> = {},
  supplementalOverride: Partial<ShipperSupplementalState> = {},
  profileSignerDefault = '',
) {
  const onItemsChange = vi.fn();
  const onProfilePatch = vi.fn();
  const onSupplementalChange = vi.fn();
  const onGenerate = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const renderItems = (currentItems: ShipperItem[]) => act(() => {
    root?.render(
      <ShipperWorkspaceForm
        profile={{ ...profile, ...profileOverride }}
        items={currentItems}
        supplemental={{
          ...EMPTY_SHIPPER_SUPPLEMENTAL_STATE,
          buyerMatchesConsignee: linked,
          consigneeMatchesNotifyParty: linked,
          ...supplementalOverride,
        }}
        isProcessing={false}
        profileSignerDefault={profileSignerDefault}
        onProfilePatch={onProfilePatch}
        onItemsChange={onItemsChange}
        onSupplementalChange={onSupplementalChange}
        onReset={vi.fn()}
        onGenerate={onGenerate}
      />,
    );
  });
  renderItems(items);
  return {
    container,
    onItemsChange,
    onProfilePatch,
    onSupplementalChange,
    onGenerate,
    rerenderItems: renderItems,
  };
}

describe('화주용 통관 입력 폼', () => {
  it('영문 품명 입력란 하나만 표시하고 itemName을 직접 수정한다', () => {
    const item = { ...firstItem, itemName: "Women's Coats" };
    const rendered = renderForm([item]);
    const labels = Array.from(rendered.container.querySelectorAll('label'));
    const descriptionLabels = labels.filter((label) =>
      label.textContent?.includes('영문 품명 Goods Description')
    );
    const legacyKoreanLabel = labels.find((label) => label.textContent?.trim() === '품명');
    const input = descriptionLabels[0]?.parentElement?.querySelector<HTMLInputElement>('input');

    expect(descriptionLabels).toHaveLength(1);
    expect(legacyKoreanLabel).toBeUndefined();
    expect(input?.required).toBe(true);
    expect(input?.placeholder).toBe("Women's 100% Cotton T-shirts, Black");
    expect(rendered.container.textContent).not.toContain('AI 영문 품명을 생성하고 있습니다.');
    expect(rendered.container.textContent).not.toContain('자동입력에 실패했습니다.');

    act(() => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        ?.set?.call(input, 'Black Cotton T-shirts');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rendered.onItemsChange).toHaveBeenLastCalledWith([
      { ...item, itemName: 'Black Cotton T-shirts' },
    ]);
  });

  it('한글이 포함되면 영문 입력 안내를 표시하고 문서 생성을 막는다', () => {
    const rendered = renderForm([{ ...firstItem, itemName: 'Cotton 티셔츠' }]);
    const generateButton = Array.from(
      rendered.container.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('필요 서류 자동 생성'));

    expect(rendered.container.textContent).toContain(
      '상업송장과 포장명세서에 표시할 영문 품명을 입력해주세요.'
    );
    act(() => generateButton?.click());
    expect(rendered.onGenerate).not.toHaveBeenCalled();
  });

  it('빈 영문 품명으로 문서 생성을 누르면 필수 안내를 표시한다', () => {
    const rendered = renderForm([{ ...firstItem, itemName: '' }]);
    const generateButton = Array.from(
      rendered.container.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('필요 서류 자동 생성'));

    act(() => generateButton?.click());
    expect(rendered.container.textContent).toContain(
      '영문 품명 Goods Description을 입력해주세요.'
    );
    expect(rendered.onGenerate).not.toHaveBeenCalled();
  });

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
    const buyerMatchesConsignee = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Buyer와 Consignee 동일'))
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');

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

  it('서명자를 회사명으로 복사하고 Open Account 및 L/C 조건부 필드를 제공한다', () => {
    const rendered = renderForm([firstItem], false, { paymentTerms: 'L/C', contactName: 'Gildong Hong' });
    const signerCheckbox = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('회사명과 서명자 동일'))
      ?.querySelector<HTMLInputElement>('input');

    act(() => signerCheckbox?.click());
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ signedBy: '인천테크' });
    expect(rendered.container.textContent).toContain('Open Account');
    expect(rendered.container.textContent).toContain('L/C No.');
    expect(rendered.container.textContent).toContain('L/C Date');
  });

  it('회사명 동일 상태에서는 서명자가 읽기 전용이며 해제 시 체크 전 거래 서명자를 복원한다', () => {
    const rendered = renderForm(
      [firstItem],
      false,
      { signedBy: '인천테크', contactName: '현재 프로필 담당자' },
      { isSignerSameAsCompany: true, signerNameBeforeCompany: 'Saved Trade Signer' },
      '현재 프로필 담당자',
    );
    const signerGroup = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent === '서명자 영문명')
      ?.parentElement;
    const signerInput = signerGroup?.querySelector<HTMLInputElement>('input.form-input');
    const checkbox = signerGroup?.querySelector<HTMLInputElement>('input[type="checkbox"]');

    expect(signerInput?.readOnly).toBe(true);
    act(() => checkbox?.click());
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ signedBy: 'Saved Trade Signer' });
  });

  it('체크 전 서명자가 없으면 해제 시 현재 회원프로필 담당자를 사용한다', () => {
    const rendered = renderForm(
      [firstItem],
      false,
      { signedBy: '인천테크', contactName: '거래 내 담당자' },
      { isSignerSameAsCompany: true, signerNameBeforeCompany: '' },
      'Profile Contact',
    );
    const checkbox = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('회사명과 서명자 동일'))
      ?.querySelector<HTMLInputElement>('input');

    act(() => checkbox?.click());
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ signedBy: 'Profile Contact' });
  });

  it('화인 없음 체크 시 N/M을 설정하고 기존 화인을 보관한다', () => {
    const rendered = renderForm([firstItem], false, { shippingMarks: 'SEOUL / C/NO. 1-2' });
    const noMarksCheckbox = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('화인 없음'))
      ?.querySelector<HTMLInputElement>('input');

    act(() => noMarksCheckbox?.click());
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ shippingMarks: 'N/M' });
    expect(rendered.onSupplementalChange).toHaveBeenCalledWith(expect.objectContaining({
      hasNoShippingMarks: true,
      shippingMarksBeforeNoMarks: 'SEOUL / C/NO. 1-2',
    }));
  });

  it('검증된 추천은 자동 입력하지 않고 적용 버튼을 누른 품목에만 반영한다', async () => {
    vi.useFakeTimers();
    recommendMock.mockResolvedValue({
      suggestions: [{
        code: '6109101000',
        formattedCode: '6109.10-1000',
        koreanName: '면으로 만든 것',
        englishName: 'Of cotton',
        classificationName: '(티셔츠)',
        reasoning: '면 소재와 완제품 형태가 후보 설명에 부합',
        confidenceLabel: '높음',
        source: 'openai-verified',
      }],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    });
    const detailedItem = {
      ...firstItem,
      itemName: '성인용 면 편물 티셔츠',
      hsCode: '',
    };
    const rendered = renderForm([detailedItem]);

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    expect(rendered.container.textContent).toContain('높은 일치 가능성');
    expect(rendered.container.textContent).not.toContain('94%');
    expect(rendered.onItemsChange).not.toHaveBeenCalled();

    const applyButton = Array.from(
      rendered.container.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent === '적용');
    act(() => applyButton?.click());

    expect(rendered.onItemsChange).toHaveBeenCalledWith([
      { ...detailedItem, hsCode: '6109101000' },
    ]);
  });

  it('후보가 없으면 추가정보 안내만 표시한다', async () => {
    vi.useFakeTimers();
    recommendMock.mockResolvedValue({
      suggestions: [],
      additionalInformationRequired: true,
      requiredAdditionalInfo: ['재질', '제품 용도'],
    });
    const rendered = renderForm([{
      ...firstItem,
      itemName: '산업용 부품 제품',
      hsCode: '',
    }]);

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    expect(rendered.container.textContent).toContain(
      '현재 입력과 충분히 관련된 관세청 HS Code 후보를 찾지 못했습니다.'
    );
    expect(rendered.container.textContent).toContain(
      '재질'
    );
    expect(
      Array.from(rendered.container.querySelectorAll('button'))
        .some((button) => button.textContent === '적용')
    ).toBe(false);
  });

  it('보통 후보와 추가 확인사항을 함께 표시한다', async () => {
    vi.useFakeTimers();
    recommendMock.mockResolvedValue({
      suggestions: [{
        code: '6109101000',
        formattedCode: '6109.10-1000',
        koreanName: '면으로 만든 것',
        englishName: 'Of cotton',
        classificationName: '(티셔츠)',
        reasoning: '면 편물 티셔츠와 관련 있는 후보',
        confidenceLabel: '보통',
        distinguishingFactors: ['면 소재', '편물제'],
        missingInformation: ['성인용 또는 아동용 여부'],
        source: 'openai-verified',
      }],
      additionalInformationRequired: true,
      requiredAdditionalInfo: ['성인용 또는 아동용 여부'],
    });
    const rendered = renderForm([{
      ...firstItem,
      itemName: "Men's cotton knitted T-shirt",
      hsCode: '',
    }]);

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    expect(rendered.container.textContent).toContain('추가 확인 필요');
    expect(rendered.container.textContent).toContain(
      '구분 조건: 면 소재, 편물제'
    );
    expect(rendered.container.textContent).toContain(
      '성인용 또는 아동용 여부'
    );
    expect(
      Array.from(rendered.container.querySelectorAll('button'))
        .some((button) => button.textContent === '적용')
    ).toBe(true);
  });
});
