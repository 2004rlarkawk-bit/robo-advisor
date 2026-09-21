// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShipperItem, ShipperSupplementalState, TradeProfile } from '../types';
import { EMPTY_SHIPPER_SUPPLEMENTAL_STATE } from '../utils/shipperForm';

const { recommendMock, frequentPartnersMock } = vi.hoisted(() => ({
  recommendMock: vi.fn(),
  frequentPartnersMock: vi.fn(),
}));

vi.mock('../services/shipperHSCodeSuggestionService', () => ({
  recommendShipperHSCode: recommendMock,
  normalizeHSKCode: (code: string) => code.replace(/[\s.-]/g, ''),
}));

vi.mock('../services/frequentTradePartnerService', () => ({
  fetchFrequentTradePartners: frequentPartnersMock,
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
  frequentPartnersMock.mockReset();
  frequentPartnersMock.mockResolvedValue([]);
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
  userId?: string,
) {
  const onItemsChange = vi.fn();
  const onProfilePatch = vi.fn();
  const onSupplementalChange = vi.fn();
  const onGenerate = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  let currentProfileOverride = profileOverride;
  let currentItems = items;
  const renderCurrent = () => act(() => {
    root?.render(
      <ShipperWorkspaceForm
        profile={{ ...profile, ...currentProfileOverride }}
        items={currentItems}
        supplemental={{
          ...EMPTY_SHIPPER_SUPPLEMENTAL_STATE,
          buyerMatchesConsignee: linked,
          consigneeMatchesNotifyParty: linked,
          ...supplementalOverride,
        }}
        isProcessing={false}
        profileSignerDefault={profileSignerDefault}
        userId={userId}
        onProfilePatch={onProfilePatch}
        onItemsChange={onItemsChange}
        onSupplementalChange={onSupplementalChange}
        onReset={vi.fn()}
        onGenerate={onGenerate}
      />,
    );
  });
  const renderItems = (nextItems: ShipperItem[]) => {
    currentItems = nextItems;
    renderCurrent();
  };
  renderCurrent();
  return {
    container,
    onItemsChange,
    onProfilePatch,
    onSupplementalChange,
    onGenerate,
    rerenderItems: renderItems,
    rerenderProfile: (nextProfileOverride: Partial<TradeProfile>) => {
      currentProfileOverride = nextProfileOverride;
      renderCurrent();
    },
  };
}

describe('화주용 통관 입력 폼', () => {
  it('자주 거래한 거래처의 최신 Buyer·Consignee·Notify Party 전체와 동일 체크 상태를 불러온다', async () => {
    const shared = { name: 'Global Import LLC', address: '250 Market Street', country: 'US', contactName: '', contact: '', businessNumber: '', taxNumber: '' };
    frequentPartnersMock.mockResolvedValueOnce([{
      key: 'global', transactionCount: 8, lastTransactionDate: '2026-08-12T00:00:00Z',
      buyer: shared,
      consignee: { ...shared },
      notifyParty: { ...shared },
    }]);
    const rendered = renderForm([firstItem], false, {}, {}, '', 'user-a');

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(frequentPartnersMock).toHaveBeenCalledTimes(1);
    expect(frequentPartnersMock).toHaveBeenCalledWith('user-a');
    expect(rendered.container.textContent).toContain('8회 거래 · 최근 거래 2026.08.12');
    rendered.rerenderProfile({ buyerName: '직접 수정한 Buyer' });
    expect(frequentPartnersMock).toHaveBeenCalledTimes(1);

    const loadButton = Array.from(rendered.container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '불러오기');
    act(() => loadButton?.click());

    expect(rendered.onProfilePatch).toHaveBeenCalledWith({
      buyerName: shared.name,
      buyerAddress: shared.address,
      buyerCountry: shared.country,
      partnerName: shared.name,
      partnerAddress: shared.address,
      partnerCountry: shared.country,
      notifyPartyName: shared.name,
      notifyPartyAddress: shared.address,
    });
    expect(rendered.onSupplementalChange).toHaveBeenCalledWith(expect.objectContaining({
      buyerMatchesConsignee: true,
      consigneeMatchesNotifyParty: true,
    }));
  });

  it('추천 조회가 실패해도 빈 상태와 직접 입력 필드를 유지한다', async () => {
    frequentPartnersMock.mockRejectedValueOnce(new Error('network'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rendered = renderForm([firstItem], false, {}, {}, '', 'user-a');

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(rendered.container.textContent).toContain('저장된 거래처가 없습니다.');
    expect(Array.from(rendered.container.querySelectorAll('label')).some((label) => label.textContent === 'Buyer 회사명')).toBe(true);
    warn.mockRestore();
  });
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
    rendered.onProfilePatch.mockClear();
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
      .find((label) => label.textContent?.startsWith('회사명(상호명)'))
      ?.parentElement?.querySelector<HTMLInputElement>('input');

    expect(companyInput?.value).toBe('인천테크');
    expect(companyInput?.readOnly).toBe(false);

    act(() => {
      if (!companyInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(companyInput, 'Changed Exporter Co., Ltd.');
      companyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ companyName: 'Changed Exporter Co., Ltd.' });
  });

  it('수출신고서용 선택 입력은 exportDeclaration에 모아 저장한다', () => {
    const rendered = renderForm([firstItem], false, { exportDeclaration: { ownerCeoName: '홍길동' } });
    const findControl = <T extends HTMLElement>(labelStart: string, selector: string) => Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent?.startsWith(labelStart))
      ?.parentElement?.querySelector<T>(selector);

    const customsInput = findControl<HTMLInputElement>('통관고유부호', 'input');
    act(() => {
      if (!customsInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(customsInput, 'ABC1234567890');
      customsInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({
      exportDeclaration: { ownerCeoName: '홍길동', customsCode: 'ABC1234567890' },
    });

    const tradeKindSelect = findControl<HTMLSelectElement>('수출 거래 형태', 'select');
    act(() => {
      if (!tradeKindSelect) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(tradeKindSelect, 'GENERAL');
      tradeKindSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({
      exportDeclaration: { ownerCeoName: '홍길동', tradeKind: 'GENERAL' },
    });
  });

  it('L/C 결제일 때만 L/C 종류를 고른다', () => {
    const tt = renderForm([firstItem], false, { paymentTerms: 'T/T' });
    expect(tt.container.textContent).not.toContain('L/C 종류');
  });

  it('서명자 입력칸 없이 Open Account 및 L/C 조건부 필드를 제공한다', () => {
    const rendered = renderForm([firstItem], false, { paymentTerms: 'L/C', contactName: 'Gildong Hong' });

    expect(rendered.container.textContent).not.toContain('서명자 영문명');
    expect(rendered.container.textContent).not.toContain('회사명과 서명자 동일');
    expect(rendered.container.textContent).toContain('Open Account');
    expect(rendered.container.textContent).toContain('L/C No.');
    expect(rendered.container.textContent).toContain('L/C Date');
  });

  it('품목 단위는 한국어 설명을 병기하고 실제 영문 코드만 전달한다', () => {
    const rendered = renderForm();
    const unitSelect = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent?.startsWith('단위'))
      ?.parentElement?.querySelector<HTMLSelectElement>('select');
    const optionLabels = Array.from(unitSelect?.options ?? []).map((option) => option.textContent);

    expect(optionLabels).toContain('PCS (개)');
    expect(optionLabels).toContain('EA (개)');
    expect(optionLabels).toContain('PAIR (켤레)');
    expect(optionLabels).toContain('M² (제곱미터)');
    expect(optionLabels).toContain('기타');

    act(() => {
      if (!unitSelect) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(unitSelect, 'PAIR');
      unitSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(rendered.onItemsChange).toHaveBeenLastCalledWith([{ ...firstItem, unit: 'PAIR' }]);
  });

  it('기타 단위는 직접 입력한 영문 값을 품목 데이터로 전달한다', () => {
    const rendered = renderForm([{ ...firstItem, unit: '' }]);
    const customUnitInput = rendered.container.querySelector<HTMLInputElement>('input[aria-label="기타 단위 직접 입력"]');

    expect(customUnitInput).not.toBeNull();
    act(() => {
      if (!customUnitInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(customUnitInput, 'DOZ');
      customUnitInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rendered.onItemsChange).toHaveBeenLastCalledWith([{ ...firstItem, unit: 'DOZ' }]);
  });

  it('수출 화주용 거래조건 옵션과 한국어 결제 라벨만 표시한다', () => {
    const rendered = renderForm();
    const incotermsSelect = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent?.startsWith('Incoterms'))
      ?.parentElement?.querySelector<HTMLSelectElement>('select');
    const incotermsValues = Array.from(incotermsSelect?.options ?? []).map((option) => option.value);

    expect(incotermsValues).toEqual(['', 'FOB', 'CFR', 'CIF', 'FAS', 'FCA']);
    expect(rendered.container.textContent).toContain('T/T (전신송금)');
    expect(rendered.container.textContent).toContain('Open Account (외상거래)');
  });

  it('Incoterms에 맞춰 지정 장소 칸 이름·체크박스가 바뀌고 해당 항만에 자동 연결된다', () => {
    const rendered = renderForm();
    const placeGroup = () => rendered.container.querySelector('.shipper-incoterms-place');
    const checkbox = (text: string) => Array.from(placeGroup()?.querySelectorAll('label') ?? [])
      .find((label) => label.textContent?.includes(text))?.querySelector<HTMLInputElement>('input');

    // FOB: 지정 선적항 — 선적항과 동일만 보이고 자동으로 체크된다.
    expect(placeGroup()?.textContent).toContain('지정 선적항');
    expect(checkbox('선적항과 동일')?.checked).toBe(true);
    expect(checkbox('도착항과 동일')).toBeUndefined();
    expect(rendered.onSupplementalChange).toHaveBeenCalledWith(expect.objectContaining({ incotermsPlace: 'Incheon Port' }));

    // CIF로 바꾸면 지정 도착항에 연결되고, 도착항 변경도 따라간다.
    rendered.rerenderProfile({ incoterms: 'CIF', dischargePort: 'TOKYO' });
    expect(placeGroup()?.textContent).toContain('지정 도착항');
    expect(checkbox('도착항과 동일')?.checked).toBe(true);
    expect(checkbox('선적항과 동일')).toBeUndefined();
    expect(rendered.onSupplementalChange).toHaveBeenCalledWith(expect.objectContaining({ incotermsPlace: 'Tokyo Port' }));

    // 체크를 풀면 직접 입력할 수 있고, 장소를 비우지는 않는다.
    rendered.onSupplementalChange.mockClear();
    act(() => checkbox('도착항과 동일')?.click());
    expect(checkbox('도착항과 동일')?.checked).toBe(false);
    expect(rendered.onSupplementalChange).not.toHaveBeenCalledWith(expect.objectContaining({ incotermsPlace: '' }));

    // FCA는 내륙 인도장소일 수 있어 자동 연결하지 않는다.
    rendered.rerenderProfile({ incoterms: 'FCA' });
    expect(placeGroup()?.textContent).toContain('지정 인도장소');
    expect(checkbox('선적항과 동일')?.checked).toBe(false);
  });

  it('임시저장에서 직접 적어 둔 지정 장소는 자동 연결로 덮어쓰지 않는다', () => {
    const rendered = renderForm([firstItem], false, {}, { incotermsPlace: 'Pyeongtaek Port' });
    const loadCheckbox = Array.from(rendered.container.querySelectorAll('.shipper-incoterms-place label'))
      .find((label) => label.textContent?.includes('선적항과 동일'))?.querySelector<HTMLInputElement>('input');
    expect(loadCheckbox?.checked).toBe(false);
    expect(rendered.onSupplementalChange).not.toHaveBeenCalledWith(expect.objectContaining({ incotermsPlace: 'Incheon Port' }));
  });

  it('수출 전용 항만과 기타 직접입력을 제공하고 영문 실제값을 전달한다', () => {
    const rendered = renderForm([firstItem], false, { loadPort: '', dischargePort: '' });
    const polGroup = rendered.container.querySelector('[data-field="loadPort"]');
    const podGroup = rendered.container.querySelector('[data-field="dischargePort"]');
    const polSelect = polGroup?.querySelector<HTMLSelectElement>('select');
    const podSelect = podGroup?.querySelector<HTMLSelectElement>('select');

    expect(polSelect?.textContent).toContain('기타 국내항');
    expect(polSelect?.textContent).not.toContain('Shanghai');
    expect(podSelect?.textContent).toContain('Tokyo Port (도쿄항)');
    expect(podSelect?.textContent).toContain('기타 해외항');
    expect(podSelect?.textContent).not.toContain('Busan Port');

    act(() => {
      if (!podSelect) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(podSelect, 'Tokyo Port');
      podSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ dischargePort: 'Tokyo Port' });

    act(() => {
      if (!polSelect) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(polSelect, '__OTHER_DOMESTIC_PORT__');
      polSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const customPolInput = polGroup?.querySelector<HTMLInputElement>('input[aria-label="기타 국내항 직접 입력"]');
    expect(customPolInput).not.toBeNull();
    act(() => {
      if (!customPolInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(customPolInput, 'Masan Port');
      customPolInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ loadPort: 'Masan Port' });
  });

  it('항만 및 일정에는 ETD와 운송방식만 남고 미정이 기본값이다', () => {
    const rendered = renderForm([firstItem], false, { loadingMode: undefined });
    const transportSelect = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent === '운송방식')
      ?.parentElement?.querySelector<HTMLSelectElement>('select');

    expect(transportSelect?.value).toBe('');
    expect(Array.from(transportSelect?.options ?? []).map((option) => option.textContent))
      .toEqual(['미정', 'FCL', 'LCL']);
    expect(rendered.container.textContent).not.toContain('도착 예정일 ETA');
    expect(rendered.container.textContent).not.toContain('송장 작성일');
    expect(rendered.container.textContent).not.toContain('선박명 Vessel');
  });

  it('포장종류는 한국어 설명을 병기하고 레거시 복수형 값을 호환 표시한다', () => {
    const rendered = renderForm([firstItem], false, { packageType: 'CTNS' });
    const packageSelect = Array.from(rendered.container.querySelectorAll('label'))
      .find((label) => label.textContent === '포장 종류')
      ?.parentElement?.querySelector<HTMLSelectElement>('select');
    const optionLabels = Array.from(packageSelect?.options ?? []).map((option) => option.textContent);

    expect(packageSelect?.value).toBe('CARTON');
    expect(optionLabels).toContain('Carton (카톤/상자)');
    expect(optionLabels).toContain('Crate (목상자)');
    expect(optionLabels).toContain('Piece (개별포장)');
    expect(optionLabels).toContain('기타');

    act(() => {
      if (!packageSelect) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(packageSelect, 'PALLET');
      packageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ packageType: 'PALLET' });
  });

  it('기타 포장종류는 직접 입력한 영문 값을 저장 데이터로 전달한다', () => {
    const rendered = renderForm([firstItem], false, { packageType: 'SACK' });
    const customInput = rendered.container.querySelector<HTMLInputElement>('input[aria-label="기타 포장종류 직접 입력"]');

    expect(customInput?.value).toBe('SACK');
    act(() => {
      if (!customInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(customInput, 'woven sack');
      customInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ packageType: 'WOVEN SACK' });
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

describe('원산지 안내 카드 다시 열기', () => {
  it('확인으로 닫은 원산지 안내 카드는 고칠 항목을 다시 누르면(fixRevealKey 변경) 다시 보인다', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const renderWithKey = (fixRevealKey: number) => act(() => {
      root?.render(
        <ShipperWorkspaceForm
          profile={{ ...profile, countryOfOrigin: 'South Korea' }}
          items={[firstItem]}
          supplemental={EMPTY_SHIPPER_SUPPLEMENTAL_STATE}
          isProcessing={false}
          onProfilePatch={vi.fn()}
          onItemsChange={vi.fn()}
          onSupplementalChange={vi.fn()}
          onReset={vi.fn()}
          onGenerate={vi.fn()}
          originIssueActive
          fixRevealKey={fixRevealKey}
        />,
      );
    });
    const originCard = () => Array.from(container!.querySelectorAll('.inline-fix-card'))
      .find((card) => card.textContent?.includes('대외무역법'));

    renderWithKey(1);
    expect(originCard()).toBeDefined();
    const confirm = Array.from(originCard()!.querySelectorAll('button')).find((button) => button.textContent === '확인');
    act(() => confirm?.click());
    expect(originCard()).toBeUndefined();

    renderWithKey(2);
    expect(originCard()).toBeDefined();
  });
});

describe('결제조건과 맞지 않게 남은 L/C 정보', () => {
  it('D/A인데 L/C Date가 남아 있으면 그 칸을 보여주고 [L/C 정보 지우기]로 비운다', () => {
    const rendered = renderForm([firstItem], false, { paymentTerms: 'D/A', lcDate: '2026-09-25' });
    const lcDate = rendered.container.querySelector('[data-field="lcDate"]');
    expect(lcDate?.className).toContain('lc-leftover');
    expect(rendered.container.querySelector('[data-field="lcNo"]')?.className).not.toContain('lc-leftover');
    const clear = Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent === 'L/C 정보 지우기');
    act(() => clear?.click());
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ lcNo: '', lcDate: '', lcBank: '' });
  });

  it('L/C 값이 없고 L/C 결제도 아니면 L/C 칸을 보이지 않는다', () => {
    const rendered = renderForm([firstItem], false, { paymentTerms: 'T/T', lcNo: '', lcDate: '' });
    expect(rendered.container.querySelector('[data-field="lcDate"]')).toBeNull();
    expect(rendered.container.textContent).not.toContain('L/C 정보 지우기');
  });
});

describe('포장 정보 — 화물 크기 기반 CBM 자동 계산', () => {
  const dimensionInput = (rendered: { container: HTMLDivElement }, label: string) =>
    rendered.container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

  const cbmInput = (rendered: { container: HTMLDivElement }) =>
    rendered.container.querySelector<HTMLInputElement>('#shipper-cbm-input');

  it('계산한 CBM을 입력칸에 채워 보여주고 자동 계산이라고 알린다', () => {
    const rendered = renderForm([firstItem], false, {
      packageDimensions: [{ id: 'dim-1', width: 45, length: 20, height: 41, boxes: 10 }],
    });
    const cbmGroup = rendered.container.querySelector('[data-field="measurement"]');
    expect(cbmGroup?.textContent).toContain('자동 계산');
    expect(cbmInput(rendered)?.value).toBe('0.369');
    expect(cbmInput(rendered)?.readOnly).toBe(false);
  });

  it('CBM을 직접 고치면 직접 입력으로 표시하고 그 값을 그대로 넘긴다', () => {
    const rendered = renderForm([firstItem], false, {
      packageDimensions: [{ id: 'dim-1', width: 45, length: 20, height: 41, boxes: 10 }],
    });
    const input = cbmInput(rendered);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '0.5');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ measurement: '0.5', measurementManual: true });
  });

  it('직접 입력한 CBM은 규격을 고쳐도 덮어쓰지 않는다', () => {
    const rendered = renderForm([firstItem], false, {
      packageDimensions: [{ id: 'dim-1', width: 45, length: 20, height: 41, boxes: 10 }],
      measurement: '0.5',
      measurementManual: true,
    });
    const cbmGroup = rendered.container.querySelector('[data-field="measurement"]');
    expect(cbmGroup?.textContent).toContain('직접 입력');
    expect(cbmInput(rendered)?.value).toBe('0.5');

    const boxes = dimensionInput(rendered, '규격 1 박스 수');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(boxes, '20');
      boxes!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const calls = rendered.onProfilePatch.mock.calls;
    const patch = calls[calls.length - 1]?.[0];
    expect(patch).not.toHaveProperty('measurement');
    expect(patch.packageCount).toBe(20);
  });

  it('[계산값으로 되돌리기]를 누르면 규격에서 계산한 값으로 되돌린다', () => {
    const rendered = renderForm([firstItem], false, {
      packageDimensions: [{ id: 'dim-1', width: 45, length: 20, height: 41, boxes: 10 }],
      measurement: '0.5',
      measurementManual: true,
    });
    const reset = Array.from(rendered.container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('계산값으로 되돌리기'));
    act(() => reset?.click());
    expect(rendered.onProfilePatch).toHaveBeenCalledWith({ measurement: '0.369', measurementManual: false });
  });

  it('화물 크기 안내문과 단위 선택(cm 기본)을 보여준다', () => {
    const rendered = renderForm();
    expect(rendered.container.textContent).toContain('최종 포장 후 화물의 외부 크기를 입력해 주세요.');
    const unit = rendered.container.querySelector<HTMLSelectElement>('select[aria-label="화물 크기 단위"]');
    expect(unit?.value).toBe('cm');
    expect(Array.from(unit?.options ?? []).map((option) => option.value)).toEqual(['cm', 'm', 'mm', 'inch']);
  });

  it('크기를 채우면 CBM과 포장 수량을 함께 다시 계산해 넘긴다', () => {
    const rendered = renderForm([firstItem], false, {
      packageDimensions: [{ id: 'dim-1', width: 45, length: 20, height: 41, boxes: '' }],
    });
    const boxes = dimensionInput(rendered, '규격 1 박스 수');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(boxes, '10');
      boxes!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rendered.onProfilePatch).toHaveBeenCalledWith(expect.objectContaining({
      measurement: '0.369',
      packageCount: 10,
    }));
  });

  it('규격이 다른 포장을 추가하면 각각 계산해 총 CBM과 총 박스 수를 합산한다', () => {
    const rendered = renderForm([firstItem], false, {
      packageDimensions: [
        { id: 'dim-1', width: 45, length: 20, height: 41, boxes: 5 },
        { id: 'dim-2', width: 60, length: 40, height: 30, boxes: 3 },
      ],
    });
    expect(rendered.container.querySelector<HTMLInputElement>('#shipper-cbm-input')?.value).toBe('0.401');
    const packageCount = rendered.container.querySelector<HTMLInputElement>('input[readonly][value="8"]');
    expect(packageCount).not.toBeNull();
  });

  it('[다른 규격 화물 추가]를 누르면 빈 규격 줄을 하나 더 넘긴다', () => {
    const rendered = renderForm([firstItem], false, {
      packageDimensions: [{ id: 'dim-1', width: 45, length: 20, height: 41, boxes: 10 }],
    });
    const add = Array.from(rendered.container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('다른 규격 화물 추가'));
    act(() => add?.click());
    const calls = rendered.onProfilePatch.mock.calls;
    const patch = calls[calls.length - 1]?.[0];
    expect(patch.packageDimensions).toHaveLength(2);
    expect(patch.packageDimensions[1]).toMatchObject({ width: '', length: '', height: '', boxes: '' });
  });

  it('크기를 아직 넣지 않으면 CBM은 계산하지 않고 안내만 보여준다', () => {
    const rendered = renderForm();
    const cbmGroup = rendered.container.querySelector('[data-field="measurement"]');
    expect(rendered.container.querySelector<HTMLInputElement>('#shipper-cbm-input')?.value).toBe('');
    expect(cbmGroup?.textContent).toContain('박스 수를 넣으면 자동으로 계산됩니다');
  });
});
